/* Admin "Live chat" tab: sales reps take over Tier A chats from Riley (see /api/live).
 * While signed in, the page checks the queue every 15 s on any tab (this also keeps the rep counted as online),
 * and every 3 s while the Live chat tab or a conversation is open. New waiting chats ring a soft chime,
 * show a count on the side nav and a browser notification. */
(function () {
  'use strict';
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function api(url, body) {
    var o = { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } };
    if (body) { o.method = 'POST'; o.body = JSON.stringify(body); }
    return fetch(url, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || ('HTTP ' + r.status)); e.status = r.status; throw e; } return d; }); });
  }
  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 1000));
    if (s < 60) return s + 's'; if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd';
  }
  function when(ts) { try { return new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function fam(f) { return ({ pouch_standard: 'Pouches', pouch_custom: 'Custom pouches', roll_label: 'Roll labels', folding_carton: 'Product boxes' })[f] || f || ''; }

  var state = { signed: false, me: null, agents: [], queue: [], open: '', visible: false, after: 0, seen: {}, waitingIds: {} , first: true };
  var slowTimer = null, fastTimer = null, roomTimer = null;

  /* ---------- queue + presence ---------- */
  function refresh() {
    return api('/api/live?queue=1').then(function (d) {
      state.signed = true; state.me = d.me; state.agents = d.agents || []; state.queue = d.queue || [];
      notifyNew(); renderAll();
    }).catch(function (e) {
      if (e.status === 401) { state.signed = false; renderAll(); stopAll(); }
    });
  }
  function notifyNew() {
    var now = {};
    state.queue.forEach(function (c) { if (c.status === 'waiting') now[c.session_id] = c; });
    var fresh = Object.keys(now).filter(function (id) { return !state.waitingIds[id]; });
    state.waitingIds = now;
    var n = Object.keys(now).length, badge = $('#liveCount');
    if (badge) { badge.hidden = !n; badge.textContent = n; }
    document.title = (n ? '(' + n + ') ' : '') + document.title.replace(/^\(\d+\)\s*/, '');
    if (state.first) { state.first = false; return; }
    if (!fresh.length || !state.me || !state.me.active) return;
    chime();
    var c = now[fresh[0]], who = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'A customer';
    try {
      if (window.Notification && Notification.permission === 'granted') {
        var nt = new Notification('Live chat request', { body: who + (c.company ? ' from ' + c.company : '') + ' wants to chat now.', tag: 'wp-live-' + c.session_id });
        nt.onclick = function () { window.focus(); location.hash = '#live'; openRoom(c.session_id); };
      }
    } catch (e) {}
  }
  function chime() {
    if (!$('#lvSound') || !$('#lvSound').checked) return;
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return; var ctx = new A();
      [660, 880].forEach(function (f, i) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18); g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.32); });
    } catch (e) {}
  }

  /* ---------- rendering ---------- */
  function renderAll() {
    var tab = $('#tab-live'); if (!tab) return;
    $('#lvSignin').hidden = state.signed; $('#lvApp').hidden = !state.signed; $('#lvMeBox').hidden = !(state.signed && state.me);
    var notMe = $('#lvNotMe');
    notMe.hidden = !state.signed || !!state.me;
    notMe.textContent = state.signed && !state.me ? 'You can watch live chats, but only live agents can be set to Active and answer customers. Add yourself under Live agents below.' : '';
    if (!state.signed) return;
    var act = !!(state.me && state.me.active);
    $('#lvActive').setAttribute('aria-pressed', String(act)); $('#lvAway').setAttribute('aria-pressed', String(!act));
    renderList(); renderAgents();
  }
  function renderList() {
    var box = $('#lvList');
    if (!state.queue.length) { box.innerHTML = '<p class="empty">No live chats in the last 24 hours.</p>'; return; }
    var LBL = { waiting: 'Waiting', active: 'Live', ended: 'Ended', missed: 'Missed' };
    box.innerHTML = state.queue.map(function (c) {
      var who = [c.first_name, c.last_name].filter(Boolean).join(' ') || (c.customer && c.customer.name) || 'Customer';
      var sub = [c.company, c.ai_tier ? 'Tier ' + c.ai_tier : '', fam(c.product_family), c.quantity ? Number(c.quantity).toLocaleString('en-CA') + ' units' : ''].filter(Boolean).join(' · ');
      var t = c.status === 'waiting' ? 'waiting ' + ago(c.requested_at) : c.status === 'active' ? (c.agent_name || 'rep') + ' · ' + when(c.updated_at) : when(c.updated_at);
      return '<button type="button" class="lv-item' + (c.session_id === state.open ? ' on' : '') + '" data-sid="' + esc(c.session_id) + '">' +
        '<span class="lv-st st-' + esc(c.status) + '">' + LBL[c.status] + '</span><span class="lv-who">' + esc(who) + '</span><span class="lv-t">' + esc(t) + '</span>' +
        '<span class="lv-sub">' + esc(sub) + '</span>' + (c.last ? '<span class="lv-last">' + (c.last.sender === 'agent' ? 'You: ' : '') + esc(c.last.body) + '</span>' : '') + '</button>';
    }).join('');
    box.querySelectorAll('.lv-item').forEach(function (b) { b.addEventListener('click', function () { openRoom(b.dataset.sid); }); });
  }
  function renderAgents() {
    var ul = $('#lvAgents');
    ul.innerHTML = state.agents.filter(function (a) { return a.enabled; }).map(function (a) {
      return '<li><span class="lv-dot ' + (a.online ? 'on' : '') + '"></span><b>' + esc(a.name || a.email) + '</b><span class="muted">' + esc(a.email) + ' · ' + (a.online ? 'Active' : a.active ? 'Active (page closed)' : 'Away') + '</span>' +
        '<button type="button" class="link" data-rm="' + esc(a.email) + '">Remove</button></li>';
    }).join('') || '<li class="muted">No live agents yet.</li>';
    ul.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () {
      if (!confirm('Remove ' + b.dataset.rm + ' as a live agent?')) return;
      api('/api/live', { action: 'agent', email: b.dataset.rm, enabled: false }).then(refresh).catch(function (e) { $('#lvAgentErr').textContent = e.message; });
    }); });
  }

  /* ---------- one conversation ---------- */
  function openRoom(sid) {
    state.open = sid; state.after = 0; state.seen = {};
    renderList();
    var room = $('#lvRoom'); room.innerHTML = '<p class="empty">Loading…</p>';
    api('/api/live?admin=1&sid=' + encodeURIComponent(sid)).then(function (d) {
      if (state.open !== sid) return;
      drawRoom(sid, d.live || {}, d.chat || {});
      if (roomTimer) clearInterval(roomTimer);
      roomTimer = setInterval(function () { pollRoom(sid); }, 3000);
    }).catch(function (e) { room.innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }
  function drawRoom(sid, lv, chat) {
    var room = $('#lvRoom');
    var who = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'Customer';
    var facts = [['Company', chat.company], ['Email', chat.email], ['Phone', chat.phone], ['Tier', chat.ai_tier], ['Product', fam(chat.product_family)], ['Quantity', chat.quantity ? Number(chat.quantity).toLocaleString('en-CA') : ''], ['Page', chat.page_url]].filter(function (x) { return x[1]; });
    var tx = (chat.transcript || []).map(function (t) { return (t.user ? '<p class="u"><b>Customer:</b> ' + esc(t.user) + '</p>' : '') + (t.bot ? '<p class="b"><b>Riley:</b> ' + esc(t.bot).replace(/\[\[options:[^\]]*\]\]/g, '') + '</p>' : ''); }).join('');
    room.innerHTML =
      '<div class="lv-head"><div><h2>' + esc(who) + '</h2><p class="muted" id="lvState"></p></div><span class="spacer"></span>' +
      '<button class="btn btn-primary" type="button" id="lvAccept" hidden>Join chat</button><button class="btn btn-ghost" type="button" id="lvEnd" hidden>End chat</button></div>' +
      '<dl class="lv-facts">' + facts.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' +
      (tx ? '<details class="lv-ai"><summary>What Riley already discussed (' + (chat.transcript || []).length + ' turns)</summary><div class="lv-ai-tx">' + tx + '</div></details>' : '') +
      '<div class="lv-msgs" id="lvMsgs" aria-live="polite"></div>' +
      '<form class="lv-compose" id="lvCompose" autocomplete="off"><textarea id="lvText" rows="2" placeholder="Type your reply… (Enter to send)"></textarea><button class="btn btn-primary" type="submit" id="lvSend">Send</button></form>' +
      '<p class="err" id="lvErr" role="alert"></p>';
    $('#lvAccept').addEventListener('click', function () { act('accept', sid); });
    $('#lvEnd').addEventListener('click', function () { if (confirm('End the live chat? Riley will take over again for the customer.')) act('end', sid); });
    var ta = $('#lvText');
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#lvCompose').requestSubmit(); } });
    $('#lvCompose').addEventListener('submit', function (e) {
      e.preventDefault(); var v = ta.value.trim(); if (!v) return; ta.value = ''; $('#lvSend').disabled = true;
      api('/api/live', { action: 'reply', sid: sid, text: v }).then(function () { pollRoom(sid); refresh(); })
        .catch(function (er) { $('#lvErr').textContent = er.message; ta.value = v; }).then(function () { $('#lvSend').disabled = false; ta.focus(); });
    });
    applyRoom(sid, lv);
  }
  function applyRoom(sid, lv) {
    if (state.open !== sid || !$('#lvMsgs')) return;
    var box = $('#lvMsgs');
    (lv.messages || []).forEach(function (m) {
      if (state.seen[m.id]) return; state.seen[m.id] = 1;
      var d = document.createElement('div'); d.className = 'lv-m ' + m.sender;
      d.innerHTML = m.sender === 'system' ? '<span>' + esc(m.body) + '</span>' : '<div class="lv-bub">' + esc(m.body).replace(/\n/g, '<br>') + '</div><span class="lv-at">' + esc((m.sender === 'agent' ? (m.author || 'You') : 'Customer') + ' · ' + when(m.at)) + '</span>';
      box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
    var st = lv.status, open = st === 'waiting' || st === 'active', mine = state.me;
    $('#lvState').textContent = st === 'waiting' ? 'Waiting for a rep · ' + ago(lv.requested_at) : st === 'active' ? 'Live with ' + (lv.agent_name || 'a rep') : st === 'missed' ? 'Missed: nobody joined in time, Riley offered a booking or call back' : 'Ended';
    $('#lvAccept').hidden = !(st === 'waiting' && mine);
    $('#lvEnd').hidden = !(open && mine);
    $('#lvCompose').hidden = !(open && mine);
  }
  function pollRoom(sid) {
    if (state.open !== sid) return;
    api('/api/live?admin=1&sid=' + encodeURIComponent(sid)).then(function (d) { applyRoom(sid, d.live || {}); }).catch(function () {});
  }
  function act(action, sid) {
    api('/api/live', { action: action, sid: sid }).then(function (d) {
      if (d && d.ok === false) $('#lvErr').textContent = d.status === 'active' ? (d.agent_name || 'Another rep') + ' already joined this chat.' : 'This chat is ' + d.status + '.';
      pollRoom(sid); refresh(); if (action === 'accept') setTimeout(function () { var t = $('#lvText'); if (t) t.focus(); }, 50);
    }).catch(function (e) { $('#lvErr').textContent = e.message; });
  }

  /* ---------- presence + roster ---------- */
  function setActive(on) {
    if (on && window.Notification && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} }
    api('/api/live', { action: 'presence', active: on }).then(function (d) { state.me = d.me; state.agents = d.agents || []; renderAll(); })
      .catch(function (e) { alert(e.message); });
  }
  function bind() {
    $('#lvActive').addEventListener('click', function () { setActive(true); });
    $('#lvAway').addEventListener('click', function () { setActive(false); });
    $('#lvAddAgent').addEventListener('submit', function (e) {
      e.preventDefault(); var f = new FormData(e.target); $('#lvAgentErr').textContent = '';
      api('/api/live', { action: 'agent', email: String(f.get('email') || ''), name: String(f.get('name') || ''), enabled: true })
        .then(function () { e.target.reset(); refresh(); }).catch(function (er) { $('#lvAgentErr').textContent = er.message; });
    });
  }

  /* ---------- timers ---------- */
  function stopAll() { [slowTimer, fastTimer, roomTimer].forEach(function (t) { if (t) clearInterval(t); }); slowTimer = fastTimer = roomTimer = null; }
  function schedule() {
    if (!slowTimer) slowTimer = setInterval(refresh, 15000);
    if (fastTimer) clearInterval(fastTimer); fastTimer = null;
    if (state.visible) fastTimer = setInterval(refresh, 4000);
  }
  function start() {
    fetch('/api/auth/config', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (c) {
      state.signed = !!c.signedIn;
      if (!state.signed) { renderAll(); return; }
      refresh().then(schedule);
    }).catch(function () {});
  }

  window.LiveDesk = {
    visible: function (on) {
      state.visible = on;
      if (on) { renderAll(); if (!state.signed) start(); else { refresh(); schedule(); } }
      else if (fastTimer) { clearInterval(fastTimer); fastTimer = null; }
    }
  };
  bind();
  start();
  if ((location.hash || '') === '#live') window.LiveDesk.visible(true);
  addEventListener('visibilitychange', function () { if (!document.hidden && state.signed) refresh(); });
})();
