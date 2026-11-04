/* Shared helpers for /api functions (files starting with _ are not routes on Vercel).
 * Login mirrors the BDO Pricing Engine: Google account on an allowed domain -> signed (HMAC) session cookie.
 * Env (Vercel project settings):
 *   GOOGLE_CLIENT_ID        same OAuth client as the Pricing Engine (add this site under "Authorized JavaScript origins")
 *   ADMIN_EMAIL_DOMAINS     optional, default "sinalite.com,willowpack.com"
 *   ADMIN_EMAILS            optional, extra individual addresses
 *   SUPABASE_READ_TOKEN     read token for public.ai_chat_list / ai_chat_get (scope 'read' in ai_inbound_sales_chat.api_tokens)
 *   SESSION_SECRET          optional; HMAC key for the session cookie (falls back to a key derived from SUPABASE_READ_TOKEN)
 *   SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY  optional overrides (publishable key is not a secret)
 */
'use strict';
const crypto = require('crypto');

const COOKIE = 'wpa_session';
const SESSION_DAYS = 14;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cjubwgebqlvdufqjbhnm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_E4kSSQ-i-nUdPmBvvm1vJA_UIkbluJz';

function domains() { return (process.env.ADMIN_EMAIL_DOMAINS || 'sinalite.com,willowpack.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); }
function emails() { return (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); }
function allowed(email) { const e = String(email || '').toLowerCase(); return emails().includes(e) || domains().includes(e.split('@')[1] || ''); }
function secret() {
  const s = process.env.SESSION_SECRET || (process.env.SUPABASE_READ_TOKEN ? crypto.createHash('sha256').update('wpa-session:' + process.env.SUPABASE_READ_TOKEN).digest('hex') : '');
  return s || null;
}
function sign(payload) { return crypto.createHmac('sha256', secret()).update(payload).digest('base64url'); }

function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ email: user.email, name: user.name || user.email, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return payload + '.' + sign(payload);
}
function cookies(req) {
  const out = {}; String(req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function readSession(req) {
  if (!secret()) return null;
  const c = cookies(req)[COOKIE]; if (!c) return null;
  const [payload, sig] = c.split('.'); if (!payload || !sig) return null;
  const expect = sign(payload);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!s.email || !s.exp || s.exp < Date.now() || !allowed(s.email)) return null;
    return s;
  } catch (e) { return null; }
}
function isHttps(req) { return (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https'; }
function setCookie(res, req, value, maxAge) {
  res.setHeader('Set-Cookie', COOKIE + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (isHttps(req) ? '; Secure' : ''));
}
function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); }

/* Same-origin check for state-changing POSTs (the cookie is SameSite=Lax; this blocks cross-site form posts too). */
function sameOrigin(req) {
  const origin = req.headers.origin; if (!origin) return false;
  try { return new URL(origin).host === req.headers['x-forwarded-host'] || new URL(origin).host === req.headers.host; } catch (e) { return false; }
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve({}); } }); });
}

async function rpc(fn, args) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error('supabase ' + r.status + ': ' + text.slice(0, 200)); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}

module.exports = { COOKIE, SESSION_DAYS, domains, allowed, secret, makeSession, readSession, setCookie, json, sameOrigin, readBody, rpc };
