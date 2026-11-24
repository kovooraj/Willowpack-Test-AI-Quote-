/* Admin "Live chat" + "Agents" pages: sales reps take over Tier A chats from Riley (see /api/live).
 * While signed in, the page checks the queue every 15 s on any tab (this also keeps the rep counted as online),
 * and every 4 s while a Live chat page is open; an open conversation is checked every 3 s.
 * New waiting chats ring a soft chime, show a count on the side nav and a browser notification.
 * Lists are only redrawn when something changed, so typing and scrolling are never interrupted. */
(function () {
  'use strict';
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
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
  function initials(n) { return String(n || '?').split(/[\s@.]+/).filter(Boolean).map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function whoOf(c) { return [c.first_name, c.last_name].filter(Boolean).join(' ') || (c.customer && c.customer.name) || 'Customer'; }
  function tierOf(c) { return (c && c.customer && c.customer.tier) || (c && c.ai_tier) || ''; }

  var SPEC_LBL = { carton_type: 'Box style', carton_dimensions: 'Size (L x W x H)', material: 'Board / material', sides_printed: 'Print', coating: 'Coating', lamination: 'Lamination', carton_use: 'Use', food_contact: 'Food contact', contents: 'Contents', filled_weight: 'Filled weight', carry_handle: 'Carry handle', environment: 'Environment', size: 'Size', finishing: 'Finish', structure: 'Structure', ink: 'Ink', zipper: 'Zipper', tear_notch: 'Tear notch', hang_hole: 'Hang hole', round_corner: 'Round corners', shape: 'Shape', versions: 'Designs' };
  var PRINT = { '4/0': 'Full colour, outside only', '4/4': 'Full colour, both sides', '1/0': 'One colour, outside only' };
  var STYLE = { 'Straight Line': 'Straight tuck end', 'Auto/Crash Lock': 'Auto-lock bottom' };
  function nice(k, v) { v = String(v).replace(/_/g, ' '); return k === 'sides_printed' ? (PRINT[v] || v) : k === 'carton_type' ? (STYLE[v] || v) : v; }
  function money(n, cur) { return (cur || 'CAD') + ' $' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function unitp(n) { n = Number(n); return '$' + (n < 1 ? n.toFixed(3) : n.toFixed(2)); }
  function rows(q) {
    var r = [{ quantity: q.quantity, unit_price: q.unit, total_price: q.total, main: true }];
    (q.breaks || []).forEach(function (b) { if (Number(b.quantity) !== Number(q.quantity)) r.push(b); });
    return r.sort(function (a, b) { return Number(a.quantity) - Number(b.quantity); });
  }
  /* A ready-to-edit message for the rep, built from the price Riley worked out. */
  function draftQuote(q, specs, first) {
    var spec = [specs.carton_type && nice('carton_type', specs.carton_type).toLowerCase() + ' box', specs.carton_dimensions && specs.carton_dimensions.replace(/\s*x\s*/g, '" x ') + '"', specs.size, specs.material, specs.sides_printed && nice('sides_printed', specs.sides_printed).toLowerCase()].filter(Boolean).join(', ');
    var lines = rows(q).map(function (r) { return '• ' + Number(r.quantity).toLocaleString('en-CA') + ' units: ' + unitp(r.unit_price) + ' each, ' + money(r.total_price, q.currency) + ' total'; });
    return 'Hi' + (first ? ' ' + first : '') + ', here’s the pricing I put together for you' + (spec ? ' (' + spec + ')' : '') + ':\n' + lines.join('\n') +
      '\nShipping and taxes are extra' + (q.quote_id ? ' (ref ' + q.quote_id + ')' : '') + '. Does that work for you, or would you like me to look at other quantities or options?';
  }
  function briefHtml(q, chat) {
    var b = (q && q.customer && q.customer.brief) || {}, quote = b.quote, specs = b.specs || {};
    var out = '';
    out += '<section class="lv-card"><h3>Summary</h3>' + (b.summary ? '<p>' + esc(b.summary) + '</p>' : '<p class="muted">' + esc(chat.handoff_summary || 'Riley did not leave a summary. Open what Riley already discussed below.') + '</p>') + '</section>';
    var sk = Object.keys(specs);
    if (sk.length) out += '<section class="lv-card"><h3>Specs</h3><dl class="lv-specs">' + sk.map(function (k) { return '<dt>' + esc(SPEC_LBL[k] || k.replace(/_/g, ' ')) + '</dt><dd>' + esc(nice(k, specs[k])) + '</dd>'; }).join('') + '</dl></section>';
    if (quote && quote.total) {
      out += '<section class="lv-card lv-quote"><h3>Quote to start from' + (quote.held ? ' <span class="lv-tag">not shown to the customer</span>' : '') + '</h3>' +
        '<table><thead><tr><th>Quantity</th><th>Unit</th><th>Total</th></tr></thead><tbody>' + rows(quote).map(function (r) {
          return '<tr' + (r.main ? ' class="main"' : '') + '><td>' + Number(r.quantity).toLocaleString('en-CA') + '</td><td>' + unitp(r.unit_price) + '</td><td>' + esc(money(r.total_price, quote.currency)) + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<p class="muted">' + esc((quote.quote_id ? quote.quote_id + ' · ' : '') + 'AI calculator price, before any discount. Shipping and taxes extra.') + '</p>' +
        '<button type="button" class="btn btn-ghost" id="lvUseQuote">Put this quote in my reply</button></section>';
    }
    return out;
  }

  var state = { signed: false, me: null, email: '', name: '', agents: [], queue: [], open: '', page: '', visible: false, seen: {}, waitingIds: {}, first: true, sig: {} };
  var slowTimer = null, fastTimer = null, roomTimer = null;

  /* ---------- queue + presence ---------- */
  function refresh() {
    return api('/api/live?queue=1').then(function (d) {
      state.signed = true; state.me = d.me; state.email = d.email || ''; state.name = d.name || ''; state.agents = d.agents || []; state.queue = d.queue || [];
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
    var c = now[fresh[0]];
    try {
      if (window.Notification && Notification.permission === 'granted') {
        var nt = new Notification('Live chat request', { body: whoOf(c) + (c.company ? ' from ' + c.company : '') + ' wants to chat now.', tag: 'wp-live-' + c.session_id });
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
  /* Only touch the DOM when the content changed. */
  function paint(el, key, html) { if (!el || state.sig[key] === html) return false; state.sig[key] = html; el.innerHTML = html; return true; }

  /* ---------- rendering ---------- */
  function renderAll() {
    $$('[data-lv-signin]').forEach(function (el) { el.hidden = state.signed; });
    $('#lvApp').hidden = !state.signed; $('#lvAgentsPanel').hidden = !state.signed;
    renderMe();
    if (!state.signed) return;
    renderList(); renderAgents();
    var q = current(); if (q && state.open) applyHead(q);
  }
  /* Signed-in user + Active/Away switch, top right of both pages. */
  function renderMe() {
    var html = '';
    if (state.signed) {
      var me = state.me, nm = (me && me.name) || state.name || state.email, act = !!(me && me.active);
      html = '<span class="lv-av" aria-hidden="true">' + esc(initials(nm)) + '</span><span class="lv-id"><b>' + esc(nm) + '</b><span>' + esc(state.email) + '</span></span>' +
        (me ? '<div class="presence" role="group" aria-label="Your live chat status"><button type="button" data-presence="1" aria-pressed="' + act + '"><span class="pdot"></span>Active</button><button type="button" data-presence="0" aria-pressed="' + !act + '">Away</button></div>'
            : '<button type="button" class="btn btn-primary" data-make-agent>Make me a live agent</button>');
    }
    $$('[data-lv-me]').forEach(function (el, i) {
      el.hidden = !state.signed;
      if (paint(el, 'me' + i, html)) {
        $$('[data-presence]', el).forEach(function (b) { b.addEventListener('click', function () { setActive(b.dataset.presence === '1'); }); });
        var mk = $('[data-make-agent]', el); if (mk) mk.addEventListener('click', function () { makeMeAgent().catch(function (e) { alert(e.message); }); });
      }
    });
  }
  function renderList() {
    var box = $('#lvList');
    if (!state.queue.length) { paint(box, 'list', '<p class="empty">No live chats in the last 24 hours.</p>'); return; }
    var LBL = { waiting: 'Waiting', active: 'Live', ended: 'Ended', missed: 'Missed' };
    var html = state.queue.map(function (c) {
      var t = tierOf(c);
      var sub = [c.company, t ? 'Tier ' + t : '', fam(c.product_family), c.quantity ? Number(c.quantity).toLocaleString('en-CA') + ' units' : ''].filter(Boolean).join(' · ');
      var tm = c.status === 'waiting' ? 'waiting ' + ago(c.requested_at).replace(/ \d+s$/, '') : c.status === 'active' ? (c.agent_name || 'rep') : when(c.updated_at);
      return '<button type="button" class="lv-item' + (c.session_id === state.open ? ' on' : '') + '" data-sid="' + esc(c.session_id) + '">' +
        '<span class="lv-st st-' + esc(c.status) + '">' + LBL[c.status] + '</span><span class="lv-who">' + esc(whoOf(c)) + '</span><span class="lv-t">' + esc(tm) + '</span>' +
        '<span class="lv-sub">' + esc(sub) + '</span>' + (c.last ? '<span class="lv-last">' + (c.last.sender === 'agent' ? esc(c.agent_name || 'Rep') + ': ' : c.last.sender === 'customer' ? 'Customer: ' : '') + esc(c.last.body) + '</span>' : '') + '</button>';
    }).join('');
    if (paint(box, 'list', html)) $$('.lv-item', box).forEach(function (b) { b.addEventListener('click', function () { openRoom(b.dataset.sid); }); });
  }
  function renderAgents() {
    var ul = $('#lvAgents');
    var html = state.agents.filter(function (a) { return a.enabled; }).map(function (a) {
      var st = a.online ? 'Active' : a.active ? 'Active, page closed' : 'Away';
      return '<li><span class="lv-av sm" aria-hidden="true">' + esc(initials(a.name || a.email)) + '</span><span class="lv-id"><b>' + esc(a.name || a.email) + '</b><span>' + esc(a.email) + '</span></span>' +
        '<span class="lv-pill ' + (a.online ? 'on' : '') + '">' + st + '</span><button type="button" class="link" data-rm="' + esc(a.email) + '">Remove</button></li>';
    }).join('') || '<li class="muted">No live agents yet. Add one below.</li>';
    if (paint(ul, 'agents', html)) $$('[data-rm]', ul).forEach(function (b) { b.addEventListener('click', function () {
      if (!confirm('Remove ' + b.dataset.rm + ' as a live agent?')) return;
      api('/api/live', { action: 'agent', email: b.dataset.rm, enabled: false }).then(refresh).catch(function (e) { $('#lvAgentErr').textContent = e.message; });
    }); });
  }

  /* ---------- one conversation ---------- */
  function current() { for (var i = 0; i < state.queue.length; i++) if (state.queue[i].session_id === state.open) return state.queue[i]; return null; }
  function mine(q) { return !!(q && state.email && String(q.agent_email || '').toLowerCase() === state.email.toLowerCase()); }
  function openRoom(sid) {
    state.open = sid; state.seen = {}; delete state.sig.list; renderList();
    var room = $('#lvRoom'); room.innerHTML = '<p class="empty">Loading…</p>';
    if (roomTimer) clearInterval(roomTimer);
    api('/api/live?admin=1&sid=' + encodeURIComponent(sid)).then(function (d) {
      if (state.open !== sid) return;
      drawRoom(sid, d.live || {}, d.chat || {});
      roomTimer = setInterval(function () { pollRoom(sid); }, 3000);
    }).catch(function (e) { room.innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }
  function drawRoom(sid, lv, chat) {
    var q = current() || {}, room = $('#lvRoom');
    var t = tierOf(q) || chat.ai_tier;
    var facts = [['Company', chat.company], ['Email', chat.email], ['Phone', chat.phone], ['Tier', t], ['Product', fam(chat.product_family)], ['Quantity', chat.quantity ? Number(chat.quantity).toLocaleString('en-CA') : ''], ['Page', chat.page_url]].filter(function (x) { return x[1]; });
    var tx = (chat.transcript || []).map(function (r) { return (r.user ? '<p class="u"><b>Customer:</b> ' + esc(r.user) + '</p>' : '') + (r.bot ? '<p class="b"><b>Riley:</b> ' + esc(r.bot).replace(/\[\[options:[^\]]*\]\]/g, '') + '</p>' : ''); }).join('');
    room.innerHTML =
      '<div class="lv-head"><div><h2>' + esc([chat.first_name, chat.last_name].filter(Boolean).join(' ') || whoOf(q)) + '</h2><p class="lv-state" id="lvState"></p></div><span class="spacer"></span>' +
      '<button class="btn btn-primary" type="button" id="lvAccept" hidden>Join chat</button><button class="btn btn-ghost" type="button" id="lvEnd" hidden>End chat</button></div>' +
      '<div class="lv-body"><div class="lv-convo"><div class="lv-msgs" id="lvMsgs" aria-live="polite"></div>' +
      '<div class="lv-joinbar" id="lvJoinBar" hidden></div>' +
      '<form class="lv-compose" id="lvCompose" autocomplete="off" hidden><textarea id="lvText" rows="2" placeholder="Message the customer… (Enter to send, Shift+Enter for a new line)"></textarea><button class="btn btn-primary" type="submit" id="lvSend">Send</button></form>' +
      '<p class="err" id="lvErr" role="alert"></p></div>' +
      '<aside class="lv-side">' + briefHtml(q, chat) + '<dl class="lv-facts">' + facts.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' +
      (tx ? '<details class="lv-ai"><summary>What Riley already discussed (' + (chat.transcript || []).length + ' turns)</summary><div class="lv-ai-tx">' + tx + '</div></details>' : '') + '</aside></div>';
    $('#lvAccept').addEventListener('click', function () { join(sid); });
    var uq = $('#lvUseQuote');
    if (uq) uq.addEventListener('click', function () {
      var b = (q.customer && q.customer.brief) || {};
      var go = function () { var t = $('#lvText'); if (!t) return; t.value = draftQuote(b.quote, b.specs || {}, chat.first_name); t.focus(); t.style.height = Math.min(200, t.scrollHeight + 4) + 'px'; };
      if ($('#lvCompose').hidden) { if (q.status === 'waiting') join(sid); setTimeout(go, 900); } else go();
    });
    $('#lvEnd').addEventListener('click', function () { if (confirm('End the live chat? Riley will take over again for the customer.')) act('end', sid); });
    var ta = $('#lvText');
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#lvCompose').requestSubmit(); } });
    $('#lvCompose').addEventListener('submit', function (e) {
      e.preventDefault(); var v = ta.value.trim(); if (!v) return; ta.value = ''; $('#lvSend').disabled = true; $('#lvErr').textContent = '';
      api('/api/live', { action: 'reply', sid: sid, text: v }).then(function (d) {
        if (d && d.ok === false) { $('#lvErr').textContent = 'The chat has ' + (d.status === 'none' ? 'closed' : d.status) + '; the customer did not get that message.'; ta.value = v; }
        pollRoom(sid); refresh();
      }).catch(function (er) { $('#lvErr').textContent = er.message; ta.value = v; }).then(function () { $('#lvSend').disabled = false; ta.focus(); });
    });
    applyRoom(sid, lv);
  }
  function applyHead(q) {
    if (!$('#lvState')) return;
    var st = q.status, open = st === 'waiting' || st === 'active', isMine = mine(q), other = st === 'active' && !isMine;
    $('#lvState').innerHTML = st === 'waiting' ? '<span class="lv-st st-waiting">Waiting</span> for a rep · ' + esc(ago(q.requested_at)) :
      st === 'active' ? '<span class="lv-st st-active">Live</span> with ' + esc(isMine ? 'you' : (q.agent_name || 'a rep')) :
      st === 'missed' ? '<span class="lv-st">Missed</span> nobody joined in time; Riley offered a booking or call back' : '<span class="lv-st">Ended</span>';
    $('#lvAccept').hidden = st !== 'waiting';
    $('#lvEnd').hidden = !(open && (isMine || st === 'waiting') && state.me);
    $('#lvCompose').hidden = !(st === 'active' && isMine);
    var bar = $('#lvJoinBar');
    bar.hidden = !open || (st === 'active' && isMine);
    bar.innerHTML = st === 'waiting' ? 'The customer is waiting. <b>Join chat</b> to start talking; they will see “' + esc((state.me && state.me.name) || state.name || 'You') + ' joined the chat”.' :
      other ? esc(q.agent_name || 'Another rep') + ' is handling this chat.' : '';
  }
  function applyRoom(sid, lv) {
    if (state.open !== sid || !$('#lvMsgs')) return;
    var box = $('#lvMsgs'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40, added = false;
    (lv.messages || []).forEach(function (m) {
      if (state.seen[m.id]) return; state.seen[m.id] = 1; added = true;
      var d = document.createElement('div'); d.className = 'lv-m ' + m.sender;
      d.innerHTML = m.sender === 'system' ? '<span>' + esc(m.body) + '</span>' : '<div class="lv-bub">' + esc(m.body).replace(/\n/g, '<br>') + '</div><span class="lv-at">' + esc((m.sender === 'agent' ? (m.author || 'You') : 'Customer') + ' · ' + when(m.at)) + '</span>';
      box.appendChild(d);
    });
    if (!box.children.length) box.innerHTML = '<p class="lv-empty">Messages between you and the customer appear here.</p>';
    else { var e = $('.lv-empty', box); if (e) e.remove(); }
    if (added && atEnd) box.scrollTop = box.scrollHeight;
    var q = current();
    if (q) { q.status = lv.status || q.status; if (lv.agent_name) q.agent_name = lv.agent_name; applyHead(q); }
  }
  function pollRoom(sid) {
    if (state.open !== sid) return;
    api('/api/live?admin=1&sid=' + encodeURIComponent(sid)).then(function (d) { applyRoom(sid, d.live || {}); }).catch(function () {});
  }
  function act(action, sid) {
    return api('/api/live', { action: action, sid: sid }).then(function (d) {
      if (d && d.ok === false) $('#lvErr').textContent = d.status === 'active' ? (d.agent_name || 'Another rep') + ' already joined this chat.' : 'This chat is ' + d.status + '.';
      return refresh().then(function () { pollRoom(sid); });
    }).catch(function (e) { $('#lvErr').textContent = e.message; });
  }
  /* Joining makes you the customer's rep; anyone signed in can join (they are added as a live agent first). */
  function join(sid) {
    $('#lvAccept').disabled = true;
    (state.me ? Promise.resolve() : makeMeAgent()).then(function () { return act('accept', sid); })
      .then(function () { var t = $('#lvText'); if (t) t.focus(); })
      .catch(function (e) { $('#lvErr').textContent = e.message; })
      .then(function () { if ($('#lvAccept')) $('#lvAccept').disabled = false; });
  }

  /* ---------- presence + roster ---------- */
  function makeMeAgent() {
    var first = String(state.name || '').split(/\s+/)[0] || '';
    return api('/api/live', { action: 'agent', email: state.email, name: first, enabled: true }).then(refresh);
  }
  function setActive(on) {
    if (on && window.Notification && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} }
    api('/api/live', { action: 'presence', active: on }).then(function (d) { state.me = d.me; state.agents = d.agents || []; renderAll(); })
      .catch(function (e) { alert(e.message); });
  }
  function bind() {
    $('#lvAddAgent').addEventListener('submit', function (e) {
      e.preventDefault(); var f = new FormData(e.target); $('#lvAgentErr').textContent = '';
      api('/api/live', { action: 'agent', email: String(f.get('email') || ''), name: String(f.get('name') || ''), enabled: true })
        .then(function () { e.target.reset(); return refresh(); }).catch(function (er) { $('#lvAgentErr').textContent = er.message; });
    });
  }

  /* ---------- timers ---------- */
  function stopAll() { [slowTimer, fastTimer, roomTimer].forEach(function (t) { if (t) clearInterval(t); }); slowTimer = fastTimer = roomTimer = null; }
  function schedule() {
    if (!slowTimer) slowTimer = setInterval(refresh, 15000);
    if (fastTimer) clearInterval(fastTimer); fastTimer = null;
    if (state.visible && !document.hidden) fastTimer = setInterval(refresh, 4000);
  }
  function start() {
    return fetch('/api/auth/config', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (c) {
      state.signed = !!c.signedIn;
      if (!state.signed) { renderAll(); return; }
      return refresh().then(schedule);
    }).catch(function () {});
  }

  window.LiveDesk = {
    visible: function (on, page) {
      state.visible = on; state.page = page || '';
      if (on) { renderAll(); if (!state.signed) start(); else { refresh(); schedule(); } }
      else if (fastTimer) { clearInterval(fastTimer); fastTimer = null; }
    }
  };
  bind();
  start();
  addEventListener('visibilitychange', function () { if (!state.signed) return; if (!document.hidden) refresh(); schedule(); });
})();
