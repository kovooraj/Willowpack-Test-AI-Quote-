#!/usr/bin/env node
/* Local preview that mimics Vercel for this repo: cleanUrls, vercel.json headers/rewrites, and /api/*.js functions.
   Usage: node scripts/dev-server.js [port]   (no dependencies) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.argv[2] || +process.env.PORT || 3000;
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

function toRegex(src) { return new RegExp('^' + src.replace(/\(\.\*\)/g, '(.*)').replace(/\/:path\*/g, '(?:/(.*))?') + '$'); }

function headersFor(p) {
  const out = {};
  (vercel.headers || []).forEach((h) => { if (toRegex(h.source).test(p)) h.headers.forEach((x) => { out[x.key] = x.value; }); });
  return out;
}
function rewrite(p) {
  for (const r of vercel.rewrites || []) if (toRegex(r.source).test(p)) return r.destination;
  return p;
}

function vercelRes(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };
  res.redirect = (a, b) => { const [code, loc] = b ? [a, b] : [302, a]; res.statusCode = code; res.setHeader('Location', loc); res.end(); return res; };
  return res;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname);
  Object.entries(headersFor(p)).forEach(([k, v]) => res.setHeader(k, v));
  p = rewrite(p);

  if (p.startsWith('/api/')) {
    const file = path.join(ROOT, p.replace(/\/$/, '') + '.js');
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      req.query = Object.fromEntries(url.searchParams);
      try { req.body = body && /json/.test(req.headers['content-type'] || '') ? JSON.parse(body) : body; } catch (e) { req.body = body; }
      delete require.cache[file];
      try { await require(file)(req, vercelRes(res)); } catch (e) { console.error(e); res.statusCode = 500; res.end('error'); }
    });
    return;
  }

  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  else if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('dev server on http://localhost:' + PORT));
