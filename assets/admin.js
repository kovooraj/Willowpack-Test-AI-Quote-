/* Willowpack quote chat admin board. Vanilla JS, no build step. */
(function () {
  'use strict';
  var PROD = 'https://willowpacktestaiquote.vercel.app';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  /* ---------- theme (same key as the home page) ---------- */
  $('#themeBtn').addEventListener('click', function () {
    var t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('wp_theme', t); } catch (e) {}
  });

  /* ---------- system switcher: Sales AI is live, the others are coming soon ---------- */
  var SYSTEMS = [
    { name: 'Sales AI', note: 'AI quote chat · live', live: true, icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
    { name: 'Customer Assistance AI', note: 'Support for existing customers', icon: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13" width="4" height="6" rx="1.5"/><rect x="17.5" y="13" width="4" height="6" rx="1.5"/>' },
    { name: 'Outbound Lead AI', note: 'Prospecting & outreach', icon: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>' }
  ];
  $$('.sys').forEach(function (box) {
    var btn = $('.sys-btn', box), menu = $('.sys-menu', box);
    menu.innerHTML = '<div class="sys-menu-h">Switch system</div>' + SYSTEMS.map(function (s) {
      return '<button class="sys-item' + (s.live ? ' on' : ' soon') + '" type="button" role="menuitemradio" aria-checked="' + (s.live ? 'true' : 'false') + '"' + (s.live ? '' : ' aria-disabled="true"') + '>' +
        '<span class="sys-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + s.icon + '</svg></span>' +
        '<span class="sys-tx"><b>' + esc(s.name) + '</b><small>' + esc(s.note) + '</small></span>' +
        (s.live ? '<svg class="sys-check" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>' : '<span class="sys-soon">Coming soon</span>') + '</button>';
    }).join('');
    var items = $$('.sys-item', menu);
    function open(v, focus) { menu.hidden = !v; btn.setAttribute('aria-expanded', v ? 'true' : 'false'); if (v && focus) items[0].focus(); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(menu.hidden, false); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); open(true, true); } });
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
      var it = e.target.closest('.sys-item');
      if (!it || it.getAttribute('aria-disabled') === 'true') return; /* coming soon: nothing to switch to yet */
      open(false); btn.focus();
    });
    menu.addEventListener('keydown', function (e) {
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Escape') { open(false); btn.focus(); }
      else if (e.key === 'Tab') open(false);
    });
    document.addEventListener('click', function () { if (!menu.hidden) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); } });
  });

  /* ---------- routing + mobile drawer ---------- */
  var TABS = ['demo', 'chat-box', 'quotes-button', 'faq', 'map', 'conversations'];
  var side = $('#side'), scrim = $('#scrim'), menuBtn = $('#menuBtn');
  function drawer(open) { side.classList.toggle('open', open); scrim.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  menuBtn.addEventListener('click', function () { drawer(!side.classList.contains('open')); });
  scrim.addEventListener('click', function () { drawer(false); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && side.classList.contains('open')) drawer(false); });
  function route() {
    var t = (location.hash || '#demo').slice(1); if (TABS.indexOf(t) < 0) t = 'demo';
    TABS.forEach(function (k) { $('#tab-' + k).hidden = k !== t; });
    var nav = t === 'map' ? 'faq' : t; /* the map lives under How it works */
    $$('.side-nav a').forEach(function (a) { if (a.dataset.tab === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#crumb').textContent = $('#tab-' + t).dataset.title;
    document.title = $('#tab-' + t).dataset.title + ' | Willowpack quote chat admin';
    drawer(false);
    if (t === 'demo') { var f = $('#demoFrame'); if (!f.src) f.src = f.dataset.src; }
    if (t === 'conversations') Conv.show();
    if (window.WPSystemMap) { if (t === 'map') WPSystemMap.show(); else WPSystemMap.hide(); }
    if (t === 'chat-box' || t === 'quotes-button') ready(function () { WillowpackChat.scan(); });
    scrollTo(0, 0);
  }
  addEventListener('hashchange', route);

  function ready(fn) { if (window.WillowpackChat && window.WillowpackChat.version) return fn(); var n = 0, iv = setInterval(function () { if ((window.WillowpackChat && window.WillowpackChat.version) || ++n > 100) { clearInterval(iv); if (window.WillowpackChat) fn(); } }, 50); }

  /* ---------- shared: snippet rendering + copy ---------- */
  function hlTag(tag, attrs, close) {
    var s = '<span class="t">&lt;' + tag + '</span>';
    attrs.forEach(function (a) { s += a[1] === true ? ' <span class="a">' + a[0] + '</span>' : ' <span class="a">' + a[0] + '</span>=<span class="v">"' + esc(a[1]) + '"</span>'; });
    return s + '<span class="t">&gt;</span>' + (close ? '<span class="t">&lt;/' + tag + '&gt;</span>' : '');
  }
  function scriptTag() { return hlTag('script', [['src', PROD + '/embed.js'], ['async', true]], true); }
  function setCode(id, html) { $('#' + id).innerHTML = html; }
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = $('#' + b.dataset.copy).textContent, note = b.parentNode.querySelector('.copied');
      var done = function () { note.textContent = 'Copied'; setTimeout(function () { note.textContent = ''; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
      function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) {} t.remove(); }
    });
  });
  function segSnip(panel, onChange) {
    $$('[data-snip]', panel).forEach(function (b) {
      b.addEventListener('click', function () { $$('[data-snip]', panel).forEach(function (x) { x.classList.toggle('on', x === b); }); onChange(b.dataset.snip); });
    });
  }
  function hexOk(v) { return /^#[0-9a-f]{6}$/i.test(v); }
  function wireColor(picker, text, onChange) {
    picker.addEventListener('input', function () { text.value = picker.value.toUpperCase(); text.classList.remove('bad'); onChange(); });
    text.addEventListener('input', function () { var v = text.value.trim(); if (v && v[0] !== '#') v = '#' + v; var ok = hexOk(v); text.classList.toggle('bad', !ok); if (ok) { picker.value = v.toLowerCase(); onChange(); } });
    var reset = text.parentNode.querySelector('[data-reset-accent]');
    if (reset) reset.addEventListener('click', function () { picker.value = '#1f9f71'; text.value = '#1F9F71'; text.classList.remove('bad'); onChange(); });
  }
  /* The admin preview shares one real overlay; restyle it when theme/accent change (drops the preview chat, which is fine). */
  var lastLook = '';
  function refreshEmbeds(look) {
    ready(function () {
      if (lastLook && look !== lastLook) WillowpackChat._reset();
      lastLook = look; WillowpackChat.scan();
    });
  }

  /* ---------- install steps (shared by both builders) ---------- */
  var STEPS = {
    unbounce: function (kind) {
      var what = kind === 'chat' ? 'chat box' : 'button';
      return '<ol class="ol">' +
        '<li><b>Add the ' + what + '.</b> In the Unbounce builder, drag a <b>Custom HTML</b> element to where the ' + what + ' should go and paste the <b>' + (kind === 'chat' ? 'Box' : 'Button') + ' only</b> code. Make it full width' + (kind === 'chat' ? ' and about 240px tall (taller on mobile)' : '') + '.</li>' +
        '<li><b>Add the script once.</b> Open <b>Page Properties → Javascripts → Add New Javascript</b>, name it “Willowpack chat”, set placement to <b>Before Body End Tag</b> and paste the <b>Script only</b> code.</li>' +
        '<li><b>Save, Preview, Publish.</b> The editor doesn’t run scripts, so check it in Preview. Publish when it looks right.</li>' +
        '<li><b>Test it</b> on the live page in a private window:<ul class="test-list">' +
        (kind === 'chat' ? '<li>Type a message and press Get my quote → the full-screen chat opens and your message is already sent.</li><li>Tap a format button → the chat opens with that format.</li><li>Close with × or Esc → a <b>Continue my quote</b> button appears bottom-right and reopens the same chat.</li>' : '<li>Click the button → your saved quote chats open full screen.</li><li>Pick one → that chat reopens where it left off.</li>') +
        '<li>Resume link: add <code>?resume=</code> plus the session ID from a quote email to the page URL → the chat opens by itself.</li>' +
        '<li>Ask a rep to check the lead in Salesforce shows this landing page and your campaign.</li></ul></li></ol>';
    },
    wordpress: function () {
      return '<ol class="ol"><li><b>Box/button:</b> edit the page, add a <b>Custom HTML</b> block where it should go and paste the box/button code.</li>' +
        '<li><b>Script:</b> paste the script once in the same Custom HTML block (or site-wide with a header/footer plugin such as WPCode, in the footer).</li>' +
        '<li><b>Update</b> and test on the live page. Caching plugins: clear the cache after publishing.</li></ol>';
    },
    webflow: function () {
      return '<ol class="ol"><li><b>Box/button:</b> drag an <b>Embed</b> element onto the page and paste the box/button code.</li>' +
        '<li><b>Script:</b> Page settings → <b>Custom code → Before &lt;/body&gt; tag</b>, paste the script. (Or Site settings for every page.)</li>' +
        '<li><b>Publish</b> and test on the published site; custom code doesn’t run in the Designer.</li></ol>';
    },
    html: function () {
      return '<ol class="ol"><li>Paste the box/button <code>&lt;div&gt;</code> where it should appear.</li><li>Paste the script once, just before <code>&lt;/body&gt;</code>.</li><li>That’s it. No other setup, keys or CSS needed.</li></ol>';
    }
  };
  $$('[data-steps]').forEach(function (panel) {
    var kind = panel.dataset.steps;
    panel.innerHTML = '<div class="panel-head"><h2>How to install</h2></div><div class="seg small platforms" role="tablist">' +
      '<button type="button" class="on" data-p="unbounce">Unbounce</button><button type="button" data-p="wordpress">WordPress</button><button type="button" data-p="webflow">Webflow</button><button type="button" data-p="html">Plain HTML</button></div><div class="steps-body"></div>';
    var body = $('.steps-body', panel);
    function set(p) { $$('[data-p]', panel).forEach(function (b) { b.classList.toggle('on', b.dataset.p === p); }); body.innerHTML = STEPS[p](kind); }
    $$('[data-p]', panel).forEach(function (b) { b.addEventListener('click', function () { set(b.dataset.p); }); });
    set('unbounce');
  });

  /* =================== Chat box builder =================== */
  var FMT = [
    { k: 'pouches', label: 'Stand-up pouches' }, { k: 'labels', label: 'Roll labels' }, { k: 'boxes', label: 'Product boxes' },
    { k: 'rollstock', label: 'Roll stock' }, { k: 'help', label: 'Help me choose' }
  ];
  var DEF = { placeholder: 'e.g. 10,000 roll labels for our new SKU', button: 'Get my quote', hint: 'No account needed · Price breaks in seconds · A real rep finalizes it', formatsLabel: 'Or start with a format', radius: 20, width: 760 };
  var cb = store('wpa_chatbox') || {};
  cb = {
    theme: cb.theme || 'dark', accent: hexOk(cb.accent || '') ? cb.accent : '#1F9F71', campaign: cb.campaign || '',
    formats: Array.isArray(cb.formats) && cb.formats.length ? cb.formats : FMT.map(function (f) { return { k: f.k, on: true, label: '' }; }),
    placeholder: cb.placeholder || '', button: cb.button || '', hint: cb.hint || '', hintOff: !!cb.hintOff,
    formatsLabel: cb.formatsLabel || '', formatsLabelOff: !!cb.formatsLabelOff, radius: cb.radius != null ? cb.radius : DEF.radius, width: cb.width || DEF.width, fontInherit: !!cb.fontInherit
  };
  FMT.forEach(function (f) { if (!cb.formats.some(function (x) { return x.k === f.k; })) cb.formats.push({ k: f.k, on: false, label: '' }); });
  var cbSnip = 'full';

  function fmtDefault(k) { var f = FMT.filter(function (x) { return x.k === k; })[0]; return f ? f.label : 'Your button'; }
  function isCustom(f) { return /^custom\d+$/.test(f.k); }
  function renderFormatList() {
    var ul = $('#cbFormats'); ul.innerHTML = '';
    cb.formats.forEach(function (f, i) {
      var li = document.createElement('li'); li.draggable = true; li.dataset.i = i; if (!f.on) li.className = 'off';
      var custom = isCustom(f);
      if (custom) li.classList.add('custom');
      li.innerHTML = '<div class="fmt-row"><span class="grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>' +
        '<label class="switch" title="Show this button"><input type="checkbox" ' + (f.on ? 'checked' : '') + ' aria-label="Show ' + esc(f.label || fmtDefault(f.k)) + '"><span></span></label>' +
        '<span class="name"><input type="text" data-f="label" value="' + esc(f.label) + '" placeholder="' + esc(custom ? 'Button label, e.g. Coffee bags' : fmtDefault(f.k)) + '" aria-label="Button label" maxlength="40"></span>' +
        '<button type="button" class="mv" data-d="-1" aria-label="Move up" ' + (i === 0 ? 'disabled' : '') + '>▲</button>' +
        '<button type="button" class="mv" data-d="1" aria-label="Move down" ' + (i === cb.formats.length - 1 ? 'disabled' : '') + '>▼</button>' +
        (custom ? '<button type="button" class="mv del" aria-label="Remove this button" title="Remove">✕</button>' : '') + '</div>' +
        (custom ? '<input type="text" class="msg" data-f="msg" value="' + esc(f.msg || '') + '" placeholder="Message it sends, e.g. I need a quote for 5,000 coffee bags." aria-label="Message this button sends" maxlength="300">' : '');
      $('input[type=checkbox]', li).addEventListener('change', function (e) { f.on = e.target.checked; li.classList.toggle('off', !f.on); updateCb(); });
      $$('input[data-f]', li).forEach(function (inp) { inp.addEventListener('input', function (e) { f[inp.dataset.f] = e.target.value.trim(); updateCb(); }); });
      var del = $('.del', li); if (del) del.addEventListener('click', function () { cb.formats.splice(i, 1); renderFormatList(); updateCb(); });
      $$('input[type=text]', li).forEach(function (inp) { inp.addEventListener('mousedown', function () { li.draggable = false; }); inp.addEventListener('blur', function () { li.draggable = true; }); });
      $$('.mv', li).forEach(function (b) { b.addEventListener('click', function () { move(i, i + +b.dataset.d, true); }); });
      li.addEventListener('dragstart', function (e) { li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
      li.addEventListener('dragend', function () { li.classList.remove('drag'); $$('li', ul).forEach(function (x) { x.classList.remove('over'); }); });
      li.addEventListener('dragover', function (e) { e.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', function () { li.classList.remove('over'); });
      li.addEventListener('drop', function (e) { e.preventDefault(); var from = +e.dataTransfer.getData('text/plain'); move(from, i); });
      ul.appendChild(li);
    });
    var on = cb.formats.filter(function (f) { return f.on && (!isCustom(f) || (f.label && f.msg)); }).length;
    $('#cbFormatsCount').textContent = on + ' shown';
  }
  function addCustom() {
    var n = 1; while (cb.formats.some(function (f) { return f.k === 'custom' + n; })) n++;
    if (n > 20) return;
    cb.formats.push({ k: 'custom' + n, on: true, label: '', msg: '' });
    renderFormatList(); updateCb();
    var last = $('#cbFormats li:last-child input[data-f="label"]'); if (last) last.focus();
  }
  function move(from, to, keepFocus) {
    if (to < 0 || to >= cb.formats.length || from === to) return;
    var it = cb.formats.splice(from, 1)[0]; cb.formats.splice(to, 0, it);
    renderFormatList(); updateCb();
    if (keepFocus) { var b = $('#cbFormats li:nth-child(' + (to + 1) + ') .mv[data-d="' + (to > from ? 1 : -1) + '"]'); if (b && !b.disabled) b.focus(); else { b = $('#cbFormats li:nth-child(' + (to + 1) + ') .mv:not([disabled])'); if (b) b.focus(); } }
  }

  function cbAttrs(forPreview) {
    var a = [['data-willowpack-chat', true], ['data-theme', cb.theme], ['data-accent', cb.accent.toUpperCase()]];
    if (cb.campaign) a.push(['data-campaign', cb.campaign]);
    var shown = cb.formats.filter(function (f) { return f.on && (!isCustom(f) || (f.label && f.msg)); });
    a.push(['data-formats', shown.map(function (f) { return f.k; }).join(',')]);
    shown.forEach(function (f) {
      if (isCustom(f)) { a.push(['data-label-' + f.k, f.label]); a.push(['data-message-' + f.k, f.msg]); }
      else if (f.label && f.label !== fmtDefault(f.k)) a.push(['data-label-' + f.k, f.label]);
    });
    if (cb.placeholder && cb.placeholder !== DEF.placeholder) a.push(['data-placeholder', cb.placeholder]);
    if (cb.button && cb.button !== DEF.button) a.push(['data-button', cb.button]);
    if (cb.hintOff) a.push(['data-hint', '']); else if (cb.hint && cb.hint !== DEF.hint) a.push(['data-hint', cb.hint]);
    if (cb.formatsLabelOff) a.push(['data-formats-label', '']); else if (cb.formatsLabel && cb.formatsLabel !== DEF.formatsLabel) a.push(['data-formats-label', cb.formatsLabel]);
    if (+cb.radius !== DEF.radius) a.push(['data-radius', String(cb.radius)]);
    if (+cb.width !== DEF.width) a.push(['data-max-width', String(cb.width)]);
    if (cb.fontInherit) a.push(['data-font', 'inherit']);
    if (forPreview) a.push(['data-surface', 'admin-demo']);
    return a;
  }
  function campaignOk(v) { return !v || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v); }
  function updateCb() {
    store('wpa_chatbox', cb);
    /* preview */
    var host = $('#cbPreview'), d = document.createElement('div');
    cbAttrs(true).forEach(function (a) { d.setAttribute(a[0], a[1] === true ? '' : a[1]); });
    host.innerHTML = ''; host.appendChild(d);
    $('#cbMock').setAttribute('data-t', cb.theme);
    refreshEmbeds(cb.theme + cb.accent);
    /* code */
    var attrs = cbAttrs(false);
    var div = hlTag('div', attrs, true);
    setCode('cbCode', cbSnip === 'div' ? div : cbSnip === 'script' ? scriptTag() : div + '\n' + scriptTag());
  }
  function initCb() {
    var f = $('#cbForm');
    $$('input[name=theme]', f).forEach(function (r) { r.checked = r.value === cb.theme; r.addEventListener('change', function () { cb.theme = r.value; updateCb(); }); });
    $('#cbAccent').value = cb.accent.toLowerCase(); $('#cbAccentHex').value = cb.accent.toUpperCase();
    wireColor($('#cbAccent'), $('#cbAccentHex'), function () { cb.accent = $('#cbAccentHex').value.toUpperCase(); updateCb(); });
    var camp = $('#cbCampaign'), help = $('#cbCampaignHelp'), helpHtml = help.innerHTML;
    camp.value = cb.campaign;
    camp.addEventListener('input', function () {
      var raw = camp.value, v = raw.trim();
      var ok = campaignOk(v);
      camp.classList.toggle('bad', !ok); help.classList.toggle('bad', !ok);
      if (!ok) {
        var fix = v.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
        help.innerHTML = 'Use lowercase letters, numbers and single hyphens only' + (fix ? ', e.g. <b>' + esc(fix) + '</b> <button type="button" class="link" id="cbFix">Use this</button>' : '') + '.';
        var b = $('#cbFix'); if (b) b.addEventListener('click', function () { camp.value = fix; camp.dispatchEvent(new Event('input')); });
        return;
      }
      help.innerHTML = helpHtml; cb.campaign = v; updateCb();
    });
    [['cbPlaceholder', 'placeholder'], ['cbButton', 'button'], ['cbHint', 'hint'], ['cbFormatsLabel', 'formatsLabel']].forEach(function (p) {
      var i = $('#' + p[0]); i.value = cb[p[1]]; i.addEventListener('input', function () { cb[p[1]] = i.value.trim(); updateCb(); });
    });
    [['cbHintOff', 'hintOff'], ['cbFormatsLabelOff', 'formatsLabelOff'], ['cbFontInherit', 'fontInherit']].forEach(function (p) {
      var i = $('#' + p[0]); i.checked = cb[p[1]]; i.addEventListener('change', function () { cb[p[1]] = i.checked; updateCb(); });
    });
    [['cbRadius', 'radius', 'cbRadiusOut'], ['cbWidth', 'width', 'cbWidthOut']].forEach(function (p) {
      var i = $('#' + p[0]), o = $('#' + p[2]); i.value = cb[p[1]]; o.textContent = cb[p[1]] + 'px';
      i.addEventListener('input', function () { cb[p[1]] = +i.value; o.textContent = i.value + 'px'; updateCb(); });
    });
    segSnip($('#tab-chat-box'), function (s) { cbSnip = s; updateCb(); });
    $('#cbAddCustom').addEventListener('click', addCustom);
    renderFormatList(); updateCb();
  }

  /* =================== Quotes button builder =================== */
  var qb = store('wpa_quotesbtn') || {};
  qb = { label: qb.label || 'Previous quotes', variant: qb.variant === 'filled' ? 'filled' : 'outline', theme: qb.theme || 'dark', accent: hexOk(qb.accent || '') ? qb.accent : '#1F9F71' };
  var qbSnip = 'full';
  function qbAttrs() { return [['data-willowpack-quotes', true], ['data-label', qb.label || 'Previous quotes'], ['data-variant', qb.variant], ['data-theme', qb.theme], ['data-accent', qb.accent.toUpperCase()]]; }
  function updateQb() {
    store('wpa_quotesbtn', qb);
    var host = $('#qbPreview'), d = document.createElement('div');
    qbAttrs().concat([['data-surface', 'admin-demo']]).forEach(function (a) { d.setAttribute(a[0], a[1] === true ? '' : a[1]); });
    host.innerHTML = ''; host.appendChild(d);
    $('#qbMock').setAttribute('data-t', qb.theme);
    refreshEmbeds(qb.theme + qb.accent);
    var div = hlTag('div', qbAttrs(), true);
    setCode('qbCode', qbSnip === 'div' ? div : qbSnip === 'script' ? scriptTag() : div + '\n' + scriptTag());
  }
  function initQb() {
    var f = $('#qbForm');
    var l = $('#qbLabel'); l.value = qb.label; l.addEventListener('input', function () { qb.label = l.value.trim(); updateQb(); });
    $$('input[name=variant]', f).forEach(function (r) { r.checked = r.value === qb.variant; r.addEventListener('change', function () { qb.variant = r.value; updateQb(); }); });
    $$('input[name=qtheme]', f).forEach(function (r) { r.checked = r.value === qb.theme; r.addEventListener('change', function () { qb.theme = r.value; updateQb(); }); });
    $('#qbAccent').value = qb.accent.toLowerCase(); $('#qbAccentHex').value = qb.accent.toUpperCase();
    wireColor($('#qbAccent'), $('#qbAccentHex'), function () { qb.accent = $('#qbAccentHex').value.toUpperCase(); updateQb(); });
    segSnip($('#tab-quotes-button'), function (s) { qbSnip = s; updateQb(); });
    updateQb();
  }

  /* =================== Conversations =================== */
  var Conv = (function () {
    var cfg = null, rows = [], total = 0, offset = 0, LIMIT = 50, selected = '', gsiLoaded = false, seq = 0;
    var CH = { web: 'Website', embed: 'Embedded page', voice: 'Phone', 'admin-demo': 'Admin demo', other: 'Other' };
    var STAGE = { quoted: 'Quoted', handed_to_sales: 'With a rep', meeting_booked: 'Call booked', scheduling: 'Booking a call', speccing: 'Speccing', discovery: 'Discovery', closed_no_interest: 'Closed' };
    var OUTCOME = { active: 'Active', accepted: 'Accepted', call_booked: 'Call booked', abandoned: 'Abandoned', bounced: 'Bounced' };
    var SF_BASE = 'https://sinalite.lightning.force.com/lightning/r/';
    function sfUrl(obj, id) { return SF_BASE + obj + '/' + encodeURIComponent(id) + '/view'; }
    function oc(o) { return '<span class="oc ' + esc(o || '') + '">' + esc(OUTCOME[o] || o || '—') + '</span>'; }
    function tierBadge(t) { return t ? '<span class="tier ' + esc(t) + '" title="Salesforce AI tier">' + esc(t) + '</span>' : '<span style="color:var(--faint)">—</span>'; }
    function api(url, opts) {
      return fetch(url, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}))
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || ('HTTP ' + r.status)); e.status = r.status; throw e; } return d; }); });
    }
    function show() {
      api('/api/auth/config').then(function (c) { cfg = c; c.signedIn ? signedIn() : signIn(); })
        .catch(function () { signIn('The admin API is not reachable on this deployment.'); });
    }
    function signIn(msg) {
      $('#cvApp').hidden = true; $('#cvActions').hidden = true; $('#cvSignin').hidden = false; $('#whoami').textContent = '';
      var err = $('#cvSigninErr'); err.textContent = msg || '';
      if (!cfg || !cfg.clientId) { $('#gsiBtn').innerHTML = '<p class="err">Google sign-in isn’t set up on this deployment yet (missing <code>GOOGLE_CLIENT_ID</code>).</p>'; return; }
      var render = function () {
        google.accounts.id.initialize({ client_id: cfg.clientId, callback: onCredential, ux_mode: 'popup', hd: cfg.domains.length === 1 ? cfg.domains[0] : undefined, auto_select: false, itp_support: true });
        google.accounts.id.renderButton($('#gsiBtn'), { theme: root.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'signin_with' });
      };
      if (gsiLoaded && window.google && google.accounts) return render();
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { gsiLoaded = true; render(); };
      s.onerror = function () { err.textContent = 'Could not load Google sign-in. Check your connection or ad blocker.'; };
      document.head.appendChild(s);
    }
    function onCredential(resp) {
      $('#cvSigninErr').textContent = 'Signing in…';
      api('/api/auth/login', { method: 'POST', body: JSON.stringify({ credential: resp.credential }) })
        .then(function () { $('#cvSigninErr').textContent = ''; show(); })
        .catch(function (e) { $('#cvSigninErr').textContent = e.message; });
    }
    function signedIn() {
      $('#cvSignin').hidden = true; $('#cvApp').hidden = false; $('#cvActions').hidden = false;
      $('#whoami').textContent = cfg.email;
      load(true);
    }
    function filters() {
      var f = {}; new FormData($('#cvFilters')).forEach(function (v, k) { v = String(v).trim(); if (v) f[k] = v; }); return f;
    }
    function load(reset) {
      if (reset) { offset = 0; rows = []; }
      var my = ++seq, f = filters(); f.limit = LIMIT; f.offset = offset;
      var qs = new URLSearchParams(f).toString();
      if (reset) $('#cvTable tbody').innerHTML = '<tr><td colspan="7" class="empty">Loading…</td></tr>';
      api('/api/conversations?' + qs).then(function (d) {
        if (my !== seq) return;
        total = d.total || 0; rows = rows.concat(d.rows || []); offset = rows.length;
        tiles(d); facets(d.facets || {}); table();
      }).catch(function (e) {
        if (e.status === 401) { cfg.signedIn = false; return signIn('Your session ended. Please sign in again.'); }
        $('#cvTable tbody').innerHTML = '<tr><td colspan="7" class="empty">' + esc(e.message) + '</td></tr>';
      });
    }
    function tiles(d) {
      var bc = d.by_channel || {}, bo = d.by_outcome || {}, top = (d.by_campaign || []).filter(function (x) { return x.campaign !== '(none)'; })[0];
      var pct = function (n) { return total ? Math.round(n * 100 / total) + '% of conversations' : ''; };
      var won = (bo.accepted || 0) + (bo.call_booked || 0);
      $('#cvTiles').innerHTML =
        tile('Conversations', total, (bo.active || 0) + ' active now') +
        tile('Quoted', d.quoted || 0, pct(d.quoted || 0)) +
        tile('Accepted / call', won, pct(won)) +
        tile('Abandoned', bo.abandoned || 0, 'contact captured · Lead created') +
        tile('Bounced', bo.bounced || 0, 'left without contact details') +
        tile('Channels', (bc.web || 0) + ' · ' + (bc.embed || 0) + ' · ' + (bc.voice || 0), 'website · landing pages · phone') +
        tile('Top campaign', top ? top.campaign : '—', top ? top.n + ' chats · ' + top.quoted + ' quoted' : 'no campaigns yet');
    }
    function tile(k, n, s) { return '<div class="tile"><div class="k">' + esc(k) + '</div><div class="n' + (typeof n === 'string' ? ' txt' : '') + '">' + esc(n) + '</div><div class="s">' + esc(s) + '</div></div>'; }
    function facets(fc) {
      [['campaign', fc.campaigns], ['host', fc.hosts], ['stage', fc.stages], ['tier', fc.tiers]].forEach(function (p) {
        var sel = $('#cvFilters [name=' + p[0] + ']'), cur = sel.value, first = sel.options[0].outerHTML;
        sel.innerHTML = first + (p[1] || []).slice().sort().map(function (v) { return '<option value="' + esc(v) + '">' + esc(p[0] === 'stage' ? (STAGE[v] || v) : p[0] === 'tier' ? 'Tier ' + v : v) + '</option>'; }).join('');
        sel.value = cur;
      });
    }
    function when(ts) { try { var d = new Date(ts); return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ts; } }
    function money(n, cur) { return n == null ? '' : (cur || 'CAD') + ' $' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function name(r) { return [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Anonymous visitor'; }
    function table() {
      var tb = $('#cvTable tbody');
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">No conversations match these filters yet.</td></tr>'; }
      else tb.innerHTML = rows.map(function (r) {
        return '<tr tabindex="0" data-id="' + esc(r.session_id) + '"' + (r.session_id === selected ? ' class="sel"' : '') + '>' +
          '<td>' + esc(when(r.updated_at)) + '</td>' +
          '<td class="cust"><b>' + esc(name(r)) + '</b><span>' + esc(r.company || r.first_message || '') + '</span></td>' +
          '<td>' + oc(r.outcome) + '</td>' +
          '<td>' + tierBadge(r.ai_tier) + '</td>' +
          '<td class="src"><span class="ch ' + esc(r.channel) + '">' + esc(CH[r.channel] || r.channel) + '</span><span class="h">' + esc(r.source_host || (r.channel === 'voice' ? 'phone call' : '')) + '</span></td>' +
          '<td>' + esc(r.utm_campaign || '—') + (r.utm_source ? '<br><small style="color:var(--faint)">' + esc(r.utm_source + (r.utm_medium ? ' / ' + r.utm_medium : '')) + '</small>' : '') + '</td>' +
          '<td class="num">' + (r.quote_id ? esc(money(r.discounted_total != null ? r.discounted_total : r.quote_total, r.currency)) + '<br><small style="color:var(--faint)">' + esc(r.quote_id) + '</small>' : '—') + '<span class="turns">' + esc(r.turn_count) + ' messages</span></td></tr>';
      }).join('');
      $('#cvCount').textContent = rows.length + ' of ' + total;
      $('#cvMore').hidden = rows.length >= total;
      $$('#cvTable tbody tr[data-id]').forEach(function (tr) {
        var open = function () { detail(tr.dataset.id); };
        tr.addEventListener('click', open);
        tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    }
    function botHtml(text) {
      text = String(text || '');
      var opts = [], m = text.match(/\[\[options:\s*([^\]]*)\]\]/i);
      if (m) { opts = m[1].split('|').map(function (x) { return x.trim(); }).filter(Boolean); text = text.replace(m[0], '').trim(); }
      var html = text.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>'; }).join('');
      if (opts.length) html += '<div class="opts">' + opts.map(function (o) { return '<span>' + esc(o) + '</span>'; }).join('') + '</div>';
      return html;
    }
    function detail(id) {
      selected = id;
      $$('#cvTable tbody tr').forEach(function (tr) { tr.classList.toggle('sel', tr.dataset.id === id); });
      var box = $('#cvDetail'); box.hidden = false; $('#cvScrim').hidden = false; document.body.style.overflow = 'hidden';
      box.innerHTML = '<div class="dh"><div><h2>Loading…</h2></div></div>';
      api('/api/conversations?id=' + encodeURIComponent(id)).then(function (r) {
        var rowsDl = [
          ['Channel', CH[r.channel] || r.channel], ['Landing page', r.page_url], ['Referrer', r.referrer], ['UTM source', r.utm_source], ['UTM medium', r.utm_medium], ['UTM campaign', r.utm_campaign],
          ['Company', r.company], ['Email', r.email], ['Phone', r.phone], ['Product', r.product_family], ['Stage', STAGE[r.stage] || r.stage],
          ['Quote', r.quote_id ? r.quote_id + ' · ' + money(r.quote_total, r.currency) + (r.discounted_total != null ? ' (discounted ' + money(r.discounted_total, r.currency) + ')' : '') + (r.quantity ? ' · ' + Number(r.quantity).toLocaleString('en-CA') + ' units' : '') : ''],
          ['Quote outcome', r.quote_outcome], ['Meeting', r.meeting_time ? r.meeting_time + (r.meeting_rep ? ' with ' + r.meeting_rep : '') : ''],
          ['Started', when(r.started_at)], ['Session', r.session_id]
        ].filter(function (x) { return x[1]; });
        var tx = (r.transcript || []).map(function (t) {
          return '<div class="turn">' + (t.user ? '<div class="u">' + esc(t.user).replace(/\n/g, '<br>') + '</div>' : '') + (t.bot ? '<div class="b">' + botHtml(t.bot) + '</div>' : '') + '<div class="ts">' + esc(when(t.ts)) + '</div></div>';
        }).join('') || '<p class="empty">No messages recorded.</p>';
        box.innerHTML = '<div class="dh"><div><h2>' + esc(name(r)) + '</h2><p>' + esc(r.company || '') + ' &nbsp;' + oc(r.outcome) + (r.ai_tier ? ' &nbsp;' + tierBadge(r.ai_tier) : '') + '</p></div><button class="icon-btn" type="button" id="cvClose" aria-label="Close details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
          sfBox(r) +
          '<dl>' + rowsDl.map(function (x) { var v = esc(x[1]); if (/^https?:\/\//.test(x[1])) v = '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener">' + v + '</a>'; return '<dt>' + esc(x[0]) + '</dt><dd>' + v + '</dd>'; }).join('') + '</dl>' +
          (r.handoff_summary ? '<div class="summary"><b>Handoff summary:</b> ' + esc(r.handoff_summary) + '</div>' : '') +
          '<div class="tx">' + tx + '</div>';
        $('#cvClose').addEventListener('click', closeDetail);
        $('#cvClose').focus();
      }).catch(function (e) { box.innerHTML = '<div class="dh"><h2>Could not load</h2></div><p class="empty">' + esc(e.message) + '</p>'; });
    }
    function closeDetail() {
      $('#cvDetail').hidden = true; $('#cvScrim').hidden = true; document.body.style.overflow = ''; selected = '';
      $$('#cvTable tbody tr').forEach(function (tr) { tr.classList.remove('sel'); });
    }
    function sfBox(r) {
      var sf = r.sf || {}, out = [];
      if (sf.account && sf.account.id) out.push(sfLink('Account', sfUrl('Account', sf.account.id), sf.account.name || 'Account', [sf.account.ai_tier ? 'AI tier ' + sf.account.ai_tier : '', sf.account.customer_tier ? 'Customer tier ' + sf.account.customer_tier : ''].filter(Boolean).join(' · ')));
      (sf.quotes || []).forEach(function (q) { out.push(sfLink('Quote', sfUrl('Quote', q.id), (q.number ? '#' + q.number + ' ' : '') + (q.name || ''), [q.status, q.total != null ? money(q.total, r.currency || 'CAD') : '', q.chat_quote_id].filter(Boolean).join(' · '))); if (q.opportunity_id) out.push(sfLink('Opportunity', sfUrl('Opportunity', q.opportunity_id), q.opportunity_name || 'Opportunity', q.stage || '')); });
      if (sf.lead && sf.lead.id) out.push(sfLink('Lead', sfUrl('Lead', sf.lead.id), name(r), [sf.lead.status, sf.lead.ai_tier ? 'AI tier ' + sf.lead.ai_tier : '', sf.lead.converted ? 'converted' : ''].filter(Boolean).join(' · ')));
      var note = !out.length ? '<p class="sfnone">' + (r.outcome === 'bounced' ? 'Bounced: no contact details, so nothing was sent to Salesforce.' : r.outcome === 'active' ? 'Still active. Salesforce records are created after 2 hours without a reply, or when a quote is accepted.' : r.email ? 'No Willowpack Salesforce record found for ' + esc(r.email) + ' yet. It is checked every 15 minutes.' : 'No contact details captured.') + '</p>' : '';
      return '<div class="sfbox"><h3>Salesforce</h3>' + out.join('') + note + '</div>';
    }
    function sfLink(kind, url, label, meta) {
      return '<a class="sflink" href="' + esc(url) + '" target="_blank" rel="noopener"><span class="k">' + esc(kind) + '</span><span class="v">' + esc(label) + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</span><span class="go">Open ↗</span></a>';
    }
    function csv() {
      var cols = ['updated_at', 'started_at', 'outcome', 'ai_tier', 'channel', 'source_host', 'page_url', 'utm_source', 'utm_medium', 'utm_campaign', 'first_name', 'last_name', 'company', 'email', 'phone', 'product_family', 'stage', 'quote_id', 'quote_total', 'discounted_total', 'currency', 'quantity', 'quote_outcome', 'meeting_time', 'turn_count', 'first_message', 'sf_account_id', 'sf_lead_id', 'sf_quote_ids', 'session_id'];
      rows.forEach(function (r) { var sf = r.sf || {}; r.sf_account_id = sf.account ? sf.account.id : ''; r.sf_lead_id = sf.lead ? sf.lead.id : ''; r.sf_quote_ids = (sf.quotes || []).map(function (q) { return q.id; }).join(' '); });
      var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var out = [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(','); })).join('\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: 'text/csv' })); a.download = 'willowpack-ai-chats-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    var t = null;
    $('#cvFilters').addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { load(true); }, 250); });
    $('#cvFilters').addEventListener('reset', function () { setTimeout(function () { load(true); }, 0); });
    $('#cvFilters').addEventListener('submit', function (e) { e.preventDefault(); load(true); });
    $('#cvMore').addEventListener('click', function () { load(false); });
    $('#cvScrim').addEventListener('click', closeDetail);
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#cvDetail').hidden) closeDetail(); });
    $('#cvExport').addEventListener('click', csv);
    $('#cvSignOut').addEventListener('click', function () { api('/api/auth/logout', { method: 'POST' }).then(function () { cfg.signedIn = false; if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); signIn(); }); });
    return { show: show };
  })();

  initCb(); initQb(); route();
})();
