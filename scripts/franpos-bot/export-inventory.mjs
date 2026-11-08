#!/usr/bin/env node
// Franpos back-office export bot. Franpos has no public API, so this logs into the back office with
// Playwright, exports the inventory report (CSV download or an HTML table scrape), and POSTs it to
// `${API_URL}/api/inventory/import` with X-Import-Secret.
//
//   node scripts/franpos-bot/export-inventory.mjs            headless run (CI / cron)
//   node scripts/franpos-bot/export-inventory.mjs --record   headed (or step screenshots in CI) to discover selectors
//   node scripts/franpos-bot/export-inventory.mjs --dry-run  export only, do not POST
//
// Env: FRANPOS_LOGIN_URL, FRANPOS_USERNAME, FRANPOS_PASSWORD, FRANPOS_EXPORT_CONFIG (JSON selectors; default
// scripts/franpos-bot/config.example.json), API_URL, INVENTORY_IMPORT_SECRET. Everything DOM-specific lives in
// the config file so the owner can adjust it without touching code. On failure: exit 1 and out/last-error.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(here, 'out');
export const DEFAULT_CONFIG = path.join(here, 'config.example.json');

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

const DEFAULTS = {
  login: {
    usernameSelector: "input[name='username'], input[name='email'], input[type='email'], #username",
    passwordSelector: "input[name='password'], input[type='password'], #password",
    submitSelector: "button[type='submit'], input[type='submit']",
    successSelector: 'nav, [role=navigation], body',
    timeoutMs: 45_000,
  },
  report: {
    url: '',
    mode: 'download',
    steps: [],
    downloadSelector: "a:has-text('Export'), button:has-text('Export'), a[download], a[href$='.csv']",
    downloadTimeoutMs: 120_000,
    table: { selector: 'table', columnMap: {} },
  },
  navigationTimeoutMs: 60_000,
};

const stripComments = (obj) => {
  if (Array.isArray(obj)) return obj.map(stripComments);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (!k.startsWith('$')) out[k] = stripComments(v);
    return out;
  }
  return obj;
};

/** Load + validate the selectors config. Accepts a path or an already-parsed object. */
export function loadConfig(input = process.env.FRANPOS_EXPORT_CONFIG || DEFAULT_CONFIG) {
  const raw = typeof input === 'string' ? JSON.parse(fs.readFileSync(input, 'utf8')) : input;
  const c = stripComments(raw || {});
  const cfg = {
    ...DEFAULTS,
    ...c,
    login: { ...DEFAULTS.login, ...(c.login || {}) },
    report: { ...DEFAULTS.report, ...(c.report || {}), table: { ...DEFAULTS.report.table, ...(c.report?.table || {}) } },
  };
  if (!['download', 'table'].includes(cfg.report.mode)) throw new Error(`report.mode must be "download" or "table" (got "${cfg.report.mode}")`);
  if (!Array.isArray(cfg.report.steps)) throw new Error('report.steps must be an array');
  for (const [i, s] of cfg.report.steps.entries()) {
    if (!['click', 'fill', 'select', 'waitFor', 'wait', 'goto', 'check'].includes(s.action)) throw new Error(`report.steps[${i}]: unknown action "${s.action}"`);
    if (s.action !== 'wait' && s.action !== 'goto' && !s.selector) throw new Error(`report.steps[${i}]: selector required`);
  }
  if (cfg.report.mode === 'download' && !cfg.report.downloadSelector) throw new Error('report.downloadSelector is required in download mode');
  return cfg;
}

/** Env → options. Throws on missing required values unless `partial`. */
export function readEnv(env = process.env, { partial = false } = {}) {
  const opts = {
    loginUrl: env.FRANPOS_LOGIN_URL || '',
    username: env.FRANPOS_USERNAME || '',
    password: env.FRANPOS_PASSWORD || '',
    configPath: env.FRANPOS_EXPORT_CONFIG || DEFAULT_CONFIG,
    apiUrl: (env.API_URL || '').replace(/\/$/, ''),
    importSecret: env.INVENTORY_IMPORT_SECRET || '',
  };
  if (!partial) {
    const missing = ['loginUrl', 'username', 'password'].filter((k) => !opts[k]);
    if (missing.length) throw new Error(`Missing env: ${missing.map((k) => ({ loginUrl: 'FRANPOS_LOGIN_URL', username: 'FRANPOS_USERNAME', password: 'FRANPOS_PASSWORD' })[k]).join(', ')}`);
  }
  return opts;
}

// ---------------------------------------------------------------------------------------------
// Table scrape → CSV
// ---------------------------------------------------------------------------------------------

const csvCell = (v) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** rows: [{header: value}] or { headers, rows: string[][] } → CSV text, applying columnMap renames. */
export function tableToCsv({ headers, rows }, columnMap = {}) {
  const mapped = headers.map((h) => columnMap[h] ?? columnMap[h.trim()] ?? h.trim());
  const lines = [mapped.map(csvCell).join(',')];
  for (const r of rows) {
    if (!r.some((c) => String(c ?? '').trim())) continue;
    lines.push(mapped.map((_, i) => csvCell(r[i])).join(','));
  }
  return lines.join('\n') + '\n';
}

async function scrapeTable(page, { selector, columnMap }) {
  const table = page.locator(selector).first();
  await table.waitFor({ state: 'visible' });
  const data = await table.evaluate((t) => {
    const text = (el) => (el.innerText ?? el.textContent ?? '').trim();
    const trs = [...t.querySelectorAll('tr')];
    const headerRow = trs.find((tr) => tr.querySelector('th')) || trs[0];
    const headers = headerRow ? [...headerRow.children].map(text) : [];
    const rows = trs.filter((tr) => tr !== headerRow).map((tr) => [...tr.children].map(text));
    return { headers, rows };
  });
  if (!data.headers.length) throw new Error(`Table "${selector}" has no header row`);
  return tableToCsv(data, columnMap);
}

// ---------------------------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------------------------

export async function postCsv(csvText, { apiUrl, importSecret, filename = 'franpos-export.csv', fetchImpl = fetch }) {
  if (!apiUrl) throw new Error('API_URL is not set');
  const res = await fetchImpl(`${apiUrl}/api/inventory/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv', 'X-Import-Secret': importSecret || '', 'X-Filename': filename },
    body: csvText,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) throw new Error(`Import failed: HTTP ${res.status} ${json.error || text.slice(0, 200)}`);
  return json;
}

// ---------------------------------------------------------------------------------------------
// Browser flow
// ---------------------------------------------------------------------------------------------

async function runStep(page, step, cfg) {
  const t = { timeout: step.timeoutMs ?? cfg.navigationTimeoutMs };
  switch (step.action) {
    case 'goto':
      return page.goto(step.url, { waitUntil: 'domcontentloaded', ...t });
    case 'click':
      return page.locator(step.selector).first().click(t);
    case 'fill':
      return page.locator(step.selector).first().fill(String(step.value ?? ''), t);
    case 'select':
      return page.locator(step.selector).first().selectOption(step.value, t);
    case 'check':
      return page.locator(step.selector).first().check(t);
    case 'waitFor':
      return page.locator(step.selector).first().waitFor({ state: step.state || 'visible', ...t });
    case 'wait':
      return page.waitForTimeout(step.ms ?? 1000);
    default:
      throw new Error(`Unknown step action ${step.action}`);
  }
}

/** In --record mode: dump candidate selectors for inputs, buttons and links so the owner can fill config.json. */
async function recordElements(page, label) {
  const info = await page.evaluate(() => {
    const desc = (el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || undefined,
      id: el.id || undefined,
      name: el.getAttribute('name') || undefined,
      text: (el.innerText || el.value || '').trim().slice(0, 60) || undefined,
      href: el.getAttribute('href') || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
    });
    return {
      url: location.href,
      title: document.title,
      inputs: [...document.querySelectorAll('input, select, textarea')].slice(0, 100).map(desc),
      buttons: [...document.querySelectorAll('button, input[type=submit], [role=button]')].slice(0, 100).map(desc),
      links: [...document.querySelectorAll('a[href]')].slice(0, 300).map(desc),
      tables: [...document.querySelectorAll('table')].map((t) => ({ id: t.id || undefined, className: t.className || undefined, rows: t.rows.length })),
    };
  });
  fs.writeFileSync(path.join(OUT_DIR, `elements-${label}.json`), JSON.stringify(info, null, 2));
  await page.screenshot({ path: path.join(OUT_DIR, `step-${label}.png`), fullPage: true }).catch(() => {});
}

/**
 * Full run. Returns { csvPath, csvText, rows, summary }. Options override env for tests.
 */
export async function runExport({
  record = false,
  dryRun = false,
  headless,
  config,
  loginUrl,
  username,
  password,
  apiUrl,
  importSecret,
  outDir = OUT_DIR,
  fetchImpl,
  browserType,
  log = console.log,
} = {}) {
  const envOpts = readEnv(process.env, { partial: true });
  loginUrl ??= envOpts.loginUrl;
  username ??= envOpts.username;
  password ??= envOpts.password;
  apiUrl ??= envOpts.apiUrl;
  importSecret ??= envOpts.importSecret;
  const cfg = config && typeof config === 'object' && !('login' in config && typeof config.login === 'string') ? loadConfig(config) : loadConfig(config || envOpts.configPath);
  if (!loginUrl || !username || !password) throw new Error('FRANPOS_LOGIN_URL, FRANPOS_USERNAME and FRANPOS_PASSWORD are required');
  fs.mkdirSync(outDir, { recursive: true });

  const inCi = !!process.env.CI;
  const headed = record && !inCi && headless !== true;
  const { chromium } = browserType ? { chromium: browserType } : await import('playwright');
  const browser = await chromium.launch({ headless: headless ?? !headed, slowMo: headed ? 150 : 0 });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(cfg.navigationTimeoutMs);
  let step = 'start';
  const snap = async (label) => record && recordElements(page, label).catch(() => {});

  try {
    // 1. Login
    step = 'login';
    log(`[franpos-bot] opening ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await snap('1-login');
    await page.locator(cfg.login.usernameSelector).first().fill(username, { timeout: cfg.login.timeoutMs });
    await page.locator(cfg.login.passwordSelector).first().fill(password, { timeout: cfg.login.timeoutMs });
    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => {}),
      page.locator(cfg.login.submitSelector).first().click({ timeout: cfg.login.timeoutMs }),
    ]);
    await page.locator(cfg.login.successSelector).first().waitFor({ state: 'visible', timeout: cfg.login.timeoutMs });
    log('[franpos-bot] logged in');
    await snap('2-after-login');

    // 2. Report page + pre-steps
    step = 'report';
    if (cfg.report.url) await page.goto(cfg.report.url, { waitUntil: 'domcontentloaded' });
    await snap('3-report');
    for (const [i, s] of cfg.report.steps.entries()) {
      step = `report.steps[${i}] ${s.action}`;
      await runStep(page, s, cfg);
      await snap(`3-step-${i + 1}`);
    }

    // 3. Export
    step = `export (${cfg.report.mode})`;
    let csvText;
    let filename = `franpos-inventory-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    if (cfg.report.mode === 'download') {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: cfg.report.downloadTimeoutMs }),
        page.locator(cfg.report.downloadSelector).first().click(),
      ]);
      const suggested = download.suggestedFilename();
      if (suggested && !/\.csv$/i.test(suggested)) log(`[franpos-bot] warning: downloaded "${suggested}" is not a .csv; only CSV exports are supported`);
      const tmp = await download.path();
      csvText = fs.readFileSync(tmp, 'utf8');
      filename = suggested || filename;
    } else {
      csvText = await scrapeTable(page, cfg.report.table);
    }
    const rows = Math.max(0, csvText.trim().split(/\r?\n/).length - 1);
    const csvPath = path.join(outDir, 'last-export.csv');
    fs.writeFileSync(csvPath, csvText);
    log(`[franpos-bot] exported ${rows} rows → ${csvPath}`);
    if (!rows) throw new Error('Export produced no data rows');

    // 4. Upload
    let summary = null;
    if (dryRun) log('[franpos-bot] --dry-run: not posting to the API');
    else {
      step = 'upload';
      summary = await postCsv(csvText, { apiUrl, importSecret, filename, fetchImpl });
      const imp = summary.imported || {};
      log(`[franpos-bot] import ok: rows=${imp.rowCount} created=${imp.created} updated=${imp.updated} unchanged=${imp.unchanged} oos=${imp.wentOutOfStock?.length ?? 0} back=${imp.backInStock?.length ?? 0} errors=${imp.errors?.length ?? 0}; shopify pushed=${(summary.pushed?.created ?? 0) + (summary.pushed?.updated ?? 0)} failed=${summary.pushed?.failed ?? 0}`);
    }
    return { csvPath, csvText, rows, filename, summary };
  } catch (err) {
    const shot = path.join(outDir, 'last-error.png');
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(outDir, 'last-error.txt'), `${new Date().toISOString()}\nstep: ${step}\nurl: ${page.url()}\n${err.stack || err.message}\n`);
    err.step = step;
    err.message = `[${step}] ${err.message}`;
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const record = args.has('--record');
  const dryRun = args.has('--dry-run') || args.has('--dry');
  try {
    readEnv();
    const result = await runExport({ record, dryRun });
    if (result.summary) console.log(JSON.stringify(result.summary.imported ? { imported: { ...result.summary.imported, newSkus: undefined, changedSkus: undefined }, pushed: result.summary.pushed } : result.summary, null, 2));
    if (record) console.log(`[franpos-bot] recorded screenshots + element dumps in ${OUT_DIR}`);
  } catch (err) {
    console.error(`[franpos-bot] FAILED: ${err.message}`);
    console.error(`[franpos-bot] see ${path.join(OUT_DIR, 'last-error.png')} / last-error.txt`);
    process.exit(1);
  }
}
