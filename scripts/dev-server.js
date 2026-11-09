#!/usr/bin/env node
// Local stand-in for Vercel's Node runtime: serves api/**/*.js on http://localhost:3000 with
// vercel.json rewrites, [param] dynamic segments, JSON body parsing, and res.status/json helpers.
// Usage: npm run dev   (PORT env to change the port)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import './load-env.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'api');
const port = parseInt(process.env.PORT || '3000', 10);
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const rewrites = (vercelConfig.rewrites || []).map(compileRewrite);
const moduleCache = new Map();

/** Compile a Vercel rewrite source like "/api/points/:path*" into a matcher. */
function compileRewrite({ source, destination }) {
  const names = [];
  const pattern = source
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        const star = part.endsWith('*');
        const name = part.slice(1, star ? -1 : undefined);
        names.push(name);
        return star ? '(.*)' : '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const re = new RegExp(`^${pattern}$`);
  return { re, names, destination };
}

/** Resolve a pathname to an api file, filling dynamic [param] segments. */
function resolveFile(pathnameStr) {
  const rel = pathnameStr.replace(/^\/api\/?/, '');
  const parts = rel.split('/').filter(Boolean);
  const params = {};
  function walk(dir, idx) {
    if (idx === parts.length) {
      for (const cand of ['index.js']) {
        const p = path.join(dir, cand);
        if (fs.existsSync(p)) return p;
      }
      return null;
    }
    const part = parts[idx];
    const isLast = idx === parts.length - 1;
    if (isLast) {
      const exact = path.join(dir, `${part}.js`);
      if (fs.existsSync(exact)) return exact;
    }
    const sub = path.join(dir, part);
    if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) {
      const r = walk(sub, idx + 1);
      if (r) return r;
    }
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    for (const e of entries) {
      const m = e.match(/^\[(\.\.\.)?([^\]]+)\](\.js)?$/);
      if (!m) continue;
      const [, spread, name, ext] = m;
      if (spread) {
        params[name] = parts.slice(idx).join('/');
        if (ext) return path.join(dir, e);
        const idxFile = path.join(dir, e, 'index.js');
        if (fs.existsSync(idxFile)) return idxFile;
        continue;
      }
      if (ext && isLast) {
        params[name] = part;
        return path.join(dir, e);
      }
      if (!ext && fs.statSync(path.join(dir, e)).isDirectory()) {
        params[name] = part;
        const r = walk(path.join(dir, e), idx + 1);
        if (r) return r;
        delete params[name];
      }
    }
    return null;
  }
  const file = walk(apiDir, 0);
  return { file, params };
}

async function loadModule(file) {
  if (!moduleCache.has(file)) {
    const url = pathToFileURL(file).href + `?t=${fs.statSync(file).mtimeMs}`;
    moduleCache.set(file, import(url));
  }
  return moduleCache.get(file);
}

function decorate(req, res, url, params) {
  const query = Object.fromEntries(url.searchParams.entries());
  req.query = { ...query, ...params };
  req.cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (data) => {
    if (Buffer.isBuffer(data)) {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/octet-stream');
      res.end(data);
    } else if (typeof data === 'object' && data !== null) {
      res.json(data);
    } else {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(String(data ?? ''));
    }
    return res;
  };
  res.redirect = (a, b) => {
    const [status, location] = typeof a === 'number' ? [a, b] : [302, a];
    res.statusCode = status;
    res.setHeader('Location', location);
    res.end();
    return res;
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://localhost:${port}`);
  let pathnameStr = url.pathname;
  let rewriteParams = {};

  // Non-/api routes used by landing pages: /p/:id, /r/:code, /partners
  for (const rw of rewrites) {
    const m = pathnameStr.match(rw.re);
    if (m) {
      rw.names.forEach((n, i) => (rewriteParams[n] = decodeURIComponent(m[i + 1] || '')));
      pathnameStr = rw.destination.replace(/:(\w+)\*?/g, (_, n) => rewriteParams[n] ?? '');
      break;
    }
  }
  if (!pathnameStr.startsWith('/api/')) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  const { file, params } = resolveFile(pathnameStr);
  if (!file) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `No function for ${pathnameStr}` }));
  }

  try {
    const mod = await loadModule(file);
    const handler = mod.default;
    const bodyParser = mod.config?.api?.bodyParser !== false;
    decorate(req, res, url, { ...rewriteParams, ...params });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const raw = await readBody(req);
      req.rawBody = raw;
      if (bodyParser && raw.length) {
        const ct = (req.headers['content-type'] || '').toLowerCase();
        if (ct.includes('application/json')) {
          try {
            req.body = JSON.parse(raw.toString('utf8'));
          } catch {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        } else if (ct.includes('application/x-www-form-urlencoded')) {
          req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')).entries());
        } else {
          req.body = raw.toString('utf8');
        }
      }
    }
    await handler(req, res);
  } catch (err) {
    console.error(`[dev] ${req.method} ${req.url} failed`, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  } finally {
    console.log(`${req.method} ${url.pathname} → ${res.statusCode} (${Date.now() - started}ms)`);
  }
});

server.listen(port, () => {
  console.log(`Pawtella API dev server → http://localhost:${port}`);
});
