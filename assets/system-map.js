/* Willowpack AI quote chat: interactive system map for /admin#map.
   Data first (lanes, cards, connections, journeys), then a small renderer:
   cards sit on a lane grid, connections are drawn as SVG curves between them,
   clicking a card opens its detail panel, journeys highlight one path step by step. */
(function () {
  'use strict';

  var LANES = [
    { k: 'fe', name: 'Website & landing pages', note: 'Vercel · runs in the visitor’s browser' },
    { k: 'live', name: 'Live conversation', note: 'n8n · every chat message, in real time' },
    { k: 'bg', name: 'Background automations', note: 'n8n · run beside the chat, never slow it down' },
    { k: 'data', name: 'Data & connected systems', note: 'where everything is stored or sent' }
  ];

  var WF = 'https://n8n.sinaprinting.com/workflow/';
  var NODES = [
    /* ---------------- Website ---------------- */
    { id: 'lp', lane: 'fe', col: 1, kind: 'Vercel', title: 'Landing page + embed', sub: 'embed.js · inline box & quotes button',
      what: 'Any page (willowpack.com, Unbounce) adds one script, /embed.js. It draws the inline chat box and the Previous quotes button in an isolated layer (Shadow DOM), so page styles can’t break it and it can’t break the page. Clicking opens the chat full-screen on top of the same page.',
      when: ['On page load.', 'A link with <code>?resume=&lt;chat id&gt;</code> reopens that chat automatically.', '<code>&amp;ask=book</code> also sends “I’d like to book a call” for the customer.'],
      logic: ['Sends the landing page URL (not our chat URL), UTM tags and the box’s Campaign tag with every chat.', 'Only one global: <code>window.WillowpackChat</code> with <code>open()</code>, <code>openQuotes()</code>, <code>close()</code>.', 'Closing the chat leaves a “Continue my quote” pill on the page.'],
      where: ['Repo <code>kovooraj/Willowpack-Test-AI-Quote-</code> → <code>embed.js</code> (also pinned at <code>/embed/v1.js</code>)', 'Vercel project <code>willowpack_test_ai_quote</code>'],
      check: ['Nothing shows: the script must be on the page and the page re-published. Unbounce’s editor doesn’t run scripts; use Preview.', 'Add <code>?wp_debug=1</code> to the page URL and look for <code>[willowpack]</code> lines in the console.'] },
    { id: 'chatui', lane: 'fe', col: 2, kind: 'Vercel', title: 'Chat window', sub: '/ and /embed/chat',
      what: 'The conversation itself: messages, option buttons, price cards with quantity breaks, and meeting slots. It remembers the chat id and quote history in the visitor’s browser.',
      when: ['Every message the customer sends.'],
      logic: ['Each message is one request to n8n: <code>{action: "sendMessage", sessionId, chatInput, metadata}</code>.', 'Metadata: landing page URL, UTM source/medium/campaign, referrer, surface (website, embed or admin demo) and time zone.', 'Chats started in the admin Demo are tagged <code>utm_source=admin-demo</code>.'],
      where: ['<code>index.html</code>, <code>assets/wp-chat.js</code>, <code>embed/chat.html</code>'],
      check: ['The request/response contract with n8n has never changed; if replies stop, check the n8n chat workflow’s executions first.'] },
    { id: 'quotes', lane: 'fe', col: 3, kind: 'Vercel', title: 'Previous quotes', sub: 'quotes saved in this browser',
      what: 'Lists the quotes this visitor got before, with prices refreshed from n8n, and a “Continue my quote” button that reopens that chat.',
      when: ['When the Previous quotes button or page is opened.'],
      logic: ['History is stored per browser and per website, so a chat from willowpack.com won’t show on an Unbounce page or on the customer’s phone.', 'The quote email link always works: it reopens the chat where it started.'],
      where: ['<code>embed/quotes.html</code>, quote-history webhook in n8n'],
      check: ['“My quote is missing”: it was started in another browser or on another site. Use the resume link from their email.'] },
    { id: 'admin', lane: 'fe', col: 5, kind: 'Vercel', title: 'Admin board', sub: '/admin · this page',
      what: 'Demo, install builders for the chat box and quotes button, How it works, this map, and Conversations: every chat from every source with its Salesforce links.',
      when: ['On demand.'],
      logic: ['Conversations needs Google sign-in with a sinalite.com or willowpack.com account (same login as the Pricing Engine and HBOS).', 'The browser never holds a database key: the page calls <code>/api/conversations</code>, which reads Supabase server-side.'],
      where: ['<code>admin.html</code>, <code>assets/admin.js</code>, <code>api/</code> (Vercel functions)'],
      check: ['Signed out after a while: the session cookie expires; sign in again.'] },

    /* ---------------- Live conversation ---------------- */
    { id: 'webhook', lane: 'live', col: 2, kind: 'n8n', title: 'Chat workflow', sub: 'webhook · loads context · logs every turn', wf: 'JyzBdaBGi7eisI46',
      what: 'Receives each message, loads what we already know about the chat, hands it to the AI assistant, logs the turn and sends the reply back to the chat window.',
      when: ['Every message (POST <code>/webhook/willowpack-quote-chat</code>).'],
      logic: ['Loads the chat’s row from the Sessions sheet and the product guidance rules.', 'Builds the assistant’s context: known customer details, what’s still missing (name, company, email), the quote, the meeting and what Salesforce says (assigned rep, quote status).', 'Logs every message to the Transcript tab.'],
      where: ['n8n “Willowpack AI Quote Chat”'],
      check: ['Replies slow or failing: open this workflow’s executions in n8n.'] },
    { id: 'agent', lane: 'live', col: 3, kind: 'AI', title: 'AI quote assistant', sub: 'Claude Sonnet + tools',
      what: 'Asks one question at a time, recommends specs, prices the order, handles price pushback and books the call with a rep.',
      when: ['Every message.'],
      logic: ['Must collect full name, company and business email before quoting (never guesses a company).', 'Prices only through the Pricing Engine; the chat never sees cost or margin.', 'A 5% chat discount can be offered once, only after genuine price pushback.', 'When a quote is accepted it must book a call with the rep (no “No” option).', 'Knows the assigned rep and quote status from Salesforce but never mentions Salesforce, lead status or tiers to the customer.'],
      where: ['Agent node in “Willowpack AI Quote Chat” (memory per chat)'],
      check: ['Odd answer: read the chat in Conversations; the context it saw is in the execution of that turn.'] },
    { id: 'tools', lane: 'live', col: 4, kind: 'n8n', title: 'Backend Tools', sub: 'save details · price · book · hand off', wf: 'ZPKfKqnSLo4tPYc6',
      what: 'Everything the assistant can do: save customer details, get a price, apply the chat discount, find and book meetings, and hand the chat to sales. Each call updates the chat’s row in the Sessions sheet.',
      when: ['Whenever the assistant calls a tool (several times per chat).'],
      logic: ['<b>Details saved:</b> once name, company and email are known and there’s no Lead yet, it starts “Instant Lead + tier” in the background (adds ~0.03 s, the customer never waits).',
        '<b>Meeting routing by tier:</b> Tier A → Daniel only. Tier B → Daniel or Edward, customer picks a time. Tier S, C or not tiered yet → Edward only.',
        '<b>Slots:</b> weekdays 10 am to 4 pm Toronto, 30 minutes, next 7 days, at least 3 hours’ notice, up to 6 options (2 per day).',
        '<b>Booking:</b> re-checks the slot is still free, then sends a Google Calendar invite with a Meet link to the rep and the customer.',
        '<b>Hand-off:</b> accepted quote, price optimization, custom quote or declined → starts the Lead Finalizer in the background.'],
      where: ['n8n “Willowpack AI Quote Chat - Backend Tools”'],
      check: ['Customer saw the wrong rep’s calendar: check the chat’s <code>sf_ai_tier</code> in the Sessions sheet at the time of booking.'] },

    /* ---------------- Background ---------------- */
    { id: 'convsync', lane: 'bg', col: 1, kind: 'n8n', title: 'Conversations sync', sub: 'every 2 minutes', wf: '8IvfywfNyEbZR6KH',
      what: 'Copies new chats and messages from the Sessions and Transcript tabs into Supabase so Conversations has one clean database of every chat.',
      when: ['Every 2 minutes, only what changed since the last run.'],
      logic: ['The first source/landing page/UTMs of a chat are kept (later messages can’t overwrite them).', 'Messages are de-duplicated and kept in order.'],
      where: ['n8n “Supabase Conversations Sync”'],
      check: ['A chat isn’t in Conversations yet: wait 2 minutes, then check this workflow’s last execution.'] },
    { id: 'early', lane: 'bg', col: 2, kind: 'n8n', title: 'Instant Lead + tier', sub: 'seconds after details are given', wf: 'jpcmNEG5gjvhEk8J',
      what: 'Creates the Salesforce Lead while the chat is still going, gets it tiered right away, and hands the tier and assigned rep back to the chat.',
      when: ['Instantly when Backend Tools saves name + company + email.', 'Backup sweep every 2 minutes (it skips chats saved in the last 90 seconds, so the two never create the same Lead).'],
      logic: ['Existing Willowpack Lead with that email → linked, not duplicated.', 'Contact on a Willowpack Account → treated as an existing customer; no Lead is created.', 'New Lead: Willowpack, Lead Source Website, Inbound, Medium “AI Quote Chat”, UTMs and landing page.', 'Then runs Tier Auditing on it straight away and writes tier + rep to the chat (about 20 to 30 seconds end to end).', 'Also keeps the chat’s “last activity” time accurate so the finalizer never closes a live chat.', 'Skips test chats and emails and placeholder company names. Three failed attempts email Alex.'],
      where: ['n8n “Willowpack AI Quote Chat - Early Lead + Live Activity”'],
      check: ['No Lead after a minute: look for <code>early_error</code> in the chat’s <code>sf_sync_status</code> (Sessions sheet).'] },
    { id: 'tier', lane: 'bg', col: 3, kind: 'n8n', title: 'Tier Auditing', sub: 'A · B · S · C + owner', wf: 'KGwr84f5CjEtOVFs',
      what: 'Researches the company and rates the Lead A, B, S or C, fills every AI field, and assigns the owner.',
      when: ['On demand from the chat (about 16 seconds per Lead).', 'Every 10 minutes for any new Willowpack Lead still missing its tier (backup, and for Leads from other sources).'],
      logic: ['Perplexity research (website, retail presence, co-packing, size) → classifier → tier and reasoning.', 'Fills tier, distribution, employees, industry, packaging needs, revenue, city, state and country.', '<b>Owner:</b> A → Daniel. B → Edward/Daniel round robin. S → Edward. C → Sai.', 'Each result is also logged to the “Willowpack Tiered List” sheet.'],
      where: ['n8n “Willowpack - Tier Auditing System - On Leads Create by CRON”'],
      check: ['Lead has no tier: check this workflow’s executions around the Lead’s created time.'] },
    { id: 'finalizer', lane: 'bg', col: 4, kind: 'n8n', title: 'Lead Finalizer', sub: 'hand-off to sales', wf: 'MHSwnyXrNh8oQUyg',
      what: 'Wraps up a chat for sales: updates Salesforce, sets the owner, emails the rep, and sends the customer their summary.',
      when: ['Right away when the chat hands off (accepted, wants a better price, custom quote, declined).', 'Or after 30 minutes with no new message (sweep every 15 minutes).'],
      logic: ['Needs name, company and email.', 'Accepted quote → Account, Contact, Opportunity and Quote in Salesforce.', 'Otherwise the Lead is updated (or created).', '<b>Owner by tier:</b> A → always Daniel. B → the rep they booked, else the tier’s owner. S and C → Edward. Not tiered → keeps the current owner.', 'Rep email (cc Lalit and Alex) and customer summary from the same rep. Chats that just went quiet get the Abandoned follow-up instead of a customer email.'],
      where: ['n8n “Willowpack AI Quote Chat - Lead Finalizer”'],
      check: ['Rep not notified: the chat may be missing name, company or email; check <code>finalized_at</code> in the Sessions sheet.'] },
    { id: 'sflinks', lane: 'bg', col: 5, kind: 'n8n', title: 'Salesforce sync', sub: 'every 2 minutes', wf: 'DMTpQCnV8x4ITyKf',
      what: 'Brings Salesforce back into the chat system: the Lead, Account (with tier), owner and the AI chat Quotes for every recent chat.',
      when: ['Every 2 minutes, for chats with an email from the last 60 days.'],
      logic: ['Matches Leads and Contacts by email (Willowpack only) and Quotes by the chat’s quote id in the Quote description.', 'Saves the links for Conversations (Supabase) and the status, tier, rep and quote status for the chat (Sessions sheet).', 'Once an accepted quote has its Account and Quote, the chat’s own Lead is deleted (Salesforce can’t merge a Lead into an existing Account).'],
      where: ['n8n “Willowpack AI Quote Chat - Salesforce Links for Conversations”'],
      check: ['A rep change isn’t showing: give it 2 minutes; the chat and Conversations update on the next run.'] },
    { id: 'followup', lane: 'bg', col: 6, kind: 'n8n', title: 'Abandoned follow-up', sub: 'email 1 hour after Abandoned', wf: 'eS0G6h2IqwHwDXPS',
      what: 'Emails customers who left with their details given but no booked call, inviting them back to the same chat.',
      when: ['Every 15 minutes; a chat qualifies 1 hour after it becomes Abandoned (3 hours with no reply), within 7 days, once only.'],
      logic: ['<b>Version A</b> (no price yet): “Continue my quote”.', '<b>Version B</b> (got a price, no call): “Book my call”, which opens the chat and asks for the call for them.', 'Skips test chats, disqualified or converted Leads, and chats that already have a Salesforce Quote. At most 20 per run.', 'Sent as Willowpack from feedback@willowpack, replies go to the Salesforce owner, and a completed Task is logged on the Lead.'],
      where: ['n8n “Abandoned Follow-up Email”'],
      check: ['Customer didn’t get it: check the chat’s outcome in Conversations and the workflow’s last executions.'] },

    /* ---------------- Data ---------------- */
    { id: 'supabase', lane: 'data', col: 1, kind: 'Supabase', title: 'Conversations database', sub: 'Supabase · ai_inbound_sales_chat.chats',
      what: 'One row per chat with its source, UTMs, customer, quote, full transcript and Salesforce links. Feeds the Conversations tab and the follow-up email.',
      when: ['Written every 2 minutes by the syncs.'],
      logic: ['<b>Outcome</b> is worked out when you look: Accepted or Call booked; Active (reply in the last 2 hours); Abandoned (2+ hours, has name, company and email); Bounced (2+ hours, no contact details).', 'Only reachable through locked-down functions; no public table access.'],
      where: ['Supabase project <code>cjubwgebqlvdufqjbhnm</code>, schema <code>ai_inbound_sales_chat</code>'] },
    { id: 'sheet', lane: 'data', col: 2, kind: 'Google', title: 'Sessions sheet', sub: 'live state of every chat',
      what: 'The chat engine’s working memory: one row per chat (Sessions) with details, specs, quote, meeting, Salesforce ids and status, plus one row per message (Transcript).',
      when: ['Updated on every tool call and by the background automations.'],
      logic: ['The <code>sf_*</code> columns (tier, rep, record and quote status) are written only by the Salesforce automations, so a chat message can’t blank them out.'],
      where: ['Google Sheet <code>1OJiHoW0…kYhSlFo</code>, tabs Sessions and Transcript'] },
    { id: 'pricing', lane: 'data', col: 3, kind: 'Pricing', title: 'Pricing Engine', sub: 'same math as the BDO sheets',
      what: 'Prices pouches, labels, boxes and roll stock exactly like the BDO pricing sheets, with the Willowpack markup table and price breaks.',
      when: ['Each time the assistant prices or re-prices a quote.'],
      logic: ['Backend Tools strips cost and margin before anything reaches the chat.', 'The 5% chat discount is only allowed if at least 3% margin remains.'],
      where: ['Pricing Engine MCP'] },
    { id: 'salesforce', lane: 'data', col: 4, kind: 'Salesforce', title: 'Salesforce', sub: 'Willowpack Leads · Accounts · Quotes',
      what: 'The system of record for sales. AI chats create Willowpack Leads early, tier them, and on acceptance create the Account, Contact, Opportunity and Quote.',
      when: ['Lead within seconds of details; tier within ~30 seconds; account records on acceptance.'],
      logic: ['Willowpack only: <code>Print_Company__c = Willowpack</code>, Account record type Willowpack.', 'AI chat Leads have Medium “AI Quote Chat”; AI chat Quotes carry “AI chat quote Q-…” in their description.', 'Reps’ changes (owner, status, quote stage) flow back to the chat and Conversations within 2 minutes.'],
      where: ['sinalite.lightning.force.com'] },
    { id: 'calendar', lane: 'data', col: 5, kind: 'Google', title: 'Google Calendar', sub: 'rep availability & invites',
      what: 'Free/busy for Daniel and Edward, and the meeting invite with a Google Meet link.',
      when: ['When the assistant looks for slots and when the customer picks one.'],
      logic: ['Only the calendars allowed for the chat’s tier are checked (see Backend Tools).'],
      where: ['Invites are created from Alex’s calendar with the rep and customer as guests'] },
    { id: 'gmail', lane: 'data', col: 6, kind: 'Google', title: 'Email', sub: 'reps, customers, follow-ups',
      what: 'Rep hand-off emails, customer quote summaries, the Abandoned follow-up, and alerts when Salesforce rejects a Lead.',
      when: ['On hand-off, on the follow-up schedule, and on failures.'],
      logic: ['Every customer link points back to the landing page with <code>?resume=</code>, which reopens the same chat.'],
      where: ['Gmail accounts connected in n8n'] }
  ];

  var EDGES = [
    ['lp', 'chatui', 'opens full-screen'], ['quotes', 'chatui', 'continue my quote'],
    ['chatui', 'webhook', 'each message'], ['webhook', 'agent', 'context + message'], ['agent', 'tools', 'tool calls'],
    ['sheet', 'webhook', 'chat state'], ['tools', 'sheet', 'saves state'], ['tools', 'pricing', 'price'], ['tools', 'calendar', 'slots & invites'],
    ['tools', 'early', 'details saved (async)'], ['tools', 'finalizer', 'hand-off (async)'],
    ['early', 'salesforce', 'create / link Lead'], ['early', 'tier', 'tier now'], ['tier', 'salesforce', 'tier + owner'], ['early', 'sheet', 'tier + rep'],
    ['finalizer', 'salesforce', 'Lead / Account / Quote'], ['finalizer', 'gmail', 'rep + customer email'],
    ['sflinks', 'salesforce', 'reads'], ['sflinks', 'supabase', 'links'], ['sflinks', 'sheet', 'status for chat'],
    ['sheet', 'convsync', 'every 2 min'], ['convsync', 'supabase', 'chats'],
    ['supabase', 'followup', 'abandoned chats'], ['followup', 'gmail', 'A / B email'], ['followup', 'salesforce', 'Task'],
    ['admin', 'supabase', 'Conversations'], ['gmail', 'lp', 'resume links']
  ];

  var JOURNEYS = [
    { k: 'price', name: 'Visitor gets a price', steps: [
      ['lp', 'The visitor types what they’re packaging into the box on the landing page.'],
      ['chatui', 'The chat opens full-screen with their first message already sent.'],
      ['webhook', 'n8n loads what we know about the chat and builds the context.'],
      ['agent', 'The assistant asks for name, company and email, then the specs, one question at a time.'],
      ['tools', 'It saves the details and asks for a price.'],
      ['pricing', 'The Pricing Engine returns the price and quantity breaks.'],
      ['sheet', 'The quote is saved on the chat, and the customer sees the price card.']] },
    { k: 'tier', name: 'Details given → tiered', steps: [
      ['tools', 'Name, company and email are saved; Instant Lead + tier starts in the background.'],
      ['early', 'Within ~5 seconds: the Lead is created (or the existing Lead/customer is found).'],
      ['salesforce', 'The Willowpack Lead exists with source, UTMs and landing page.'],
      ['tier', 'About 16 seconds later: researched and rated A/B/S/C, owner assigned.'],
      ['sheet', 'Tier and rep are written back to the chat (~20 to 30 seconds after the details).'],
      ['agent', 'From now on the assistant knows the rep, and booking uses the right calendar.']] },
    { k: 'book', name: 'Customer books a call', steps: [
      ['agent', 'The customer accepts the quote (or asks for a call).'],
      ['tools', 'Slots are pulled only for the reps allowed for the tier (A Dan, B Dan or Edward, S/C Edward).'],
      ['calendar', 'The chosen slot is re-checked and the invite with a Meet link goes out.'],
      ['finalizer', 'The chat is handed to sales with the meeting included.'],
      ['salesforce', 'Account, Contact, Opportunity and Quote are created; owner follows the tier.'],
      ['gmail', 'The rep gets the hand-off email and the customer gets their summary.']] },
    { k: 'abandoned', name: 'Customer leaves', steps: [
      ['sheet', 'No reply for 2 hours after giving details: the chat is Abandoned (no details: Bounced).'],
      ['convsync', 'The chat is already in the Conversations database.'],
      ['supabase', 'One hour later it’s due for a follow-up.'],
      ['followup', 'Version A (no price) or B (got a price, no call) is built.'],
      ['gmail', 'The email goes out from Willowpack; replies go to the Lead owner.'],
      ['lp', '“Continue my quote” / “Book my call” reopens the same chat on the landing page.'],
      ['salesforce', 'A completed Task is logged on the Lead.']] },
    { k: 'accepted', name: 'Accepted → Salesforce', steps: [
      ['tools', 'The customer accepts; the call is booked.'],
      ['finalizer', 'Account, Contact, Opportunity and Quote are created.'],
      ['salesforce', 'The rep owns the deal according to the tier.'],
      ['sflinks', 'Within 2 minutes the records are linked to the chat and the early Lead is deleted.'],
      ['supabase', 'Conversations shows the Account, tier and Quote links.'],
      ['admin', 'Sales opens the chat in Conversations with every Salesforce link.']] }
  ];

  /* ---------------- renderer ---------------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var byId = {}; NODES.forEach(function (n) { byId[n.id] = n; });
  var root, canvas, svg, labels, detail, scrim, stepsBox, sel = null, journey = null, built = false;

  function neighbors(id) {
    var out = [];
    EDGES.forEach(function (e) { if (e[0] === id && out.indexOf(e[1]) < 0) out.push(e[1]); if (e[1] === id && out.indexOf(e[0]) < 0) out.push(e[0]); });
    return out;
  }

  function build() {
    root = document.getElementById('smap');
    if (!root || built) return;
    built = true;
    var html = '<div class="smap-bar" role="toolbar" aria-label="Journeys"><span class="smap-bar-l">Follow a journey</span>' +
      '<button type="button" class="chip on" data-j="">Whole system</button>' +
      JOURNEYS.map(function (j) { return '<button type="button" class="chip" data-j="' + j.k + '">' + esc(j.name) + '</button>'; }).join('') + '</div>' +
      '<ol class="smap-steps" id="smapSteps" hidden></ol>' +
      '<div class="smap-scroll"><div class="smap-canvas" id="smapCanvas">' +
      '<svg class="smap-svg" id="smapSvg" aria-hidden="true"><defs><marker id="smapArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs></svg>' +
      '<div class="smap-labels" id="smapLabels"></div>';
    LANES.forEach(function (l, i) {
      html += '<div class="smap-lane" data-lane="' + l.k + '" style="grid-row:' + (i + 1) + '"><b>' + esc(l.name) + '</b><span>' + esc(l.note) + '</span></div>';
      NODES.filter(function (n) { return n.lane === l.k; }).forEach(function (n) {
        html += '<button type="button" class="smap-node" data-id="' + n.id + '" data-lane="' + l.k + '" style="grid-row:' + (i + 1) + ';grid-column:' + (n.col + 1) + '">' +
          '<span class="smap-kind">' + esc(n.kind) + '</span><span class="smap-step" aria-hidden="true"></span>' +
          '<span class="smap-t">' + esc(n.title) + '</span><span class="smap-s">' + esc(n.sub) + '</span></button>';
      });
    });
    html += '</div></div><p class="smap-hint">Click any card for the full detail. Lines show what talks to what; pick a journey to follow one path step by step.</p>';
    root.innerHTML = html;
    canvas = document.getElementById('smapCanvas'); svg = document.getElementById('smapSvg'); labels = document.getElementById('smapLabels'); stepsBox = document.getElementById('smapSteps');

    detail = document.createElement('aside');
    detail.className = 'panel detail smap-detail'; detail.hidden = true; detail.setAttribute('role', 'dialog'); detail.setAttribute('aria-label', 'Step details');
    scrim = document.createElement('div'); scrim.className = 'detail-scrim'; scrim.hidden = true;
    document.body.appendChild(scrim); document.body.appendChild(detail);
    scrim.addEventListener('click', function () { select(null); });

    root.addEventListener('click', function (e) {
      var node = e.target.closest('.smap-node'); if (node) return select(node.dataset.id === sel ? null : node.dataset.id);
      var j = e.target.closest('[data-j]'); if (j) return setJourney(j.dataset.j || null);
      var st = e.target.closest('[data-step]'); if (st) return select(st.dataset.step);
    });
    detail.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) return select(null);
      var go = e.target.closest('[data-go]'); if (go) select(go.dataset.go);
    });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && sel && !document.getElementById('tab-map').hidden) select(null); });
    if (window.ResizeObserver) new ResizeObserver(draw).observe(canvas); else addEventListener('resize', draw);
  }

  /* Edge geometry: same lane → side to side; otherwise bottom → top. Anchors on a side are spread so lines don't stack. */
  function draw() {
    if (!canvas || canvas.offsetParent === null) return;
    var base = canvas.getBoundingClientRect();
    if (getComputedStyle(svg).display === 'none') { labels.innerHTML = ''; return; }
    svg.setAttribute('width', canvas.scrollWidth); svg.setAttribute('height', canvas.scrollHeight);
    var rect = {};
    NODES.forEach(function (n) {
      var el = canvas.querySelector('[data-id="' + n.id + '"]'); var r = el.getBoundingClientRect();
      rect[n.id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, row: LANES.map(function (l) { return l.k; }).indexOf(n.lane) };
    });
    var sides = {};
    var plans = EDGES.map(function (e, i) {
      var a = rect[e[0]], b = rect[e[1]], sa, sb;
      if (a.row === b.row) { sa = a.x < b.x ? 'r' : 'l'; sb = a.x < b.x ? 'l' : 'r'; }
      else { sa = a.row < b.row ? 'b' : 't'; sb = a.row < b.row ? 't' : 'b'; }
      var p = { i: i, e: e, sa: sa, sb: sb };
      (sides[e[0] + sa] = sides[e[0] + sa] || []).push({ p: p, end: 'a', other: b });
      (sides[e[1] + sb] = sides[e[1] + sb] || []).push({ p: p, end: 'b', other: a });
      return p;
    });
    Object.keys(sides).forEach(function (k) {
      var list = sides[k]; var id = k.slice(0, -1), s = k.slice(-1), r = rect[id];
      var horiz = s === 't' || s === 'b';
      list.sort(function (m, n) { return horiz ? (m.other.x - n.other.x) : (m.other.y - n.other.y); });
      list.forEach(function (m, j) {
        var f = (j + 1) / (list.length + 1);
        var pt = horiz ? { x: r.x + r.w * (0.2 + 0.6 * f), y: s === 'b' ? r.y + r.h : r.y } : { x: s === 'r' ? r.x + r.w : r.x, y: r.y + r.h * (0.25 + 0.5 * f) };
        m.p[m.end] = pt;
      });
    });
    var paths = '', lab = '';
    plans.forEach(function (p) {
      var a = p.a, b = p.b, d;
      if (p.sa === 'r' || p.sa === 'l') { var dx = Math.max(30, Math.abs(b.x - a.x) / 2) * (p.sa === 'r' ? 1 : -1); d = 'M' + a.x + ' ' + a.y + ' C' + (a.x + dx) + ' ' + a.y + ' ' + (b.x - dx) + ' ' + b.y + ' ' + b.x + ' ' + b.y; }
      else { var dy = Math.max(40, Math.abs(b.y - a.y) / 2) * (p.sa === 'b' ? 1 : -1); d = 'M' + a.x + ' ' + a.y + ' C' + a.x + ' ' + (a.y + dy) + ' ' + b.x + ' ' + (b.y - dy) + ' ' + b.x + ' ' + b.y; }
      paths += '<path class="smap-edge" data-e="' + p.i + '" data-from="' + p.e[0] + '" data-to="' + p.e[1] + '" d="' + d + '" marker-end="url(#smapArrow)"/>';
      lab += '<span class="smap-elabel" data-e="' + p.i + '" style="left:' + ((a.x + b.x) / 2) + 'px;top:' + ((a.y + b.y) / 2) + 'px">' + esc(p.e[2]) + '</span>';
    });
    svg.innerHTML = svg.querySelector('defs').outerHTML + paths;
    labels.innerHTML = lab;
    paint();
  }

  /* Highlight state: a selected card lights up its connections; a journey lights up its path in order. */
  function paint() {
    if (!root) return;
    var onNodes = null, onEdges = null, order = {};
    if (journey) {
      var ids = journey.steps.map(function (s) { return s[0]; });
      onNodes = ids; onEdges = [];
      ids.forEach(function (id, i) { if (!(id in order)) order[id] = []; order[id].push(i + 1); });
      for (var i = 0; i < ids.length - 1; i++) EDGES.forEach(function (e, k) { if ((e[0] === ids[i] && e[1] === ids[i + 1]) || (e[1] === ids[i] && e[0] === ids[i + 1])) onEdges.push(k); });
    }
    if (sel) {
      onNodes = (onNodes || []).concat([sel], neighbors(sel));
      onEdges = (onEdges || []).concat(EDGES.map(function (e, k) { return e[0] === sel || e[1] === sel ? k : -1; }).filter(function (k) { return k >= 0; }));
    }
    root.classList.toggle('focus', !!onNodes);
    root.querySelectorAll('.smap-node').forEach(function (el) {
      var id = el.dataset.id;
      el.classList.toggle('on', !!onNodes && onNodes.indexOf(id) >= 0);
      el.classList.toggle('sel', id === sel);
      el.setAttribute('aria-pressed', id === sel ? 'true' : 'false');
      var st = el.querySelector('.smap-step'); st.textContent = order[id] ? order[id].join(' · ') : ''; el.classList.toggle('numbered', !!order[id]);
    });
    root.querySelectorAll('.smap-edge, .smap-elabel').forEach(function (el) {
      var k = +el.dataset.e; el.classList.toggle('on', !!onEdges && onEdges.indexOf(k) >= 0);
    });
  }

  function setJourney(k) {
    journey = JOURNEYS.filter(function (j) { return j.k === k; })[0] || null;
    root.querySelectorAll('[data-j]').forEach(function (b) { b.classList.toggle('on', (b.dataset.j || null) === (journey ? journey.k : null)); });
    if (journey) {
      stepsBox.innerHTML = journey.steps.map(function (s, i) {
        return '<li><button type="button" data-step="' + s[0] + '"><b>' + (i + 1) + '</b><span><em>' + esc(byId[s[0]].title) + '</em>' + esc(s[1]) + '</span></button></li>';
      }).join('');
      stepsBox.hidden = false;
    } else { stepsBox.hidden = true; stepsBox.innerHTML = ''; }
    select(null, true);
    requestAnimationFrame(draw);
  }

  function list(items) { return '<ul>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  function select(id, quiet) {
    sel = id || null;
    paint();
    if (!sel) { detail.hidden = true; scrim.hidden = true; return; }
    var n = byId[sel], lane = LANES.filter(function (l) { return l.k === n.lane; })[0];
    var talks = neighbors(sel).map(function (o) {
      var e = EDGES.filter(function (x) { return (x[0] === sel && x[1] === o) || (x[1] === sel && x[0] === o); })[0];
      return '<button type="button" class="smap-go" data-go="' + o + '"><span>' + (e[0] === sel ? '→' : '←') + '</span>' + esc(byId[o].title) + '<small>' + esc(e[2]) + '</small></button>';
    }).join('');
    var inJourney = journey ? journey.steps.map(function (s, i) { return s[0] === sel ? '<p class="smap-jnote"><b>Step ' + (i + 1) + ' of “' + esc(journey.name) + '”:</b> ' + esc(s[1]) + '</p>' : ''; }).join('') : '';
    detail.innerHTML = '<div class="dh"><div><span class="smap-kind" data-lane="' + n.lane + '">' + esc(n.kind) + ' · ' + esc(lane.name) + '</span><h2>' + esc(n.title) + '</h2><p>' + esc(n.sub) + '</p></div>' +
      '<button class="icon-btn" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="smap-body">' + inJourney +
      '<p class="smap-what">' + n.what + '</p>' +
      (n.when ? '<h3>When it runs</h3>' + list(n.when) : '') +
      (n.logic ? '<h3>Rules &amp; logic</h3>' + list(n.logic) : '') +
      '<h3>Connected to</h3><div class="smap-gos">' + talks + '</div>' +
      (n.where ? '<h3>Where it lives</h3>' + list(n.where.concat(n.wf ? ['<a href="' + WF + n.wf + '" target="_blank" rel="noopener">Open in n8n ↗</a>'] : [])) : '') +
      (n.check ? '<h3>If something looks off</h3>' + list(n.check) : '') + '</div>';
    detail.hidden = false; scrim.hidden = false;
    if (!quiet) { var b = detail.querySelector('[data-close]'); if (b) b.focus({ preventScroll: true }); }
  }

  window.WPSystemMap = {
    show: function () { build(); requestAnimationFrame(draw); },
    hide: function () { if (detail) { sel = null; detail.hidden = true; scrim.hidden = true; paint(); } },
    _data: { NODES: NODES, EDGES: EDGES, JOURNEYS: JOURNEYS }
  };
})();
