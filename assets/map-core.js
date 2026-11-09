/* Shared renderer for the admin diagrams (System map at #map, Customer flow at #flow).
   A diagram is data: lanes (rows), cards placed on a column grid, connections between cards,
   and journeys (ordered paths). Cards are drawn as buttons, connections as SVG curves between them;
   clicking a card opens a detail panel, picking a journey numbers and highlights one path.
   Usage: WPMap.register('system', { rootId, tabId, lanes, nodes, edges, journeys, sections, ... }) then WPMap.show('system'). */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var STATUS = { live: 'Live', stage: 'Testing', soon: 'Building' };
  var STATUS_NOTE = {
    live: 'Live for every customer.',
    stage: 'Built and tested on the stage Willowpack Portal; only @sinalite.com / @willowpack.com test emails go through it until go-live.',
    soon: 'Agreed and being built; not running yet.'
  };
  var DEFAULT_SECTIONS = [['sees', 'What the customer sees'], ['when', 'When it runs'], ['behind', 'Behind the scenes'], ['logic', 'Rules & logic'], ['where', 'Where it lives'], ['check', 'If something looks off']];
  var maps = {};

  function Map(key, cfg) {
    this.key = key; this.cfg = cfg; this.sel = null; this.journey = null; this.built = false;
    this.byId = {}; var self = this; cfg.nodes.forEach(function (n) { self.byId[n.id] = n; });
    this.cols = cfg.nodes.reduce(function (m, n) { return Math.max(m, n.col); }, 1);
  }
  Map.prototype.neighbors = function (id) {
    var out = [];
    this.cfg.edges.forEach(function (e) { if (e[0] === id && out.indexOf(e[1]) < 0) out.push(e[1]); if (e[1] === id && out.indexOf(e[0]) < 0) out.push(e[0]); });
    return out;
  };
  Map.prototype.build = function () {
    var self = this, cfg = this.cfg;
    this.root = document.getElementById(cfg.rootId);
    if (!this.root || this.built) return;
    this.built = true;
    var html = '<div class="smap-bar" role="toolbar" aria-label="' + esc(cfg.journeyLabel || 'Journeys') + '"><span class="smap-bar-l">' + esc(cfg.journeyLabel || 'Follow a journey') + '</span>' +
      '<button type="button" class="chip on" data-j="">' + esc(cfg.allLabel || 'Everything') + '</button>' +
      cfg.journeys.map(function (j) { return '<button type="button" class="chip" data-j="' + j.k + '">' + esc(j.name) + '</button>'; }).join('') + '</div>' +
      '<div class="smap-legend" aria-label="Status">' + Object.keys(STATUS).map(function (k) { return '<span class="smap-status" data-status="' + k + '">' + STATUS[k] + '</span>'; }).join('') +
      '<span class="smap-legend-t">Live = running for every customer · Testing = stage Portal, test emails only · Building = agreed, not running yet</span></div>' +
      '<ol class="smap-steps" hidden></ol>' +
      '<div class="smap-scroll"><div class="smap-canvas" style="--cols:' + this.cols + ';min-width:' + (190 + this.cols * 168) + 'px">' +
      '<svg class="smap-svg" aria-hidden="true"><defs><marker id="smapArrow-' + this.key + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs></svg>' +
      '<div class="smap-labels"></div>';
    cfg.lanes.forEach(function (l, i) {
      html += '<div class="smap-lane" data-lane="' + l.k + '" style="grid-row:' + (i + 1) + '"><b>' + esc(l.name) + '</b><span>' + esc(l.note) + '</span></div>';
      cfg.nodes.filter(function (n) { return n.lane === l.k; }).forEach(function (n) {
        html += '<button type="button" class="smap-node' + (n.shape ? ' is-' + n.shape : '') + '" data-id="' + n.id + '" data-lane="' + l.k + '" style="grid-row:' + (i + 1) + ';grid-column:' + (n.col + 1) + '">' +
          '<span class="smap-kind">' + esc(n.kind) + (n.shape === 'choice' ? ' · decision' : '') + (n.status && n.status !== 'live' ? '<span class="smap-status" data-status="' + n.status + '">' + STATUS[n.status] + '</span>' : '') + '</span><span class="smap-step" aria-hidden="true"></span>' +
          '<span class="smap-t">' + esc(n.title) + '</span><span class="smap-s">' + esc(n.sub) + '</span></button>';
      });
    });
    html += '</div></div><p class="smap-hint">' + esc(cfg.hint || 'Click any card for the full detail.') + '</p>';
    this.root.innerHTML = html;
    this.canvas = this.root.querySelector('.smap-canvas'); this.svg = this.root.querySelector('.smap-svg'); this.labels = this.root.querySelector('.smap-labels'); this.stepsBox = this.root.querySelector('.smap-steps');
    this.detail = document.createElement('aside');
    this.detail.className = 'panel detail smap-detail'; this.detail.hidden = true; this.detail.setAttribute('role', 'dialog'); this.detail.setAttribute('aria-label', 'Step details');
    this.detail.dataset.map = this.key;
    this.scrim = document.createElement('div'); this.scrim.className = 'detail-scrim'; this.scrim.hidden = true;
    document.body.appendChild(this.scrim); document.body.appendChild(this.detail);
    this.scrim.addEventListener('click', function () { self.select(null); });
    this.root.addEventListener('click', function (e) {
      var node = e.target.closest('.smap-node'); if (node) return self.select(node.dataset.id === self.sel ? null : node.dataset.id);
      var j = e.target.closest('[data-j]'); if (j) return self.setJourney(j.dataset.j || null);
      var st = e.target.closest('[data-step]'); if (st) return self.select(st.dataset.step);
    });
    this.detail.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) return self.select(null);
      var go = e.target.closest('[data-go]'); if (go) self.select(go.dataset.go);
    });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && self.sel && !document.getElementById(cfg.tabId).hidden) self.select(null); });
    var redraw = function () { self.draw(); };
    if (window.ResizeObserver) new ResizeObserver(redraw).observe(this.canvas); else addEventListener('resize', redraw);
  };

  /* Connection geometry: same lane -> side to side; otherwise bottom -> top. Anchors on one side are spread so lines don't stack. */
  Map.prototype.draw = function () {
    var self = this, cfg = this.cfg, canvas = this.canvas, svg = this.svg, labels = this.labels;
    if (!canvas || canvas.offsetParent === null) return;
    var base = canvas.getBoundingClientRect();
    if (getComputedStyle(svg).display === 'none') { labels.innerHTML = ''; return; }
    svg.setAttribute('width', canvas.scrollWidth); svg.setAttribute('height', canvas.scrollHeight);
    var laneIdx = cfg.lanes.map(function (l) { return l.k; });
    var rect = {};
    cfg.nodes.forEach(function (n) {
      var r = canvas.querySelector('[data-id="' + n.id + '"]').getBoundingClientRect();
      rect[n.id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, row: laneIdx.indexOf(n.lane) };
    });
    var sides = {};
    var plans = cfg.edges.map(function (e, i) {
      var a = rect[e[0]], b = rect[e[1]], sa, sb;
      if (a.row === b.row) { sa = a.x < b.x ? 'r' : 'l'; sb = a.x < b.x ? 'l' : 'r'; }
      else { sa = a.row < b.row ? 'b' : 't'; sb = a.row < b.row ? 't' : 'b'; }
      var p = { i: i, e: e, sa: sa, sb: sb };
      (sides[e[0] + '|' + sa] = sides[e[0] + '|' + sa] || []).push({ p: p, end: 'a', other: b });
      (sides[e[1] + '|' + sb] = sides[e[1] + '|' + sb] || []).push({ p: p, end: 'b', other: a });
      return p;
    });
    Object.keys(sides).forEach(function (k) {
      var list = sides[k], parts = k.split('|'), r = rect[parts[0]], s = parts[1], horiz = s === 't' || s === 'b';
      list.sort(function (m, n) { return horiz ? (m.other.x - n.other.x) : (m.other.y - n.other.y); });
      list.forEach(function (m, j) {
        var f = (j + 1) / (list.length + 1);
        m.p[m.end] = horiz ? { x: r.x + r.w * (0.2 + 0.6 * f), y: s === 'b' ? r.y + r.h : r.y } : { x: s === 'r' ? r.x + r.w : r.x, y: r.y + r.h * (0.25 + 0.5 * f) };
      });
    });
    var paths = '', lab = '';
    plans.forEach(function (p) {
      var a = p.a, b = p.b, d;
      if (p.sa === 'r' || p.sa === 'l') { var dx = Math.max(30, Math.abs(b.x - a.x) / 2) * (p.sa === 'r' ? 1 : -1); d = 'M' + a.x + ' ' + a.y + ' C' + (a.x + dx) + ' ' + a.y + ' ' + (b.x - dx) + ' ' + b.y + ' ' + b.x + ' ' + b.y; }
      else { var dy = Math.max(40, Math.abs(b.y - a.y) / 2) * (p.sa === 'b' ? 1 : -1); d = 'M' + a.x + ' ' + a.y + ' C' + a.x + ' ' + (a.y + dy) + ' ' + b.x + ' ' + (b.y - dy) + ' ' + b.x + ' ' + b.y; }
      paths += '<path class="smap-edge" data-e="' + p.i + '" d="' + d + '" marker-end="url(#smapArrow-' + self.key + ')"/>';
      if (p.e[2]) lab += '<span class="smap-elabel" data-e="' + p.i + '" style="left:' + ((a.x + b.x) / 2) + 'px;top:' + ((a.y + b.y) / 2) + 'px">' + esc(p.e[2]) + '</span>';
    });
    svg.innerHTML = svg.querySelector('defs').outerHTML + paths;
    labels.innerHTML = lab;
    this.paint();
  };

  /* Highlight state: a selected card lights up its connections; a journey lights up its path in order. */
  Map.prototype.paint = function () {
    if (!this.root) return;
    var self = this, cfg = this.cfg, onNodes = null, onEdges = null, order = {};
    if (this.journey) {
      var ids = this.journey.steps.map(function (s) { return s[0]; });
      onNodes = ids.slice(); onEdges = [];
      ids.forEach(function (id, i) { (order[id] = order[id] || []).push(i + 1); });
      for (var i = 0; i < ids.length - 1; i++) cfg.edges.forEach(function (e, k) { if ((e[0] === ids[i] && e[1] === ids[i + 1]) || (e[1] === ids[i] && e[0] === ids[i + 1])) onEdges.push(k); });
    }
    if (this.sel) {
      onNodes = (onNodes || []).concat([this.sel], this.neighbors(this.sel));
      onEdges = (onEdges || []).concat(cfg.edges.map(function (e, k) { return e[0] === self.sel || e[1] === self.sel ? k : -1; }).filter(function (k) { return k >= 0; }));
    }
    this.root.classList.toggle('focus', !!onNodes);
    this.root.querySelectorAll('.smap-node').forEach(function (el) {
      var id = el.dataset.id;
      el.classList.toggle('on', !!onNodes && onNodes.indexOf(id) >= 0);
      el.classList.toggle('sel', id === self.sel);
      el.setAttribute('aria-pressed', id === self.sel ? 'true' : 'false');
      el.querySelector('.smap-step').textContent = order[id] ? order[id].join(' · ') : '';
      el.classList.toggle('numbered', !!order[id]);
    });
    this.root.querySelectorAll('.smap-edge, .smap-elabel').forEach(function (el) { el.classList.toggle('on', !!onEdges && onEdges.indexOf(+el.dataset.e) >= 0); });
  };

  Map.prototype.setJourney = function (k) {
    var self = this;
    this.journey = this.cfg.journeys.filter(function (j) { return j.k === k; })[0] || null;
    this.root.querySelectorAll('[data-j]').forEach(function (b) { b.classList.toggle('on', (b.dataset.j || null) === (self.journey ? self.journey.k : null)); });
    if (this.journey) {
      this.stepsBox.innerHTML = (this.journey.note ? '<li class="smap-jdesc">' + esc(this.journey.note) + '</li>' : '') + this.journey.steps.map(function (s, i) {
        return '<li><button type="button" data-step="' + s[0] + '"><b>' + (i + 1) + '</b><span><em>' + esc(self.byId[s[0]].title) + '</em>' + esc(s[1]) + '</span></button></li>';
      }).join('');
      this.stepsBox.hidden = false;
    } else { this.stepsBox.hidden = true; this.stepsBox.innerHTML = ''; }
    this.select(null, true);
    requestAnimationFrame(function () { self.draw(); });
  };

  function list(items) { return '<ul>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  Map.prototype.select = function (id, quiet) {
    var self = this, cfg = this.cfg;
    this.sel = id || null;
    this.paint();
    if (!this.sel) { this.detail.hidden = true; this.scrim.hidden = true; return; }
    var n = this.byId[this.sel], lane = cfg.lanes.filter(function (l) { return l.k === n.lane; })[0];
    var talks = this.neighbors(this.sel).map(function (o) {
      var e = cfg.edges.filter(function (x) { return (x[0] === self.sel && x[1] === o) || (x[1] === self.sel && x[0] === o); })[0];
      return '<button type="button" class="smap-go" data-go="' + o + '"><span>' + (e[0] === self.sel ? '→' : '←') + '</span>' + esc(self.byId[o].title) + '<small>' + esc(e[2] || '') + '</small></button>';
    }).join('');
    var inJourney = this.journey ? this.journey.steps.map(function (s, i) { return s[0] === self.sel ? '<p class="smap-jnote"><b>Step ' + (i + 1) + ' of “' + esc(self.journey.name) + '”:</b> ' + esc(s[1]) + '</p>' : ''; }).join('') : '';
    var st = n.status || 'live';
    var body = (cfg.sections || DEFAULT_SECTIONS).map(function (sec) {
      var v = n[sec[0]]; if (!v || (Array.isArray(v) && !v.length)) return '';
      if (sec[0] === 'where' && n.wf) v = v.concat(['<a href="https://n8n.sinaprinting.com/workflow/' + n.wf + '" target="_blank" rel="noopener">Open in n8n ↗</a>']);
      return '<h3>' + esc(sec[1]) + '</h3>' + (Array.isArray(v) ? list(v) : '<p>' + v + '</p>');
    }).join('');
    this.detail.innerHTML = '<div class="dh"><div><span class="smap-kind" data-lane="' + n.lane + '">' + esc(n.kind) + ' · ' + esc(lane.name) + '</span><h2>' + esc(n.title) + '</h2><p>' + esc(n.sub) + '</p></div>' +
      '<button class="icon-btn" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="smap-body"><p class="smap-statusline"><span class="smap-status" data-status="' + st + '">' + STATUS[st] + '</span> ' + esc(n.statusNote || STATUS_NOTE[st]) + '</p>' + inJourney +
      '<p class="smap-what">' + n.what + '</p>' + body +
      (talks ? '<h3>' + esc(cfg.connectedLabel || 'Connected to') + '</h3><div class="smap-gos">' + talks + '</div>' : '') + '</div>';
    this.detail.hidden = false; this.scrim.hidden = false;
    if (!quiet) { var b = this.detail.querySelector('[data-close]'); if (b) b.focus({ preventScroll: true }); }
  };
  Map.prototype.show = function () { var self = this; this.build(); requestAnimationFrame(function () { self.draw(); }); };
  Map.prototype.hide = function () { if (this.detail) { this.sel = null; this.detail.hidden = true; this.scrim.hidden = true; this.paint(); } };

  window.WPMap = {
    register: function (key, cfg) { maps[key] = new Map(key, cfg); return maps[key]; },
    get: function (key) { return maps[key]; },
    show: function (key) { Object.keys(maps).forEach(function (k) { if (k === key) maps[k].show(); else maps[k].hide(); }); },
    hideAll: function () { Object.keys(maps).forEach(function (k) { maps[k].hide(); }); },
    data: function (key) { var m = maps[key]; return m ? { NODES: m.cfg.nodes, EDGES: m.cfg.edges, JOURNEYS: m.cfg.journeys, LANES: m.cfg.lanes } : null; }
  };
})();
