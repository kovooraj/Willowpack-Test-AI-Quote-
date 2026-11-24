/*
 * Live chat with a Willowpack sales rep, shared by the home page chat (index.html) and the embedded chat (wp-chat.js).
 * Riley hands a chat over by returning { live: { status: 'waiting' } } with its reply. From then on:
 *   - the customer's messages go to the rep (POST /api/live {action:'send'}), not to Riley;
 *   - the rep's replies arrive by polling GET /api/live?sid=&after= every 3 seconds;
 *   - if no rep joins within WAIT_MS, the live chat is marked missed and Riley takes over again
 *     (it is told the rep is unavailable and offers to book a call or arrange a call back);
 *   - when the rep ends the chat, Riley takes over again.
 * Usage: var live = WPLive.attach({ getSession, row, esc, md, scrollEnd, setBusy, onMissed });
 *        live.start(info)  -> after a Riley reply with d.live;   live.resume() -> after loading a saved chat;
 *        live.active()     -> true while customer messages should go to the rep;  live.send(text).
 */
(function () {
  'use strict';
  var API = '/api/live';
  var POLL_MS = 3000, WAIT_MS = 120000;

  function attach(o) {
    var sid = '', status = 'none', after = 0, timer = null, waitTimer = null, agentName = '', banner = null, seen = {};

    function call(method, body, qs) {
      var url = API + (qs ? '?' + qs : '');
      var opt = { method: method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
      if (body) opt.body = JSON.stringify(body);
      return fetch(url, opt).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
    }
    function initials(n) { return String(n || 'Rep').split(/\s+/).map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
    function note(text) {
      var r = o.row('live-note'); r.innerHTML = '<div class="live-note-text">' + o.esc(text) + '</div>'; o.scrollEnd();
    }
    function agentMsg(m) {
      var r = o.row('bot agent');
      r.innerHTML = '<span class="avatar agent-av" aria-hidden="true">' + o.esc(initials(m.author || agentName)) + '</span>' +
        '<div class="bubble"><div class="agent-name">' + o.esc(m.author || agentName || 'Willowpack rep') + ' · Willowpack</div>' + o.md(m.body) + '</div>';
      o.scrollEnd();
    }
    function showBanner(text) {
      if (!banner) { banner = o.row('live-banner'); }
      banner.innerHTML = '<span class="live-dot"></span><span>' + o.esc(text) + '</span>';
      o.scrollEnd();
    }
    function hideBanner() { if (banner) { banner.remove(); banner = null; } }

    function stop() { if (timer) clearInterval(timer); if (waitTimer) clearTimeout(waitTimer); timer = waitTimer = null; }
    function finish(kind) {
      stop(); hideBanner();
      var was = status; status = kind;
      if (kind === 'missed') { if (o.onMissed) o.onMissed(); }
      else if (kind === 'ended' && was !== 'ended') note('Riley is back to help with anything else.');
    }
    function apply(d) {
      (d.messages || []).forEach(function (m) {
        after = Math.max(after, m.id || 0);
        if (seen[m.id]) return; seen[m.id] = 1;
        if (m.sender === 'agent') agentMsg(m);
        else if (m.sender === 'system' && !/picked up in time|asked to chat with a sales rep/i.test(m.body)) note(m.body); /* e.g. "Dan joined the chat." */
      });
      if (d.agent_name) agentName = d.agent_name;
      if (d.status === 'active' && status !== 'active') {
        status = 'active'; if (waitTimer) clearTimeout(waitTimer); waitTimer = null;
        showBanner('You’re chatting with ' + (agentName || 'a Willowpack rep') + ' from Willowpack');
      } else if (d.status === 'waiting') {
        status = 'waiting';
      } else if (d.status === 'ended' || d.status === 'missed') {
        finish(d.status);
      }
    }
    function poll() {
      if (!sid) return;
      call('GET', null, 'sid=' + encodeURIComponent(sid) + '&after=' + after).then(apply).catch(function () {});
    }
    function begin(requestedAt) {
      stop();
      timer = setInterval(poll, POLL_MS);
      if (status === 'waiting') {
        showBanner('Connecting you with a Willowpack sales rep…');
        var left = WAIT_MS - (requestedAt ? (Date.now() - Date.parse(requestedAt)) : 0);
        waitTimer = setTimeout(function () {
          if (status !== 'waiting') return;
          call('POST', { action: 'timeout', sid: sid }).then(function (d) { if (d && d.status === 'missed') finish('missed'); else poll(); })
            .catch(function () { finish('missed'); });
        }, Math.max(5000, left));
      }
      poll();
    }

    return {
      active: function () { return status === 'waiting' || status === 'active'; },
      start: function (info) {
        sid = o.getSession(); after = 0; seen = {};
        status = (info && info.status) || 'waiting'; agentName = (info && info.agent_name) || '';
        begin(info && info.requested_at);
      },
      /* After a saved chat is loaded: pick a live chat back up if one is still open; show the rep's earlier messages. */
      resume: function () {
        sid = o.getSession(); after = 0; seen = {}; status = 'none'; stop(); hideBanner();
        return call('GET', null, 'sid=' + encodeURIComponent(sid) + '&after=0').then(function (d) {
          if (!d || d.status === 'none') return;
          apply({ messages: d.messages, agent_name: d.agent_name });
          if (d.status === 'waiting' || d.status === 'active') { status = d.status; if (d.status === 'active') showBanner('You’re chatting with ' + (agentName || 'a Willowpack rep') + ' from Willowpack'); begin(d.requested_at); }
          else status = d.status;
        }).catch(function () {});
      },
      reset: function () { stop(); hideBanner(); sid = ''; status = 'none'; after = 0; seen = {}; },
      send: function (text) {
        if (o.setBusy) o.setBusy(true);
        return call('POST', { action: 'send', sid: sid, text: text }).then(function (d) {
          if (d && d.ok === false) { finish(d.status === 'none' ? 'ended' : d.status); return false; }
          poll(); return true;
        }).catch(function () { note('That message didn’t reach the rep. Please try again.'); return false; })
          .then(function (ok) { if (o.setBusy) o.setBusy(false); return ok; });
      }
    };
  }

  window.WPLive = { attach: attach };
})();
