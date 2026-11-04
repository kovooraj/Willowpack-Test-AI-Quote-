/*! Willowpack quote chat embed v1 | https://willowpacktestaiquote.vercel.app/admin */
/*
 * Paste where the box should go:
 *   <div data-willowpack-chat data-theme="dark" data-accent="#1F9F71" data-campaign="spring-pouch-promo"
 *        data-formats="pouches,labels,boxes,rollstock,help"></div>
 *   <div data-willowpack-quotes data-label="Previous quotes" data-variant="outline"></div>
 *   <script src="https://willowpacktestaiquote.vercel.app/embed.js" async></script>
 * Only global: window.WillowpackChat { open({q, format}), openQuotes(), close(), scan(), version }.
 * Everything drawn on the host page lives in Shadow DOM. postMessage is versioned ({wp:1,type}) and origin-checked.
 */
(function (w, d) {
  'use strict';
  if (w.WillowpackChat && w.WillowpackChat.version) { w.WillowpackChat.scan(); return; }

  var VERSION = '1.0.1';
  var script = d.currentScript || d.querySelector('script[src*="embed.js"],script[src*="/embed/v1.js"]');
  var BASE = 'https://willowpacktestaiquote.vercel.app';
  try { if (script && script.src) BASE = new URL(script.src, location.href).origin; } catch (e) {}
  var Z = '2147483647';
  var GREEN = '#1F9F71';

  var FORMATS = {
    pouches: 'Stand-up pouches', labels: 'Roll labels', boxes: 'Product boxes', rollstock: 'Roll stock', help: 'Help me choose'
  };
  var DEF = {
    placeholder: 'e.g. 10,000 roll labels for our new SKU',
    button: 'Get my quote',
    hint: 'No account needed · Price breaks in seconds · A real rep finalizes it',
    formatsLabel: 'Or start with a format'
  };

  /* ---------- small utils ---------- */
  function el(tag, attrs, html) { var e = d.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hex(v) { v = String(v || '').trim(); return /^#?[0-9a-f]{6}$/i.test(v) ? '#' + v.replace('#', '') : GREEN; }
  function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80); }
  function cap(k) { return k.charAt(0).toUpperCase() + k.slice(1); }
  function theme(v) { return v === 'light' || v === 'dark' ? v : 'auto'; }
  function pageUrl() { try { var u = new URL(location.href); u.hash = ''; u.searchParams.delete('resume'); return u.toString(); } catch (e) { return location.href.split('#')[0]; } }
  function important(node, css) { for (var k in css) node.style.setProperty(k, css[k], 'important'); }
  function cfgFrom(node) {
    var a = node ? node.dataset : {};
    return {
      theme: theme(a.theme), accent: hex(a.accent), campaign: slug(a.campaign), font: a.font === 'inherit' ? 'inherit' : '',
      surface: a.surface === 'admin-demo' ? 'admin-demo' : ''
    };
  }

  /* Fonts: @font-face does not work inside a shadow root, so the (harmless) Google Fonts sheet goes in <head> once. */
  var fontsDone = false;
  function fonts() {
    if (fontsDone) return; fontsDone = true;
    if (d.querySelector('link[href*="family=Figtree"]')) return;
    d.head.appendChild(el('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&display=swap' }));
  }

  /* Theme tokens shared by every shadow root. :host([data-t]) selects light/dark; auto follows the OS. */
  var TOKENS =
    ':host{all:initial;display:block;--g:' + GREEN + ';--g6:color-mix(in srgb,var(--g) 84%,#000);--bg:#fff;--s:#fff;--s2:#F3F5F3;--tx:#101A16;--mu:#4E5C56;--fa:#7C8882;--ln:#E1E6E2;--ln2:#CBD3CE;' +
    '--sh:0 1px 2px rgba(16,26,22,.06),0 12px 32px -12px rgba(16,26,22,.18);--r:20px;font:400 16px/1.5 Figtree,system-ui,"Segoe UI",sans-serif;color:var(--tx);-webkit-font-smoothing:antialiased}' +
    ':host([data-font=inherit]){font-family:inherit}' +
    ':host([data-t=dark]){--bg:#0B1311;--s:#121D1A;--s2:#17231F;--tx:#E9F0EC;--mu:#A2B2AA;--fa:#73847C;--ln:#1F2D28;--ln2:#2B3B35;--sh:0 1px 2px rgba(0,0,0,.4),0 16px 40px -16px rgba(0,0,0,.6)}' +
    '@media (prefers-color-scheme:dark){:host([data-t=auto]){--bg:#0B1311;--s:#121D1A;--s2:#17231F;--tx:#E9F0EC;--mu:#A2B2AA;--fa:#73847C;--ln:#1F2D28;--ln2:#2B3B35;--sh:0 1px 2px rgba(0,0,0,.4),0 16px 40px -16px rgba(0,0,0,.6)}}' +
    '*,*::before,*::after{box-sizing:border-box}button,textarea{font:inherit;color:inherit}' +
    ':focus-visible{outline:2px solid var(--g);outline-offset:3px}' +
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}';

  function shadowHost(tag, c) {
    var host = d.createElement(tag);
    host.setAttribute('data-t', c.theme);
    if (c.font) host.setAttribute('data-font', 'inherit');
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    return { host: host, root: root };
  }
  function accentCss(c) { return ':host{--g:' + c.accent + '}'; }

  /* ================= Overlay (one per page) ================= */
  var ov = null, chatFrame = null, quotesFrame = null, current = null, hasSession = false, lastFocus = null, scrollY0 = 0, bodyStyle = '';
  var pill = null, readyFrames = [], pendingMsgs = [];

  function frameSrc(path, c, extra) {
    var p = new URLSearchParams();
    p.set('source_url', pageUrl());
    if (d.referrer) p.set('ref', d.referrer.slice(0, 500));
    p.set('theme', c.theme); p.set('accent', c.accent);
    if (c.campaign) p.set('campaign', c.campaign);
    if (c.surface) p.set('surface', c.surface);
    try { new URL(location.href).searchParams.forEach(function (v, k) { if (/^utm_/.test(k)) p.set(k, v.slice(0, 200)); }); } catch (e) {}
    for (var k in extra || {}) if (extra[k]) p.set(k, extra[k]);
    return BASE + path + '?' + p.toString();
  }

  function buildOverlay(c) {
    if (ov) return;
    var sh = shadowHost('willowpack-overlay', c);
    important(sh.host, { position: 'fixed', inset: '0', 'z-index': Z, display: 'none', margin: '0', padding: '0', border: '0', width: '100%', height: '100dvh', background: 'transparent' });
    sh.host.setAttribute('role', 'dialog'); sh.host.setAttribute('aria-modal', 'true'); sh.host.setAttribute('aria-label', 'Willowpack quote assistant');
    var st = el('style', null, TOKENS + accentCss(c) +
      '.b{position:fixed;inset:0;height:100dvh;background:var(--bg);opacity:0;transform:translateY(16px);transition:opacity .25s ease,transform .35s cubic-bezier(.2,.8,.2,1);padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0)}' +
      '.b.on{opacity:1;transform:none}' +
      'iframe{display:block;width:100%;height:100%;border:0;background:var(--bg);color-scheme:normal}' +
      'iframe[hidden]{display:none}' +
      '.ld{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}.ld i{width:28px;height:28px;border-radius:50%;border:3px solid var(--ln2);border-top-color:var(--g);animation:sp .8s linear infinite}' +
      '.ld[hidden]{display:none}@keyframes sp{to{transform:rotate(360deg)}}' +
      '.x{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));right:calc(12px + env(safe-area-inset-right,0px));width:40px;height:40px;border-radius:50%;border:1px solid var(--ln);background:var(--s);color:var(--mu);cursor:pointer;display:grid;place-items:center}' +
      '.x[hidden]{display:none}.x svg{width:18px;height:18px}');
    var box = el('div', { class: 'b' });
    var ld = el('div', { class: 'ld' }, '<i></i>');
    /* Fallback close until the iframe reports ready (the iframe draws its own × once loaded). */
    var x = el('button', { class: 'x', type: 'button', 'aria-label': 'Close' }, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    x.addEventListener('click', close);
    box.appendChild(ld); box.appendChild(x);
    sh.root.appendChild(st); sh.root.appendChild(box);
    d.body.appendChild(sh.host);
    ov = { host: sh.host, root: sh.root, box: box, ld: ld, x: x, style: st };
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(); } }, true);
    /* Focus trap: the overlay is a single iframe, so anything that focuses outside it goes back in. */
    d.addEventListener('focusin', function (e) { if (isOpen() && e.target !== ov.host) focusFrame(); }, true);
  }
  function restyle(c) {
    ov.host.setAttribute('data-t', c.theme);
    if (c.font) ov.host.setAttribute('data-font', 'inherit'); else ov.host.removeAttribute('data-font');
    ov.style.textContent = ov.style.textContent.replace(/:host\{--g:#[0-9a-fA-F]{6}\}/, accentCss(c));
  }
  function isOpen() { return ov && ov.host.style.getPropertyValue('display') !== 'none'; }
  function visibleFrame() { return chatFrame && !chatFrame.hidden ? chatFrame : quotesFrame && !quotesFrame.hidden ? quotesFrame : null; }
  function focusFrame() { var f = visibleFrame(); if (f) { try { f.focus(); } catch (e) {} } }

  function makeFrame(src, title) {
    var f = el('iframe', { src: src, title: title, allow: 'clipboard-write', referrerpolicy: 'strict-origin-when-cross-origin' });
    f.hidden = true;
    ov.box.insertBefore(f, ov.ld);
    return f;
  }
  function show(frame) {
    [chatFrame, quotesFrame].forEach(function (f) { if (f) f.hidden = f !== frame; });
    var ready = readyFrames.indexOf(frame) >= 0;
    ov.ld.hidden = ready; ov.x.hidden = ready;
    if (!isOpen()) {
      lastFocus = d.activeElement;
      scrollY0 = w.scrollY || 0; bodyStyle = d.body.getAttribute('style') || '';
      /* Scroll lock that also holds on iOS Safari */
      important(d.body, { overflow: 'hidden', position: 'fixed', top: (-scrollY0) + 'px', left: '0', right: '0', width: '100%' });
      ov.host.style.setProperty('display', 'block', 'important');
      requestAnimationFrame(function () { ov.box.classList.add('on'); });
      if (pill) pill.host.style.setProperty('display', 'none', 'important');
    }
    setTimeout(focusFrame, 30);
  }
  function close() {
    if (!isOpen()) return;
    ov.box.classList.remove('on');
    ov.host.style.setProperty('display', 'none', 'important');   /* hidden, not destroyed: chat state is kept */
    if (bodyStyle) d.body.setAttribute('style', bodyStyle); else d.body.removeAttribute('style');
    w.scrollTo(0, scrollY0);
    if (hasSession) showPill();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  function post(frame, type, data) {
    if (!frame) return;
    var m = { wp: 1, type: type }; for (var k in data || {}) m[k] = data[k];
    if (readyFrames.indexOf(frame) < 0) { pendingMsgs.push([frame, m]); return; }
    try { frame.contentWindow.postMessage(m, BASE); } catch (e) {}
  }

  function openChat(opts, c) {
    opts = opts || {}; c = c || current || cfgFrom(d.querySelector('[data-willowpack-chat]'));
    fonts(); buildOverlay(c);
    if (!chatFrame) {
      current = c; restyle(c);
      chatFrame = makeFrame(frameSrc('/embed/chat', c, { q: opts.q ? String(opts.q).slice(0, 2000) : '', format: opts.format || '', resume: opts.resume || '', 'new': opts.fresh ? '1' : '' }), 'Willowpack quote assistant');
    } else if (opts.resume || opts.fresh) post(chatFrame, 'wp:resume', { resume: opts.resume || '', fresh: !!opts.fresh });
    else if (opts.q || opts.format) post(chatFrame, 'wp:ask', { q: opts.q ? String(opts.q).slice(0, 2000) : '', format: opts.format || '' });
    else post(chatFrame, 'wp:focus');
    show(chatFrame);
  }
  function openQuotes(c) {
    c = c || current || cfgFrom(d.querySelector('[data-willowpack-quotes],[data-willowpack-chat]'));
    fonts(); buildOverlay(c);
    if (!quotesFrame) { if (!current) { current = c; restyle(c); } quotesFrame = makeFrame(frameSrc('/embed/quotes', c), 'Your Willowpack quotes'); }
    else post(quotesFrame, 'wp:refresh');
    show(quotesFrame);
  }

  /* ---------- messages from our iframes ---------- */
  w.addEventListener('message', function (e) {
    if (e.origin !== BASE) return;
    var m = e.data; if (!m || m.wp !== 1 || typeof m.type !== 'string') return;
    var frame = chatFrame && e.source === chatFrame.contentWindow ? chatFrame : quotesFrame && e.source === quotesFrame.contentWindow ? quotesFrame : null;
    if (!frame) return;
    switch (m.type) {
      case 'wp:ready':
        if (readyFrames.indexOf(frame) < 0) readyFrames.push(frame);
        if (!frame.hidden) { ov.ld.hidden = true; ov.x.hidden = true; focusFrame(); }
        pendingMsgs = pendingMsgs.filter(function (p) { if (p[0] !== frame) return true; try { frame.contentWindow.postMessage(p[1], BASE); } catch (x) {} return false; });
        break;
      case 'wp:close': if (!frame.hidden) close(); break;  /* ignore a late close from a frame that is no longer showing */
      case 'wp:session': if (m.session_id) { hasSession = true; emit('session', { session_id: String(m.session_id) }); } break;
      case 'wp:quote': emit('quote', { status: String(m.status || ''), quote_id: m.quote_id ? String(m.quote_id) : '' }); break;
      case 'wp:open-chat': openChat(m.fresh ? { fresh: true } : { resume: /^[A-Za-z0-9-]{8,64}$/.test(m.resume || '') ? m.resume : '' }); break;
    }
  });
  /* Page-level DOM events so marketers can hook analytics: willowpack:session / willowpack:quote */
  function emit(name, detail) { try { w.dispatchEvent(new CustomEvent('willowpack:' + name, { detail: detail })); } catch (e) {} }

  /* ================= Continue my quote pill ================= */
  function showPill() {
    var c = current || cfgFrom(null);
    if (!pill) {
      var sh = shadowHost('willowpack-pill', c);
      important(sh.host, { position: 'fixed', right: 'calc(20px + env(safe-area-inset-right,0px))', bottom: 'calc(20px + env(safe-area-inset-bottom,0px))', 'z-index': String(+Z - 1), display: 'none', margin: '0' });
      sh.root.appendChild(el('style', null, TOKENS + accentCss(c) +
        'button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:12px 20px;font-weight:600;font-size:15px;background:var(--g);color:#fff;cursor:pointer;box-shadow:0 18px 50px -18px color-mix(in srgb,var(--g) 70%,transparent),0 6px 16px -6px rgba(0,0,0,.25);animation:r .35s cubic-bezier(.2,.8,.2,1)}' +
        'button:hover{background:var(--g6)}svg{width:16px;height:16px}@keyframes r{from{opacity:0;transform:translateY(8px)}}'));
      var b = el('button', { type: 'button' }, 'Continue my quote<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>');
      b.addEventListener('click', function () { openChat({}); });
      sh.root.appendChild(b); d.body.appendChild(sh.host); pill = sh;
    }
    pill.host.style.setProperty('display', 'block', 'important');
  }

  /* ================= Inline chat box ================= */
  var BOX_CSS =
    '.w{max-width:var(--mw,760px);margin:0 auto;text-align:left}' +
    '.c{background:var(--s);border:1px solid var(--ln);border-radius:var(--r);padding:14px 14px 12px 18px;box-shadow:var(--sh);transition:border-color .15s,box-shadow .2s}' +
    '.c:focus-within{border-color:var(--g);box-shadow:var(--sh),0 0 0 4px color-mix(in srgb,var(--g) 18%,transparent)}' +
    'textarea{display:block;width:100%;border:0;background:transparent;resize:none;outline:none;min-height:26px;max-height:180px;line-height:1.5;padding:2px 0 12px;font-size:16.5px}' +
    'textarea::placeholder{color:var(--fa)}textarea,textarea:focus,textarea:focus-visible{outline:none!important;box-shadow:none!important}' +
    '.row{display:flex;align-items:center;gap:10px}.h{font-size:13px;color:var(--fa)}' +
    '.go{margin-left:auto;height:40px;border-radius:999px;border:0;background:var(--g);color:#fff;display:inline-flex;align-items:center;gap:8px;padding:0 16px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s,opacity .15s}' +
    '.go:hover{background:var(--g6)}.go:disabled{opacity:.45;cursor:default}.go svg{width:16px;height:16px}' +
    '.ql{margin:26px 0 12px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--fa);text-align:center}' +
    '.q{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.q:first-child{margin-top:0}' +
    '.f{border:1px solid var(--ln2);background:var(--s);border-radius:999px;padding:8px 14px;font-size:14px;font-weight:500;color:var(--mu);cursor:pointer;transition:color .15s,border-color .15s,transform .15s}' +
    '.f:hover{color:var(--tx);border-color:var(--g);transform:translateY(-1px)}' +
    '@media (max-width:560px){.h{display:none}}';

  function renderChatBox(node) {
    var a = node.dataset, c = cfgFrom(node);
    var sh = shadowHost('willowpack-chat-box', c);
    var radius = parseInt(a.radius, 10);
    var mw = parseInt(a.maxWidth, 10);
    var vars = (radius >= 0 && radius <= 40 ? '--r:' + radius + 'px;' : '') + (mw >= 280 && mw <= 1400 ? '--mw:' + mw + 'px;' : '');
    /* Built-in formats, plus custom buttons: data-formats="pouches,custom1" with data-label-custom1 + data-message-custom1 */
    var keys = (a.formats == null ? 'pouches,labels,boxes,rollstock,help' : a.formats).split(',').map(function (s) { return s.trim().toLowerCase(); })
      .filter(function (k) { return FORMATS[k] || (/^custom\d{1,2}$/.test(k) && a['message' + cap(k)] && a['label' + cap(k)]); });
    var ph = a.placeholder || DEF.placeholder, btn = a.button || DEF.button, hint = a.hint == null ? DEF.hint : a.hint;
    var ql = a.formatsLabel == null ? DEF.formatsLabel : a.formatsLabel;
    var chips = keys.map(function (k) { return '<button class="f" type="button" data-k="' + k + '">' + esc(a['label' + cap(k)] || FORMATS[k]) + '</button>'; }).join('');
    var id = 'wp' + Math.random().toString(36).slice(2, 8);
    sh.root.innerHTML = '<style>' + TOKENS + accentCss(c) + ':host{' + vars + '}' + BOX_CSS + '</style>' +
      '<div class="w"><form class="c" autocomplete="off"><label class="sr" for="' + id + '">Describe what you’re packaging</label>' +
      '<textarea id="' + id + '" rows="1" placeholder="' + esc(ph) + '"></textarea>' +
      '<div class="row">' + (hint ? '<span class="h">' + esc(hint) + '</span>' : '') +
      '<button class="go" type="submit" disabled>' + esc(btn) + ' <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button></div></form>' +
      (keys.length ? (ql ? '<p class="ql">' + esc(ql) + '</p>' : '<div style="height:18px"></div>') + '<div class="q" role="group" aria-label="Start with a format">' + chips + '</div>' : '') + '</div>';
    var f = sh.root.querySelector('form'), ta = sh.root.querySelector('textarea'), go = sh.root.querySelector('.go');
    function rs() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'; }
    ta.addEventListener('input', function () { rs(); go.disabled = !ta.value.trim(); });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
    f.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    function submit() { var v = ta.value.trim(); if (!v) return; ta.value = ''; rs(); go.disabled = true; openChat({ q: v }, c); }
    sh.root.querySelectorAll('.f').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k');
        if (FORMATS[k]) openChat({ format: k }, c); else openChat({ q: String(a['message' + cap(k)]).slice(0, 2000) }, c);
      });
    });
    node.innerHTML = ''; node.appendChild(sh.host);
  }

  /* ================= Previous quotes button ================= */
  function renderQuotesBtn(node) {
    var a = node.dataset, c = cfgFrom(node);
    var sh = shadowHost('willowpack-quotes-button', c);
    important(sh.host, { display: 'inline-block' });
    var filled = a.variant === 'filled';
    sh.root.innerHTML = '<style>' + TOKENS + accentCss(c) + ':host{display:inline-block}' +
      'button{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:11px 20px;font-weight:600;font-size:15px;cursor:pointer;transition:background-color .15s,border-color .15s,transform .15s;' +
      (filled ? 'border:0;background:var(--g);color:#fff}button:hover{background:var(--g6);transform:translateY(-1px)}' : 'border:1px solid var(--ln2);background:transparent;color:var(--tx)}button:hover{border-color:var(--g);background:color-mix(in srgb,var(--g) 8%,transparent)}') +
      'svg{width:16px;height:16px}</style>' +
      '<button type="button"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>' + esc(a.label || 'Previous quotes') + '</button>';
    sh.root.querySelector('button').addEventListener('click', function () { openQuotes(c); });
    node.innerHTML = ''; node.appendChild(sh.host);
  }

  /* ================= boot ================= */
  function scan() {
    d.querySelectorAll('[data-willowpack-chat]').forEach(function (n) { if (!n.__wp || n.__wpSig !== sig(n)) { n.__wp = 1; n.__wpSig = sig(n); renderChatBox(n); } });
    d.querySelectorAll('[data-willowpack-quotes]').forEach(function (n) { if (!n.__wp || n.__wpSig !== sig(n)) { n.__wp = 1; n.__wpSig = sig(n); renderQuotesBtn(n); } });
  }
  function sig(n) { return JSON.stringify(n.dataset); }
  function boot() {
    fonts(); scan();
    /* Customer email links land on <landing page>?resume=<session_id> */
    var r = ''; try { r = new URL(location.href).searchParams.get('resume') || ''; } catch (e) {}
    if (/^[A-Za-z0-9-]{8,64}$/.test(r)) {
      try { var u = new URL(location.href); u.searchParams.delete('resume'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) {}
      openChat({ resume: r });
    }
  }

  w.WillowpackChat = {
    version: VERSION,
    open: function (o) { o = o || {}; openChat({ q: o.q || '', format: FORMATS[o.format] ? o.format : '' }); },
    openQuotes: function () { openQuotes(); },
    close: close,
    scan: scan,
    /* Used by the admin preview to restyle the shared overlay; not needed on landing pages. */
    _reset: function () { if (ov) { close(); ov.host.remove(); } if (pill) pill.host.remove(); ov = chatFrame = quotesFrame = current = pill = null; readyFrames = []; pendingMsgs = []; hasSession = false; }
  };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
