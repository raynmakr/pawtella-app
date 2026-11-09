// Franpos export bot against a tiny local "back office" (login form → report page → CSV download / table)
// and a fake import endpoint. No real Franpos needed; needs Playwright chromium (skips when unavailable).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, readEnv, tableToCsv, postCsv, runExport } from '../scripts/franpos-bot/export-inventory.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleCsv = fs.readFileSync(path.join(here, '..', 'scripts', 'sample-franpos-inventory.csv'), 'utf8');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const b = await chromium.launch({ headless: true });
  await b.close();
} catch (err) {
  console.warn('[franpos-bot.test] Playwright chromium unavailable, browser tests skipped:', err.message.split('\n')[0]);
  chromium = null;
}

// ---- fixture server ---------------------------------------------------------------------------
const received = [];
let server;
let base;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'franpos-bot-'));

const page = (body) => `<!doctype html><html><head><title>Franpos Fixture</title></head><body>${body}</body></html>`;
const tableHtml = () => {
  const [h, ...rows] = sampleCsv.trim().split('\n').slice(0, 6);
  const cells = (line, tag) => line.split(',').map((c) => `<${tag}>${c}</${tag}>`).join('');
  return `<table id="inv"><thead><tr>${cells(h, 'th')}</tr></thead><tbody>${rows.map((r) => `<tr>${cells(r, 'td')}</tr>`).join('')}</tbody></table>`;
};

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const authed = (req.headers.cookie || '').includes('sid=ok');
    if (url.pathname === '/login' && req.method === 'GET') {
      return res.end(page(`<form method="post" action="/login"><input name="user_name" placeholder="User name"><input type="password" name="pwd"><button type="submit">Log in</button></form>`));
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      return req.on('end', () => {
        const p = new URLSearchParams(body);
        if (p.get('user_name') === 'owner' && p.get('pwd') === 'secret') {
          res.writeHead(302, { 'Set-Cookie': 'sid=ok; Path=/', Location: '/dashboard' });
        } else res.writeHead(401);
        res.end();
      });
    }
    if (url.pathname === '/api/inventory/import' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      return req.on('end', () => {
        received.push({ headers: req.headers, body });
        if (req.headers['x-import-secret'] !== 's3cret') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Invalid X-Import-Secret' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, imported: { rowCount: body.trim().split('\n').length - 1, created: 1, updated: 2, unchanged: 0, wentOutOfStock: [], backInStock: [], errors: [] }, pushed: { created: 1, updated: 2, failed: 0 } }));
      });
    }
    if (!authed) {
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }
    if (url.pathname === '/dashboard') return res.end(page(`<nav id="main"><a href="/report">Inventory</a><a href="/logout">Logout</a></nav><h1>Dashboard</h1>`));
    if (url.pathname === '/report') {
      return res.end(page(`<nav id="main"></nav><select id="location"><option value="1">Downtown</option><option value="2">Toronto Depot</option></select>
        <a id="export" href="/export.csv" download="inventory.csv">Export CSV</a>${tableHtml()}`));
    }
    if (url.pathname === '/export.csv') {
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="inventory.csv"' });
      return res.end(sampleCsv);
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(outDir, { recursive: true, force: true });
});

const fixtureConfig = () => ({
  login: { usernameSelector: "input[name='user_name']", passwordSelector: "input[name='pwd']", submitSelector: "button:has-text('Log in')", successSelector: 'nav#main', timeoutMs: 10_000 },
  report: {
    url: `${base}/report`,
    mode: 'download',
    steps: [{ action: 'select', selector: '#location', value: '2' }, { action: 'waitFor', selector: '#export' }],
    downloadSelector: '#export',
    downloadTimeoutMs: 10_000,
    table: { selector: '#inv', columnMap: { 'Item Number': 'SKU' } },
  },
  navigationTimeoutMs: 10_000,
});

// ---- pure --------------------------------------------------------------------------------------

test('loadConfig applies defaults, strips $comment keys and validates', () => {
  const cfg = loadConfig(path.join(here, '..', 'scripts', 'franpos-bot', 'config.example.json'));
  assert.equal(cfg.report.mode, 'download');
  assert.ok(cfg.login.usernameSelector.includes('username'));
  assert.equal(cfg.report.steps[0].$comment, undefined);
  assert.equal(cfg.report.table.columnMap.$comment, undefined);
  assert.equal(cfg.report.table.columnMap.QOH, 'Quantity On Hand');
  const min = loadConfig({ report: { url: 'x' } });
  assert.equal(min.login.timeoutMs, 45_000);
  assert.throws(() => loadConfig({ report: { mode: 'pdf' } }), /report\.mode/);
  assert.throws(() => loadConfig({ report: { steps: [{ action: 'dance' }] } }), /unknown action/);
  assert.throws(() => loadConfig({ report: { steps: [{ action: 'click' }] } }), /selector required/);
  assert.throws(() => loadConfig({ report: { mode: 'download', downloadSelector: '' } }), /downloadSelector/);
});

test('readEnv reports missing variables', () => {
  assert.throws(() => readEnv({}), /FRANPOS_LOGIN_URL, FRANPOS_USERNAME, FRANPOS_PASSWORD/);
  const o = readEnv({ FRANPOS_LOGIN_URL: 'https://x/login', FRANPOS_USERNAME: 'a', FRANPOS_PASSWORD: 'b', API_URL: 'https://api/' });
  assert.equal(o.apiUrl, 'https://api');
  assert.ok(o.configPath.endsWith('config.example.json'));
});

test('tableToCsv renames headers, quotes cells and drops empty rows', () => {
  const csv = tableToCsv({ headers: [' Item ', 'QOH', 'Price'], rows: [['Zuke\'s "Mini", PB', '3', '$1.00'], ['', '', '']] }, { Item: 'Item Name', QOH: 'Quantity On Hand' });
  assert.equal(csv, 'Item Name,Quantity On Hand,Price\n"Zuke\'s ""Mini"", PB",3,$1.00\n');
});

test('postCsv sends the secret + text/csv and surfaces HTTP errors', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  const r = await postCsv('a,b\n1,2\n', { apiUrl: 'https://api.test', importSecret: 'k', fetchImpl });
  assert.deepEqual(r, { ok: true });
  assert.equal(calls[0].url, 'https://api.test/api/inventory/import');
  assert.equal(calls[0].init.headers['X-Import-Secret'], 'k');
  assert.equal(calls[0].init.headers['Content-Type'], 'text/csv');
  await assert.rejects(
    postCsv('x', { apiUrl: 'https://api.test', importSecret: 'k', fetchImpl: async () => ({ ok: false, status: 401, text: async () => '{"error":"nope"}' }) }),
    /HTTP 401 nope/,
  );
  await assert.rejects(postCsv('x', { apiUrl: '', importSecret: 'k', fetchImpl }), /API_URL/);
});

// ---- browser ---------------------------------------------------------------------------------

test('download mode: logs in, runs steps, saves the CSV and posts it', { skip: !chromium && 'chromium unavailable' }, async () => {
  received.length = 0;
  const logs = [];
  const r = await runExport({
    headless: true,
    config: fixtureConfig(),
    loginUrl: `${base}/login`,
    username: 'owner',
    password: 'secret',
    apiUrl: base,
    importSecret: 's3cret',
    outDir,
    browserType: chromium,
    log: (m) => logs.push(m),
  });
  assert.equal(r.rows, 30);
  assert.equal(r.filename, 'inventory.csv');
  assert.equal(fs.readFileSync(r.csvPath, 'utf8'), sampleCsv);
  assert.equal(received.length, 1);
  assert.equal(received[0].headers['x-import-secret'], 's3cret');
  assert.equal(received[0].headers['content-type'], 'text/csv');
  assert.equal(received[0].body, sampleCsv);
  assert.equal(r.summary.imported.rowCount, 30);
  assert.ok(logs.some((l) => /import ok: rows=30/.test(l)));
});

test('table mode scrapes the HTML table with the column map; --dry-run skips the upload', { skip: !chromium && 'chromium unavailable' }, async () => {
  received.length = 0;
  const cfg = fixtureConfig();
  cfg.report.mode = 'table';
  const r = await runExport({ headless: true, dryRun: true, config: cfg, loginUrl: `${base}/login`, username: 'owner', password: 'secret', apiUrl: base, importSecret: 's3cret', outDir, browserType: chromium, log: () => {} });
  assert.equal(received.length, 0);
  assert.equal(r.summary, null);
  const lines = r.csvText.trim().split('\n');
  assert.equal(lines.length, 6);
  assert.ok(lines[0].startsWith('SKU,UPC,Item Name,Department'));
  assert.ok(lines[1].startsWith('PW-FOOD-001,062786010014,Acana Grasslands Dog Food 11.4kg'));
});

test('failures exit with a screenshot and a step name; record mode writes element dumps', { skip: !chromium && 'chromium unavailable' }, async () => {
  const cfg = fixtureConfig();
  await assert.rejects(
    runExport({ headless: true, config: cfg, loginUrl: `${base}/login`, username: 'owner', password: 'wrong', apiUrl: base, importSecret: 's3cret', outDir, browserType: chromium, log: () => {} }),
    /\[login\]/,
  );
  assert.ok(fs.existsSync(path.join(outDir, 'last-error.png')));
  assert.match(fs.readFileSync(path.join(outDir, 'last-error.txt'), 'utf8'), /step: login/);

  await assert.rejects(
    runExport({ headless: true, config: cfg, loginUrl: `${base}/login`, username: 'owner', password: 'secret', apiUrl: base, importSecret: 'bad', outDir, browserType: chromium, log: () => {} }),
    /\[upload\] Import failed: HTTP 401/,
  );

  const r = await runExport({ record: true, headless: true, dryRun: true, config: cfg, loginUrl: `${base}/login`, username: 'owner', password: 'secret', apiUrl: base, importSecret: 's3cret', outDir, browserType: chromium, log: () => {} });
  assert.equal(r.rows, 30);
  const dump = JSON.parse(fs.readFileSync(path.join(outDir, 'elements-1-login.json'), 'utf8'));
  assert.ok(dump.inputs.some((i) => i.name === 'user_name'));
  assert.ok(fs.existsSync(path.join(outDir, 'step-3-report.png')));
});
