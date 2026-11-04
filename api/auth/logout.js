/* POST /api/auth/logout */
'use strict';
const { setCookie, json, sameOrigin } = require('../_lib');

module.exports = (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (!sameOrigin(req)) return json(res, 403, { error: 'bad origin' });
  setCookie(res, req, '', 0);
  json(res, 200, { ok: true });
};
