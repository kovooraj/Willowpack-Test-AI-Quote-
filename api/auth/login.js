/* POST /api/auth/login {credential} — credential is the Google ID token from "Sign in with Google".
   Verified with Google (audience = our client ID, verified email, allowed domain), then a signed session cookie is set. */
'use strict';
const { allowed, domains, makeSession, setCookie, json, sameOrigin, readBody, secret, SESSION_DAYS } = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (!sameOrigin(req)) return json(res, 403, { error: 'bad origin' });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !secret()) return json(res, 503, { error: 'Google sign-in is not configured on this deployment.' });
  const { credential } = await readBody(req);
  if (!credential || typeof credential !== 'string' || credential.length > 5000) return json(res, 400, { error: 'missing credential' });
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    const t = await r.json();
    if (!r.ok) return json(res, 401, { error: 'Google could not verify this sign-in.' });
    const email = String(t.email || '').toLowerCase();
    const okIss = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
    if (t.aud !== clientId || !okIss || !(t.email_verified === true || t.email_verified === 'true') || +t.exp * 1000 < Date.now()) return json(res, 401, { error: 'Invalid Google sign-in.' });
    if (!allowed(email)) return json(res, 403, { error: email + ' is not allowed. Use a ' + domains().map((d) => '@' + d).join(' or ') + ' account.' });
    setCookie(res, req, makeSession({ email, name: t.name || email }), SESSION_DAYS * 86400);
    return json(res, 200, { ok: true, email, name: t.name || email });
  } catch (e) {
    return json(res, 502, { error: 'Sign-in failed: ' + e.message });
  }
};
