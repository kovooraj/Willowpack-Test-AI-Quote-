/* GET /api/conversations?channel=&campaign=&source=&host=&stage=&q=&from=&to=&limit=&offset=   -> list + summary
   GET /api/conversations?id=<session_id>                                                        -> one conversation with transcript
   Signed-in staff only. Reads Supabase ai_inbound_sales_chat.chats through token-checked RPCs. */
'use strict';
const { readSession, json, rpc } = require('./_lib');

const FILTERS = ['channel', 'campaign', 'source', 'host', 'stage', 'q', 'from', 'to', 'limit', 'offset'];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
  if (!readSession(req)) return json(res, 401, { error: 'sign in required' });
  const token = process.env.SUPABASE_READ_TOKEN;
  if (!token) return json(res, 503, { error: 'SUPABASE_READ_TOKEN is not set on this deployment.' });
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    if (q.id) {
      const row = await rpc('ai_chat_get', { p_token: token, p_session_id: String(q.id).slice(0, 128) });
      return row ? json(res, 200, row) : json(res, 404, { error: 'not found' });
    }
    const f = {};
    FILTERS.forEach((k) => { if (q[k] != null && String(q[k]).trim() !== '') f[k] = String(q[k]).slice(0, 200); });
    if (f.from && !/^\d{4}-\d{2}-\d{2}$/.test(f.from)) delete f.from;
    if (f.to && !/^\d{4}-\d{2}-\d{2}$/.test(f.to)) delete f.to;
    return json(res, 200, await rpc('ai_chat_list', { p_token: token, f }));
  } catch (e) {
    return json(res, e.status === 400 ? 400 : 502, { error: 'Could not load conversations.' });
  }
};
