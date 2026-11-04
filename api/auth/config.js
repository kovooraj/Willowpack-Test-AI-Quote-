/* GET /api/auth/config -> what the admin page needs to show the Google button, plus who is signed in. */
'use strict';
const { domains, readSession, secret, json } = require('../_lib');

module.exports = (req, res) => {
  const s = readSession(req);
  json(res, 200, {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    configured: !!(process.env.GOOGLE_CLIENT_ID && secret() && process.env.SUPABASE_READ_TOKEN),
    domains: domains(),
    signedIn: !!s,
    email: s ? s.email : '',
    name: s ? s.name : ''
  });
};
