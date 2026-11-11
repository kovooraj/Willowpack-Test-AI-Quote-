/*
 * Willowpack quote chat: shared surface for /embed/chat and /embed/quotes.
 * Ported from the inline script in /index.html. The n8n request/response contract is unchanged:
 *   chat:    POST WEBHOOK_URL {action:'sendMessage', sessionId, chatInput, metadata}
 *            -> {output|text, quote?, meeting?}
 *   history: POST HISTORY_URL {sessionIds, turnsFor?} -> {sessions[], turns[], quote}
 *   call:    POST CALL_URL {source, sessionId, sessionIds, phone, consent, timezone, carry}
 * localStorage keys are the same as the home page: wp_session, wp_sessions, wp_profile, wp_has_quote, wp_phone.
 * Usage: WPChat.mount({ mode: 'chat'|'quotes', ... }) — see /embed/chat.html.
 */
(function () {
  'use strict';
  var WEBHOOK_URL = 'https://n8n.sinaprinting.com/webhook/willowpack-quote-chat';
  var HISTORY_URL = 'https://n8n.sinaprinting.com/webhook/willowpack-quote-history';
  var CALL_URL = 'https://n8n.sinaprinting.com/webhook/willowpack-call-request';
  var MARK = '/assets/riley.jpg'; /* Riley, the AI quote specialist's avatar */
  var BOOK_MSG = 'I’d like to book a call with a Willowpack rep to finalize this quote.';
  /* Follow-up email "Approve my quote" links (&ask=approve): reopen the chat and ask to review the quote; the customer still confirms in the chat */
  var APPROVE_MSG = 'I’m back to review my quote and approve it.';
  var ASK_MSG = { book: BOOK_MSG, approve: APPROVE_MSG };

  /* Format buttons: same labels and first messages as the home page hero chips. */
  var FORMATS = {
    pouches:   { label: 'Stand-up pouches', msg: 'I need a quote for stand-up pouches.' },
    labels:    { label: 'Roll labels', msg: 'I need a quote for roll labels.' },
    boxes:     { label: 'Product boxes', msg: 'I need a quote for product boxes.' },
    rollstock: { label: 'Roll stock', msg: 'I need a quote for roll stock film for my filling line.' },
    help:      { label: 'Help me choose', msg: 'I’m not sure which packaging format I need. Can you help me choose?' }
  };

  var ICON = {
    phone: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 11.2v2a1.3 1.3 0 0 1-1.5 1.3A12.9 12.9 0 0 1 1.5 3.5 1.3 1.3 0 0 1 2.8 2h2a1.3 1.3 0 0 1 1.3 1.1c.1.7.3 1.3.5 1.9a1.3 1.3 0 0 1-.3 1.4l-.8.8a10.4 10.4 0 0 0 4.3 4.3l.8-.8a1.3 1.3 0 0 1 1.4-.3c.6.2 1.2.4 1.9.5a1.3 1.3 0 0 1 1.1 1.3z"/></svg>',
    clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>'
  };
  var LOGOS = '<img class="logo logo-light" src="/assets/logo.png" width="111" height="24" alt="Willowpack"><img class="logo logo-dark" src="/assets/logo-white.png" width="111" height="24" alt="Willowpack">';

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function ss(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function getList() { try { var l = JSON.parse(ss('wp_sessions') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function remember(id, text) {
    var l = getList(), f = l.filter(function (x) { return x.id === id; })[0];
    if (f) f.ts = Date.now(); else l.unshift({ id: id, title: String(text || 'Quote chat').slice(0, 80), ts: Date.now() });
    l.sort(function (a, b) { return b.ts - a.ts; }); ss('wp_sessions', JSON.stringify(l.slice(0, 25)));
  }
  function known(id) { return getList().some(function (x) { return x.id === id; }); }
  function validId(id) { return /^[A-Za-z0-9-]{8,64}$/.test(String(id || '')); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { return Array.isArray(d) ? (d[0] || {}) : d; });
  }
  function debugOn() { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /(^|[?&])wp_debug=1/.test(location.search); }
  function money(n, cur) { return cur + ' $' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(ts) { try { return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  var STAGE = { quoted: 'Quoted', handed_to_sales: 'With a rep', meeting_booked: 'Call booked', scheduling: 'Booking a call', speccing: 'In progress', discovery: 'In progress', closed_no_interest: 'Closed' };

  /* ---------- markdown + options (identical to index.html) ---------- */
  function inline(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function md(text) {
    var lines = esc(text).split(/\r?\n/), html = '', list = null, para = [];
    function fp() { if (para.length) { html += '<p>' + inline(para.join('<br>')) + '</p>'; para = []; } }
    function fl() { if (list) { html += '</' + list + '>'; list = null; } }
    var tbl = null;
    function cells(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return inline(c.trim()); }); }
    function ft() { if (tbl) { var h = '<div class="tbl"><table><thead><tr>' + tbl.head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>'; tbl.rows.forEach(function (r) { h += '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }); html += h + '</tbody></table></div>'; tbl = null; } }
    lines.forEach(function (l) {
      if (/^\s*\|.*\|\s*$/.test(l)) { fp(); fl(); if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) return; if (!tbl) tbl = { head: cells(l), rows: [] }; else tbl.rows.push(cells(l)); return; }
      ft();
      var ul = l.match(/^\s*[-*•]\s+(.*)$/), ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) { fp(); var t = ul ? 'ul' : 'ol'; if (list !== t) { fl(); html += '<' + t + '>'; list = t; } html += '<li>' + inline((ul || ol)[1]) + '</li>'; }
      else if (!l.trim()) { fp(); fl(); }
      else { fl(); para.push(l.replace(/^#{1,6}\s+/, '')); }
    });
    ft(); fp(); fl(); return html;
  }
  function splitOptions(text) {
    var m = text.match(/\[\[options:\s*([^\]]*)\]\]/i);
    if (m) {
      var o = m[1].split('|').map(function (x) { return x.trim(); }).filter(Boolean);
      return { text: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\n{3,}/g, '\n\n').replace(/\s+$/, ''), opts: o };
    }
    var lines = text.replace(/\s+$/, '').split(/\r?\n/), end = lines.length - 1, start = end, items = [];
    while (start >= 0 && /^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[start])) start--;
    if (start < end) {
      var opts = lines.slice(start + 1).map(function (l) { return l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').replace(/[`_]/g, '').trim().replace(/[.:;]$/, ''); });
      var prev = start; while (prev >= 0 && !lines[prev].trim()) prev--;
      var asked = prev >= 0 && /\?\s*\**\s*$/.test(lines[prev]);
      if (asked && opts.length >= 2 && opts.length <= 8 && opts.every(function (o) { return o.length && o.length <= 48; })) {
        return { text: lines.slice(0, start + 1).join('\n'), opts: opts };
      }
    }
    if (/\?\s*$/.test(text.trim())) {
      var pipe = text.match(/(?:^|\n)\s*[-*•]?\s*[^\n|]{0,40}:\s*([^\n]*\|[^\n]*)/);
      if (pipe) { pipe[1].split('|').forEach(function (p) { p = p.replace(/\*/g, '').trim(); if (p && p.length <= 36) items.push(p); }); }
    }
    return { text: text, opts: items.length >= 2 && items.length <= 8 ? items : [] };
  }

  /* ---------- page config from the iframe URL ---------- */
  function readConfig() {
    var q = new URLSearchParams(location.search);
    var cfg = {
      q: (q.get('q') || '').slice(0, 2000),
      format: (q.get('format') || '').toLowerCase(),
      campaign: (q.get('campaign') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80),
      theme: q.get('theme') || 'auto',
      accent: /^#?[0-9a-fA-F]{6}$/.test(q.get('accent') || '') ? '#' + q.get('accent').replace('#', '') : '',
      resume: validId(q.get('resume')) ? q.get('resume') : '',
      surface: q.get('surface') === 'admin-demo' ? 'admin-demo' : 'embed',
      fresh: q.get('new') === '1',
      ask: ASK_MSG[q.get('ask')] ? q.get('ask') : '',
      ref: (q.get('ref') || '').slice(0, 500),
      sourceUrl: '', sourceOrigin: '', utm: {}
    };
    var src = q.get('source_url') || '';
    try { var u = new URL(src); if (/^https?:$/.test(u.protocol)) { u.hash = ''; u.searchParams.delete('resume'); cfg.sourceUrl = u.toString(); cfg.sourceOrigin = u.origin; cfg.srcParams = u.searchParams; } } catch (e) {}
    /* UTMs: explicit utm_* on the iframe URL win, then the host page URL; campaign fills utm_campaign if still empty. */
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
      cfg.utm[k] = (q.get(k) || (cfg.srcParams && cfg.srcParams.get(k)) || '').slice(0, 200);
    });
    if (!cfg.utm.utm_campaign && cfg.campaign) cfg.utm.utm_campaign = cfg.campaign;
    if (cfg.surface === 'admin-demo' && !cfg.utm.utm_source) cfg.utm.utm_source = 'admin-demo';
    return cfg;
  }

  function applyTheme(cfg) {
    var root = document.documentElement, t = cfg.theme;
    if (t !== 'light' && t !== 'dark') t = matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', t);
    if (cfg.theme === 'auto' && window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var on = function () { root.setAttribute('data-theme', mq.matches ? 'dark' : 'light'); };
      if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
    }
    if (cfg.accent) { root.style.setProperty('--accent', cfg.accent); root.setAttribute('data-accent', ''); }
  }

  /* ---------- parent messaging: versioned, origin-checked ---------- */
  function makeBridge(cfg) {
    var inFrame = window.parent && window.parent !== window;
    function send(type, data) {
      if (!inFrame || !cfg.sourceOrigin) return;
      var m = { wp: 1, type: type }; if (data) Object.keys(data).forEach(function (k) { m[k] = data[k]; });
      try { window.parent.postMessage(m, cfg.sourceOrigin); } catch (e) {}
    }
    var handlers = {};
    addEventListener('message', function (e) {
      if (!inFrame || e.source !== window.parent || e.origin !== cfg.sourceOrigin) return;
      var d = e.data; if (!d || d.wp !== 1 || typeof d.type !== 'string') return;
      if (handlers[d.type]) handlers[d.type](d);
    });
    return { send: send, on: function (t, fn) { handlers[t] = fn; }, inFrame: inFrame };
  }

  /* ---------- markup ---------- */
  function chatMarkup() {
    return '' +
'<div class="cm-back" id="cmBack" role="dialog" aria-modal="true" aria-labelledby="cmTitle">' +
'  <form class="cm" id="cmForm" autocomplete="on">' +
'    <h3 id="cmTitle">Get a call back</h3>' +
'    <p class="sub" id="cmSub"></p>' +
'    <label class="f" for="cmPhone">Phone number (Canada or US)</label>' +
'    <input type="tel" id="cmPhone" name="tel" inputmode="tel" autocomplete="tel" placeholder="(416) 555-0123" required>' +
'    <label class="consent"><input type="checkbox" id="cmConsent"><span>I agree to receive a call at this number from Willowpack\'s AI assistant about my packaging request. Calls may be recorded for quality.</span></label>' +
'    <div class="row"><button class="btn btn-ghost" type="button" id="cmCancel">Cancel</button><button class="btn btn-primary" type="submit" id="cmSubmit">Call me now</button></div>' +
'    <p class="msg" id="cmMsg" aria-live="polite"></p>' +
'  </form>' +
'</div>' +
'<div class="chat open" id="chat" role="dialog" aria-label="Riley, Willowpack AI quote specialist">' +
'  <div class="chat-bar">' + LOGOS +
'    <span class="who"><img class="who-av" src="/assets/riley.jpg" alt="" width="24" height="24"><span><b>Riley</b> · AI quote specialist</span><span class="dot" title="Online"></span></span>' +
'    <span class="spacer"></span>' +
'    <button class="btn btn-ghost" type="button" id="callBtn" aria-label="Continue via call">' + ICON.phone + '<span class="ghost-label">Call me</span></button>' +
'    <button class="btn btn-ghost" type="button" id="historyBtn" aria-label="Past quotes">' + ICON.clock + '<span class="ghost-label">Past quotes</span></button>' +
'    <button class="btn btn-ghost" type="button" id="newQuote"><span class="ghost-label">New quote</span>' + ICON.plus + '</button>' +
'    <button class="icon-btn" type="button" id="closeChat" aria-label="Close chat">' + ICON.x + '</button>' +
'  </div>' +
'  <div class="progress" id="progress" aria-label="Quote progress">' +
'    <span data-s="0" class="now">Your product</span><span data-s="1">Your details</span><span data-s="2">Specs</span><span data-s="3">Price</span><span data-s="4">Next step</span>' +
'  </div>' +
'  <div class="history" id="history" aria-label="Past quote chats"><div class="history-inner">' +
'    <div class="history-head"><h2>Your quote chats</h2><button class="btn btn-ghost" type="button" id="historyClose">Back to chat</button></div>' +
'    <div id="historyList"></div></div></div>' +
'  <div class="thread" id="thread" aria-live="polite"><div class="thread-inner" id="threadInner"></div></div>' +
'  <div class="chat-dock">' +
'    <div class="quote-pill" id="quotePill"><div><div class="qi" id="qId">Quote</div><div class="qv" id="qVal"></div></div><button class="btn btn-primary" type="button" id="bookBtn">Book a call</button></div>' +
'    <form class="composer" id="chatForm" autocomplete="off">' +
'      <label class="sr" for="chatInput">Message</label>' +
'      <textarea id="chatInput" rows="1" placeholder="Reply…"></textarea>' +
'      <div class="composer-row"><span class="hint">Enter to send · Shift + Enter for a new line</span>' +
'        <button class="send round" type="submit" id="chatSend" aria-label="Send" disabled>' + ICON.up + '</button></div>' +
'    </form>' +
'    <p class="fine">Estimates only. Shipping and taxes are extra; your Willowpack rep confirms the final quote.</p>' +
'  </div>' +
'</div>';
  }
  function quotesMarkup() {
    return '' +
'<div class="chat open show-history" id="chat" role="dialog" aria-label="Your Willowpack quotes">' +
'  <div class="chat-bar">' + LOGOS + '<span class="who"><span class="dot"></span>Previous quotes</span><span class="spacer"></span>' +
'    <button class="btn btn-ghost" type="button" id="newQuote"><span class="ghost-label">New quote</span>' + ICON.plus + '</button>' +
'    <button class="icon-btn" type="button" id="closeChat" aria-label="Close">' + ICON.x + '</button></div>' +
'  <div class="history" id="history" aria-label="Past quote chats"><div class="history-inner">' +
'    <div class="history-head"><h2>Your quote chats</h2></div><div id="historyList"><p class="history-empty">Loading your quotes…</p></div>' +
'    <p class="fine" style="font-size:12.5px;color:var(--faint);margin-top:18px">Quotes are saved in this browser for this website. Started somewhere else? Open the link in your quote email.</p>' +
'  </div></div>' +
'</div>';
  }

  /* ---------- history cards (shared by both modes) ---------- */
  function renderHistory(box, list, info, currentId, onPick) {
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="history-empty">No earlier quote chats on this device yet.</p>'; return; }
    list.forEach(function (it) {
      var x = info[it.id] || {}, q = x.quote;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hcard';
      var title = x.company ? x.company + (x.product ? ' · ' + x.product : '') : it.title;
      var meta = [fmtDate(x.updated_at || it.ts), STAGE[x.stage] || (x.stage ? 'In progress' : 'Started'), q && q.id ? q.id : ''].filter(Boolean).join(' · ');
      var val = q && q.total != null ? '<div class="v">' + esc(money(q.discounted_total != null ? q.discounted_total : q.total, q.currency || 'CAD')) + (q.quantity ? '<small>' + Number(q.quantity).toLocaleString('en-CA') + ' units</small>' : '') + '</div>' : '<div class="v"></div>';
      b.innerHTML = '<div class="t">' + esc(title) + (it.id === currentId ? '<span class="tag">Current</span>' : '') + '</div>' + val + '<div class="m">' + esc(meta) + '</div>';
      b.addEventListener('click', function () { onPick(it.id); });
      box.appendChild(b);
    });
  }

  /* =================================================================== */
  function mount(opts) {
    opts = opts || {};
    var cfg = readConfig();
    applyTheme(cfg);
    document.documentElement.classList.add('embedded');
    var bridge = makeBridge(cfg);
    var root = document.getElementById(opts.rootId || 'app');
    if (opts.mode === 'quotes') return mountQuotes(cfg, bridge, root);
    return mountChat(cfg, bridge, root);
  }

  function chatUrl(cfg, extra) {
    var p = new URLSearchParams(location.search);
    ['q', 'format', 'resume', 'new', 'ask'].forEach(function (k) { p.delete(k); });
    Object.keys(extra || {}).forEach(function (k) { if (extra[k]) p.set(k, extra[k]); });
    return '/embed/chat?' + p.toString();
  }

  function mountQuotes(cfg, bridge, root) {
    root.innerHTML = quotesMarkup();
    var box = $('#historyList');
    var current = ss('wp_session') || '';
    function pick(id) {
      if (bridge.inFrame && cfg.sourceOrigin) bridge.send('wp:open-chat', { resume: id });
      else location.href = chatUrl(cfg, { resume: id });
    }
    function load() {
      var list = getList(); renderHistory(box, list, {}, current, pick);
      if (!list.length) return;
      post(HISTORY_URL, { sessionIds: list.map(function (x) { return x.id; }) }).then(function (d) {
        var info = {}; (d.sessions || []).forEach(function (x) { if (x && x.id) info[x.id] = x; });
        /* same rule as the home page: drop chats the server has no record of */
        var kept = getList().filter(function (x) { return info[x.id]; });
        ss('wp_sessions', JSON.stringify(kept));
        renderHistory(box, kept, info, current, pick);
      }).catch(function () {});
    }
    function close() { if (bridge.inFrame) bridge.send('wp:close'); else if (cfg.sourceUrl) location.href = cfg.sourceUrl; }
    $('#closeChat').addEventListener('click', close);
    $('#newQuote').addEventListener('click', function () { if (bridge.inFrame && cfg.sourceOrigin) bridge.send('wp:open-chat', { resume: '', fresh: true }); else location.href = chatUrl(cfg, { 'new': '1' }); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    bridge.on('wp:refresh', function () { current = ss('wp_session') || ''; load(); });
    load();
    bridge.send('wp:ready', { surface: 'quotes' });
  }

  function mountChat(cfg, bridge, root) {
    root.innerHTML = chatMarkup();
    var sessionId = ss('wp_session') || uuid();
    if (cfg.resume) { sessionId = cfg.resume; remember(cfg.resume, 'Saved quote'); }
    ss('wp_session', sessionId);

    var metadata = {
      page_url: cfg.sourceUrl || (document.referrer || location.href).split('#')[0],
      utm_source: cfg.utm.utm_source || '', utm_medium: cfg.utm.utm_medium || '', utm_campaign: cfg.utm.utm_campaign || '',
      referrer: cfg.ref || '',
      surface: cfg.surface
    };
    if (cfg.utm.utm_term) metadata.utm_term = cfg.utm.utm_term;
    if (cfg.utm.utm_content) metadata.utm_content = cfg.utm.utm_content;
    if (cfg.campaign) metadata.campaign = cfg.campaign;
    try { metadata.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}

    var chat = $('#chat'), inner = $('#threadInner'), thread = $('#thread'), input = $('#chatInput'), send = $('#chatSend');
    var busy = false, started = false, stage = 0, engaged = false, bookedNow = false, lastSent = '';
    var pendingAsk = cfg.ask && cfg.resume ? ASK_MSG[cfg.ask] : '';
    function updateCallBtn() { $('#callBtn').classList.toggle('show', engaged && !bookedNow); }
    function announceSession() { bridge.send('wp:session', { session_id: sessionId }); }

    function setStage(n) {
      if (n < stage) return; stage = n;
      document.querySelectorAll('#progress span').forEach(function (s) { var k = +s.dataset.s; s.className = k < n ? 'done' : (k === n ? 'now' : ''); });
    }
    function inferStage(text) {
      var t = text.toLowerCase();
      if (/(meeting|calendar invite|book|call with)/.test(t) && stage >= 3) setStage(4);
      else if (/q-[a-z0-9]{8}/.test(t) || /(unit price|total)/.test(t)) setStage(3);
      else if (/(size|material|finish|zipper|ink|structure|dimensions|board|laminat)/.test(t)) setStage(2);
      else if (/(email|company|name|phone|website)/.test(t)) setStage(1);
    }
    function greet() {
      started = true;
      addBot('Hi, I’m Riley, Willowpack’s AI quote specialist. What are you packaging, and do you already know the format you want?', ['Stand-up pouches', 'Roll labels', 'Product boxes', 'Roll stock', 'Not sure yet']);
    }
    function scrollEnd() { requestAnimationFrame(function () { thread.scrollTop = thread.scrollHeight; }); }
    function row(cls) { var r = document.createElement('div'); r.className = 'msg ' + cls; inner.appendChild(r); return r; }
    function addUser(text) {
      var r = row('user'); r.innerHTML = '<div class="bubble">' + esc(text).replace(/\n/g, '<br>') + '</div>'; scrollEnd();
      inner.querySelectorAll('.replies').forEach(function (x) { x.classList.add('used'); });
    }
    function addBot(text, chips, quote) {
      text = String(text || '');
      var r = row('bot');
      var parsed = chips ? { text: text, opts: chips } : splitOptions(text);
      r.innerHTML = '<img class="avatar" src="' + MARK + '" alt=""><div class="bubble">' + md(parsed.text) + '</div>';
      var o = parsed.opts;
      if (o.length) {
        var box = document.createElement('div'); box.className = 'replies';
        var isSlots = o.every(function (x) { return x.split(' · ').length >= 3; });
        if (isSlots) box.classList.add('slots');
        o.forEach(function (x) {
          var rec = /★/.test(x), v = x.replace(/\s*★\s*/g, '').trim();
          var b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (rec ? ' rec' : '') + (isSlots ? ' slot' : '');
          if (isSlots) { var pt = v.split(' · '); b.innerHTML = '<b>' + esc(pt[0] + ' · ' + pt[1]) + '</b><span>with ' + esc(pt.slice(2).join(' · ')) + '</span>'; }
          else b.textContent = v;
          b.addEventListener('click', function () { if (busy) return; b.classList.add('picked'); ask(v); });
          box.appendChild(b);
        });
        r.querySelector('.bubble').appendChild(box);
      }
      if (quote) showQuote(quote); else detectQuote(parsed.text); inferStage(parsed.text); scrollEnd(); return r;
    }
    function showQuote(qt) {
      if (!qt || !qt.id || qt.total == null) return;
      ss('wp_has_quote', '1');
      var cur = qt.currency || 'CAD', tot = qt.discounted_total != null ? qt.discounted_total : qt.total;
      $('#qId').textContent = 'Quote ' + qt.id + (qt.quantity ? ' · ' + Number(qt.quantity).toLocaleString('en-CA') + ' units' : '') + (qt.summary ? ' · ' + qt.summary : '');
      $('#qVal').textContent = money(tot, cur) + (qt.discounted_total != null ? ' (5% chat discount)' : '');
      $('#quotePill').classList.add('show'); setStage(3);
      bridge.send('wp:quote', { status: 'quoted', quote_id: String(qt.id) });
    }
    function detectQuote(text) {
      var id = text.match(/\bQ-[A-Z0-9]{8}\b/);
      if (!id) return;
      var tot = text.match(/total[^\n$]*?(?:CAD|USD|C\$|US\$)?\s*\$\s?([\d,]+(?:\.\d{2})?)/i) || text.match(/\$\s?([\d,]+\.\d{2})/);
      var cur = /USD|US\$/.test(text) ? 'USD' : 'CAD';
      $('#qId').textContent = 'Quote ' + id[0];
      $('#qVal').textContent = tot ? cur + ' $' + tot[1] : 'Ready';
      $('#quotePill').classList.add('show');
      bridge.send('wp:quote', { status: 'quoted', quote_id: id[0] });
    }
    function showMeeting(mt) {
      if (!mt || !mt.time) return;
      var when = mt.time; try { when = new Date(mt.time).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) {}
      var bb = $('#bookBtn'); bb.classList.add('booked'); bb.disabled = true; bb.textContent = '✓ Call booked';
      bookedNow = true; updateCallBtn();
      bb.title = when + (mt.rep ? ' with ' + mt.rep : '');
      if (!$('#quotePill').classList.contains('show')) { $('#qId').textContent = 'Your call'; $('#qVal').textContent = when; }
      else $('#qId').textContent = $('#qId').textContent.replace(/ · Call:.*$/, '') + ' · Call: ' + when + (mt.rep ? ' with ' + mt.rep.split(' ')[0] : '');
      $('#quotePill').classList.add('show'); setStage(4);
      bridge.send('wp:quote', { status: 'meeting_booked' });
    }

    function ask(text) {
      text = String(text || '').trim();
      if (busy || !text) return;
      started = true; busy = true; send.disabled = true; lastSent = text;
      remember(sessionId, text); announceSession();
      addUser(text); engaged = true; updateCallBtn();
      var t = row('bot'); t.innerHTML = '<img class="avatar" src="' + MARK + '" alt=""><div class="bubble"><span class="typing" aria-label="Assistant is typing"><i></i><i></i><i></i></span></div>'; scrollEnd();
      var payload = { action: 'sendMessage', sessionId: sessionId, chatInput: text, metadata: metadata };
      if (debugOn()) { try { console.info('[willowpack] → n8n', JSON.parse(JSON.stringify(payload))); } catch (e) {} }
      fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { if (Array.isArray(d)) d = d[0] || {}; t.remove(); addBot(d.output || d.text || 'I didn’t catch that. Could you rephrase?', null, d.quote || null); if (d.meeting) showMeeting(d.meeting); })
        .catch(function () {
          t.remove();
          var e = row('bot error');
          e.innerHTML = '<img class="avatar" src="' + MARK + '" alt=""><div class="bubble">That message didn’t go through. <button class="retry" type="button">Send again</button></div>';
          e.querySelector('.retry').addEventListener('click', function () {
            e.remove(); var u = inner.querySelectorAll('.msg.user'); if (u.length) u[u.length - 1].remove(); busy = false; ask(text);
          });
          scrollEnd();
        })
        .then(function () { busy = false; send.disabled = !input.value.trim(); input.focus(); });
    }

    function resetThread() {
      inner.innerHTML = ''; stage = 0; setStage(0); $('#quotePill').classList.remove('show');
      var bb = $('#bookBtn'); bb.classList.remove('booked'); bb.disabled = false; bb.textContent = 'Book a call';
      engaged = false; bookedNow = false; updateCallBtn();
    }
    /* New product inquiry: fresh chat, carry over contact details only */
    function newInquiry(prefill) {
      var old = sessionId;
      closeHistory();
      sessionId = uuid(); ss('wp_session', sessionId);
      delete metadata.carry;
      resetThread(); started = true;
      var go = function () { if (prefill) ask(prefill); else greet(); };
      if (!known(old)) { started = false; go(); return; }
      post(HISTORY_URL, { sessionIds: [old] }).then(function (d) {
        var x = (d.sessions || [])[0]; var pr = x && x.profile;
        if (pr && (pr.email || pr.company)) { var c = {}; Object.keys(pr).forEach(function (k) { if (pr[k]) c[k] = pr[k]; }); metadata.carry = c; }
      }).catch(function () {}).then(function () { started = false; go(); });
    }
    function loadSession(id) {
      resetThread(); started = true; busy = true; send.disabled = true; delete metadata.carry;
      var t = row('bot'); t.innerHTML = '<img class="avatar" src="' + MARK + '" alt=""><div class="bubble"><span class="typing" aria-label="Loading your chat"><i></i><i></i><i></i></span></div>';
      post(HISTORY_URL, { sessionIds: [id], turnsFor: id }).then(function (d) {
        t.remove();
        var turns = d.turns || [];
        if (!turns.length) { greet(); return; }
        turns.forEach(function (tu) { if (tu.user) addUser(tu.user); if (tu.bot) addBot(tu.bot); });
        engaged = turns.some(function (tu) { return tu.user; }); updateCallBtn();
        if (d.quote) showQuote(d.quote);
        var me = (d.sessions || [])[0]; if (me && me.meeting_time) showMeeting({ time: me.meeting_time, rep: me.meeting_rep });
        announceSession();
      }).catch(function () { t.remove(); addBot('I couldn’t load that earlier chat right now. You can keep going here, or start a new quote.'); })
        .then(function () { busy = false; send.disabled = !input.value.trim(); scrollEnd(); if (pendingAsk) { var a = pendingAsk; pendingAsk = ''; ask(a); } });
    }
    /* Entry point shared by first load and parent commands (same logic as openChat(prefill) on the home page) */
    function start(prefill) {
      if (prefill) { if (known(sessionId)) newInquiry(prefill); else ask(prefill); }
      else if (!started) { if (known(sessionId)) loadSession(sessionId); else greet(); }
    }
    function resume(id) {
      if (!validId(id)) return;
      closeHistory();
      if (id === sessionId && started) return;
      sessionId = id; ss('wp_session', id); remember(id, 'Saved quote'); loadSession(id);
    }

    function openHistory() {
      chat.classList.add('show-history');
      var box = $('#historyList');
      var pick = function (id) { closeHistory(); if (id === sessionId && started) return; sessionId = id; ss('wp_session', sessionId); loadSession(id); };
      var list = getList(); renderHistory(box, list, {}, sessionId, pick);
      if (!list.length) return;
      post(HISTORY_URL, { sessionIds: list.map(function (x) { return x.id; }) }).then(function (d) {
        var info = {}; (d.sessions || []).forEach(function (x) { info[x.id] = x; }); renderHistory(box, getList(), info, sessionId, pick);
      }).catch(function () {});
    }
    function closeHistory() { chat.classList.remove('show-history'); input.focus(); }
    function closeChat() { if (bridge.inFrame) bridge.send('wp:close'); else if (cfg.sourceUrl) location.href = cfg.sourceUrl; }

    /* ---------- Request a call (same as home page) ---------- */
    var cmBack = $('#cmBack'), cmPhone = $('#cmPhone'), cmMsg = $('#cmMsg'), cmSubmit = $('#cmSubmit'), cmLast = null;
    function getProfile() { try { return JSON.parse(ss('wp_profile') || 'null'); } catch (e) { return null; } }
    function openCall() {
      cmLast = document.activeElement;
      cmPhone.value = ss('wp_phone') || cmPhone.value || '';
      cmMsg.textContent = ''; cmMsg.className = 'msg';
      var pr = getProfile();
      $('#cmTitle').textContent = 'Continue this quote by phone';
      $('#cmSub').textContent = (pr && pr.first_name ? 'Hi ' + pr.first_name + '! ' : '') + 'Our AI packaging assistant will call you in about a minute and pick up right where this chat left off, so you can finish the quote or book time with a rep.';
      cmBack.classList.add('open'); setTimeout(function () { cmPhone.focus(); }, 30);
    }
    function closeCall() { cmBack.classList.remove('open'); if (cmLast && cmLast.focus) cmLast.focus(); }
    $('#cmCancel').addEventListener('click', closeCall);
    cmBack.addEventListener('click', function (e) { if (e.target === cmBack) closeCall(); });
    $('#cmForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var digits = cmPhone.value.replace(/\D/g, '');
      if (digits.length < 10) { cmMsg.className = 'msg err'; cmMsg.textContent = 'Please enter a 10-digit phone number.'; return; }
      if (!$('#cmConsent').checked) { cmMsg.className = 'msg err'; cmMsg.textContent = 'Please tick the box so we can call you.'; return; }
      cmSubmit.disabled = true; cmMsg.className = 'msg'; cmMsg.textContent = 'Connecting…';
      var ids = getList().map(function (x) { return x.id; });
      var pr2 = getProfile();
      post(CALL_URL, { source: 'chat', sessionId: sessionId, sessionIds: ids, phone: cmPhone.value, consent: true, timezone: metadata.timezone || '', carry: metadata.carry || (pr2 && pr2.first_name ? pr2 : null) })
        .then(function (d) {
          cmMsg.className = 'msg ' + (d.ok ? 'ok' : 'err'); cmMsg.textContent = d.message || (d.ok ? 'Calling you now.' : 'Something went wrong.');
          if (d.ok) { ss('wp_phone', cmPhone.value); setTimeout(closeCall, 4000); setTimeout(function () { cmSubmit.disabled = false; }, 180000); }
          else cmSubmit.disabled = false;
        })
        .catch(function () { cmMsg.className = 'msg err'; cmMsg.textContent = 'We could not reach our phone system. Please try again in a moment.'; cmSubmit.disabled = false; });
    });

    /* ---------- Inputs ---------- */
    function rs() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }
    input.addEventListener('input', function () { rs(); send.disabled = busy || !input.value.trim(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); var f = $('#chatForm'); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true })); } });
    $('#chatForm').addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; if (!v.trim()) return; input.value = ''; rs(); send.disabled = true; ask(v); });

    $('#callBtn').addEventListener('click', openCall);
    $('#closeChat').addEventListener('click', closeChat);
    $('#bookBtn').addEventListener('click', function () { if ($('#bookBtn').classList.contains('booked')) return; ask(BOOK_MSG); });
    $('#newQuote').addEventListener('click', function () { newInquiry(''); input.focus(); });
    $('#historyBtn').addEventListener('click', function () { chat.classList.contains('show-history') ? closeHistory() : openHistory(); });
    $('#historyClose').addEventListener('click', closeHistory);
    addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (cmBack.classList.contains('open')) { closeCall(); return; }
      if (chat.classList.contains('show-history')) closeHistory(); else closeChat();
    });

    /* ---------- Parent commands ---------- */
    bridge.on('wp:ask', function (d) {
      var text = String(d.q || (FORMATS[d.format] && FORMATS[d.format].msg) || '').slice(0, 2000);
      if (text && !busy && text === lastSent && engaged) { input.focus(); return; }
      start(text); setTimeout(function () { input.focus(); }, 30);
    });
    bridge.on('wp:resume', function (d) { if (ASK_MSG[d.ask]) pendingAsk = ASK_MSG[d.ask]; if (d.fresh) newInquiry(''); else resume(d.resume); setTimeout(function () { input.focus(); }, 30); });
    bridge.on('wp:focus', function () { input.focus(); });

    /* ---------- First run ---------- */
    var first = cfg.q || (FORMATS[cfg.format] && FORMATS[cfg.format].msg) || '';
    if (cfg.resume && !first) loadSession(cfg.resume);
    else if (cfg.fresh && !first) newInquiry('');
    else start(first);
    if (known(sessionId)) announceSession();
    bridge.send('wp:ready', { surface: 'chat' });
    setTimeout(function () { input.focus(); }, 60);
  }

  window.WPChat = { mount: mount, FORMATS: FORMATS };
})();
