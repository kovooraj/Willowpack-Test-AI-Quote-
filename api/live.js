/* Live chat between a customer and a Willowpack sales rep (the chat is handed over by Riley, see n8n "Rep Connect").
 *
 * Customer side (no login; the session id is the chat's random UUID and only works while a live chat is open):
 *   GET  /api/live?sid=&after=            -> { status, agent_name, requested_at, messages[] }
 *   POST /api/live {action:'send', sid, text}
 *   POST /api/live {action:'timeout', sid}   no rep joined in time -> 'missed' (only after 90 s of waiting)
 *   POST /api/live {action:'leave', sid}
 *
 * Staff side (signed in to /admin with Google):
 *   GET  /api/live?queue=1                -> { me, agents[], queue[] }   (also counts as a presence heartbeat)
 *   GET  /api/live?sid=&admin=1           -> full live transcript + the AI chat record
 *   POST /api/live {action:'presence', active}            Active / Away
 *   POST /api/live {action:'accept'|'reply'|'end', sid, text?}
 *   POST /api/live {action:'agent', email, name, enabled} add / remove a live agent
 */
'use strict';
const { readSession, json, rpc, dbSecret, sameOrigin, readBody } = require('./_lib');

const SID = /^[A-Za-z0-9-]{8,128}$/;
const STALE_MS = 3 * 60 * 1000;
const clean = (t, n) => String(t || '').replace(/\u0000/g, '').trim().slice(0, n);

module.exports = async (req, res) => {
  if (!dbSecret()) return json(res, 503, { error: 'Live chat needs SUPABASE_SERVICE_ROLE_KEY on this deployment.' });
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const staff = readSession(req);
  try {
    if (req.method === 'GET') {
      if (q.queue) {
        if (!staff) return json(res, 401, { error: 'sign in required' });
        const presence = await rpc('live_agent_update', { p_email: staff.email, p_name: staff.name, p_heartbeat: true });
        let queue = (await rpc('live_queue', {})) || [];
        // A chat still "waiting" after 3 minutes means the customer's page closed before its own 2 minute timeout ran: mark it missed.
        const stale = queue.filter((c) => c.status === 'waiting' && Date.now() - Date.parse(c.requested_at || 0) > STALE_MS);
        if (stale.length) {
          await Promise.all(stale.map((c) => rpc('live_set_status', { p_session_id: c.session_id, p_status: 'missed' }).catch(() => null)));
          queue = (await rpc('live_queue', {})) || [];
        }
        return json(res, 200, { me: presence.me, agents: presence.agents, queue, email: staff.email, name: staff.name || '' });
      }
      const sid = String(q.sid || '');
      if (!SID.test(sid)) return json(res, 400, { error: 'bad session' });
      const after = Math.max(0, parseInt(q.after, 10) || 0);
      const live = await rpc('live_poll', { p_session_id: sid, p_after: q.admin ? 0 : after });
      if (q.admin) {
        if (!staff) return json(res, 401, { error: 'sign in required' });
        const chat = await rpc('ai_chat_get', { p_session_id: sid }).catch(() => null);
        return json(res, 200, { live, chat });
      }
      return json(res, 200, live);
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'bad origin' });
    const b = await readBody(req);
    const action = String(b.action || '');
    const sid = String(b.sid || '');

    /* ---------- customer ---------- */
    if (action === 'send' || action === 'timeout' || action === 'leave') {
      if (!SID.test(sid)) return json(res, 400, { error: 'bad session' });
      if (action === 'send') {
        const text = clean(b.text, 2000);
        if (!text) return json(res, 400, { error: 'empty message' });
        return json(res, 200, await rpc('live_post', { p_session_id: sid, p_sender: 'customer', p_author: '', p_body: text }));
      }
      if (action === 'timeout') {
        const cur = await rpc('live_poll', { p_session_id: sid, p_after: 0 });
        if (cur.status !== 'waiting') return json(res, 200, { ok: false, status: cur.status });
        if (Date.now() - Date.parse(cur.requested_at || 0) < 90000) return json(res, 200, { ok: false, status: 'waiting' });
        return json(res, 200, await rpc('live_set_status', { p_session_id: sid, p_status: 'missed' }));
      }
      return json(res, 200, await rpc('live_set_status', { p_session_id: sid, p_status: 'ended', p_agent_name: 'the customer' }));
    }

    /* ---------- staff ---------- */
    if (!staff) return json(res, 401, { error: 'sign in required' });
    if (action === 'presence') {
      const r = await rpc('live_agent_update', { p_email: staff.email, p_name: staff.name, p_active: !!b.active, p_heartbeat: true });
      if (!r.me) return json(res, 403, { error: staff.email + ' is not a live chat agent. Add them under Live agents first.' });
      return json(res, 200, r);
    }
    if (action === 'agent') {
      const email = clean(b.email, 200).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return json(res, 400, { error: 'enter a valid email' });
      return json(res, 200, await rpc('live_agent_update', { p_email: email, p_name: clean(b.name, 80) || null, p_enabled: b.enabled !== false }));
    }
    if (!SID.test(sid)) return json(res, 400, { error: 'bad session' });
    const me = (await rpc('live_agent_update', { p_email: staff.email, p_name: staff.name, p_heartbeat: true })).me;
    if (!me) return json(res, 403, { error: 'Only live chat agents can answer customers. Add yourself under Live agents first.' });
    const name = me.name || staff.name || staff.email;
    if (action === 'accept') return json(res, 200, await rpc('live_set_status', { p_session_id: sid, p_status: 'active', p_agent_email: staff.email, p_agent_name: name }));
    if (action === 'end') return json(res, 200, await rpc('live_set_status', { p_session_id: sid, p_status: 'ended', p_agent_email: staff.email, p_agent_name: name }));
    if (action === 'reply') {
      const text = clean(b.text, 4000);
      if (!text) return json(res, 400, { error: 'empty message' });
      const cur = await rpc('live_poll', { p_session_id: sid, p_after: 0 });
      if (cur.status === 'waiting') await rpc('live_set_status', { p_session_id: sid, p_status: 'active', p_agent_email: staff.email, p_agent_name: name });
      return json(res, 200, await rpc('live_post', { p_session_id: sid, p_sender: 'agent', p_author: name, p_body: text }));
    }
    return json(res, 400, { error: 'unknown action' });
  } catch (e) {
    return json(res, 502, { error: 'Live chat is not available right now.' });
  }
};
