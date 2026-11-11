/* Customer flow (/admin#flow): the chatter's journey, from the ad click to an order (or the hand-off to a rep).
   Each card: what the customer sees, what happens behind the scenes, and its status (live | stage | soon).
   shape: 'end' = an outcome where the chat stops; 'choice' = a decision point. Drawing lives in map-core.js. */
(function () {
  'use strict';
  var LANES = [
    { k: 'arrive', name: '1 · Arrives', note: 'from an ad or the website' },
    { k: 'gate', name: '2 · Who are you?', note: 'name, company, business email (mandatory)' },
    { k: 'quote', name: '3 · Builds the quote', note: 'specs, then the live price' },
    { k: 'decide', name: '4 · The price', note: 'approve, discount, or not' },
    { k: 'close', name: '5 · Closing', note: 'Opportunity + Portal quote, or a rep call' },
    { k: 'after', name: '6 · After the chat', note: 'follow-ups and the 2-day check' }
  ];

  var NODES = [
    /* 1 · Arrives */
    { id: 'ad', lane: 'arrive', col: 2, kind: 'Start', title: 'Clicks an ad or visits the site', sub: 'landing page with the chat box',
      what: 'The visitor lands on a Willowpack page (an ad landing page, Unbounce, or willowpack.com) with the quote chat box on it.',
      sees: ['A short headline and the chat box: “What are you packaging?”', 'Format buttons (pouches, labels, boxes, roll stock, help me choose).'],
      behind: ['The page’s UTM tags and campaign are captured for Salesforce.', 'A returning visitor’s link (<code>?resume=</code>) reopens their earlier chat.'] },
    { id: 'open', lane: 'arrive', col: 3, kind: 'Chat', title: 'Opens the chat', sub: 'types or taps a format',
      what: 'Typing a message or tapping a format opens the chat full-screen with that first message already sent.',
      sees: ['A friendly greeting from the Willowpack quote assistant.', 'Before any price talk, it asks who they are.'],
      behind: ['The chat is logged in the Conversations database from the first message, with its source.'] },

    /* 2 · Who are you? */
    { id: 'anon', lane: 'gate', col: 1, shape: 'end', kind: 'Outcome', title: 'Leaves without details', sub: 'Anonymous',
      statusNote: 'Live: no details means no quote and no Salesforce record. Building: the “Anonymous” label in Conversations.',
      what: 'The visitor won’t share name, company and email, or leaves before giving them. No anonymous quotes.',
      sees: ['No price is ever shown without the three details.'],
      behind: ['No Salesforce Lead and no emails.', 'The chat is only logged (labelled Anonymous in Conversations).'] },
    { id: 'ask', lane: 'gate', col: 2, shape: 'choice', kind: 'Identity gate', title: 'Gives name, company & email', sub: 'all three, before anything else',
      what: 'The hard gate: full name, company (asked directly, never guessed) and business email. Nothing is quoted until all three are in.',
      sees: ['Three quick questions, then “Is jammy.com your company website?” style confirmation.'],
      behind: ['The moment all three are saved, the Salesforce check starts in parallel; the chat never waits for it.'] },
    { id: 'crm', lane: 'gate', col: 4, kind: 'Behind the scenes', title: 'Salesforce check (parallel)', sub: 'new or existing customer?',
      what: 'Runs beside the chat within seconds: is this an existing Willowpack Lead, Contact or Account? New vs existing is decided here, not by what the customer says.',
      sees: ['Nothing; the chat carries on.'],
      behind: ['Existing Lead → reused. Contact on a Willowpack Account → existing customer, no new Lead.', 'New → a Willowpack Lead is created and tiered A/B/S/C in about 20 to 30 seconds, with an owner (A Daniel, B Daniel/Edward, S/C Edward).', 'The tier decides whose calendar is shown if they book a call.'] },

    /* 3 · Builds the quote */
    { id: 'leftearly', lane: 'quote', col: 1, shape: 'end', kind: 'Outcome', title: 'Leaves before a price', sub: 'Abandoned',
      what: 'They gave their details but left before getting a price.',
      sees: ['An hour after going quiet: an email to continue their quote (“Continue my quote” reopens the same chat).'],
      behind: ['Their Lead stays in Salesforce for the rep.', 'Labelled Abandoned in Conversations.'] },
    { id: 'specs', lane: 'quote', col: 2, kind: 'Chat', title: 'Answers spec questions', sub: 'product, size, material, finish, quantity',
      what: 'One question at a time, using only the options the Willowpack calculator offers, with a recommended choice starred.',
      sees: ['Tappable answer buttons; “Not sure” is always fine.', 'Their country is asked (or detected) to price in CAD or USD.'],
      behind: ['Product guidance rules from the Willowpack team are applied automatically.'] },
    { id: 'price', lane: 'quote', col: 3, shape: 'choice', kind: 'Chat', title: 'Sees the price', sub: 'unit price, total, price breaks',
      what: 'The live price from the Pricing Engine: the only source of prices.',
      sees: ['A price table with quantity breaks, a quote reference, and “Does this price work for you?”'],
      behind: ['Cost and margin are stripped before anything reaches the chat.', 'The quote is saved on the chat so it can be reopened later.'] },

    /* 4 · The price */
    { id: 'bounced', lane: 'decide', col: 1, shape: 'end', kind: 'Outcome', status: 'soon', title: 'Leaves after the price', sub: 'Bounced + Lead',
      what: 'They saw the price and left without approving it.',
      sees: ['An hour after going quiet: an email offering to negotiate further or connect with Sales for a better quote.'],
      behind: ['Their Lead stays in Salesforce (created when they gave their details).', 'The chat stops selling; the rep owns the next step.', 'Labelled Bounced + Lead in Conversations.'] },
    { id: 'approve', lane: 'decide', col: 2, kind: 'Chat', status: 'soon', title: 'Approves the price', sub: 'at the quoted or discounted price',
      statusNote: 'Live: an approved price goes to sales immediately. Building: no call is asked for after approval; the Portal quote is the next step.',
      what: 'The customer says yes. No call is needed: the Opportunity and their Portal quote are created next.',
      sees: ['“Great, your quote is on its way to your inbox with a link to approve and order in the Willowpack portal.”'],
      behind: ['The chat is handed to sales right away.'] },
    { id: 'notok', lane: 'decide', col: 3, shape: 'choice', kind: 'Chat', status: 'soon', title: 'Doesn’t approve', sub: 'too high, unsure, comparing',
      what: 'The price isn’t approved as-is.',
      sees: ['The assistant offers the one-time chat discount (if available).'],
      behind: ['Discount allowed only if at least 3% margin remains; otherwise it goes straight to offering a call.'] },
    { id: 'discount', lane: 'decide', col: 4, shape: 'choice', kind: 'Chat', status: 'soon', title: 'Offered 5% once', sub: 'the only discount in chat',
      what: 'A single 5% discount approved for this chat only. No other amounts, never twice.',
      sees: ['The discounted total and “Does that work?”'],
      behind: ['Takes it → same path as an approval, at the discounted price.', 'Still no → a call with their rep is offered.'] },

    /* 5 · Closing */
    { id: 'opp', lane: 'close', col: 2, kind: 'Behind the scenes', title: 'Opportunity created', sub: 'Account + Contact if new',
      what: 'Salesforce gets the deal: new customers get an Account + Contact (their Lead is retired), existing customers just get the Opportunity.',
      sees: ['Nothing; this takes a few seconds.'],
      behind: ['Owner follows the tier (A Daniel, B the rep they booked or the tier owner, S/C Edward).', 'The rep gets a hand-off email with every detail.'] },
    { id: 'portal', lane: 'close', col: 3, kind: 'Portal', title: 'Gets the Portal quote', sub: 'email + Portal login',
      what: 'The quote is created in the Willowpack Portal, linked to the Salesforce Opportunity, and emailed to the customer.',
      sees: ['An email with their quote and a button to review, approve and order it in the Portal.', 'New customers also get a “set your Portal password” invite that lands them on the quote.'],
      behind: ['The Portal company is matched by Salesforce Account, exact email, or email domain (never by name); new customers get one created.', 'Region and currency come from where they are (CA or US).'] },
    { id: 'book', lane: 'close', col: 4, kind: 'Chat', title: 'Books a call with the rep', sub: 'their tier’s rep calendar',
      what: 'They still declined, so they pick a time with their rep. Booking ends the self-serve quote path.',
      sees: ['3 or 4 time slots, then a calendar invite with a Google Meet link.'],
      behind: ['No Opportunity or Portal quote; the Lead, the meeting and the rep hand-off are kept.', 'Only the calendars allowed for the tier are shown.'] },
    { id: 'nobook', lane: 'close', col: 5, shape: 'end', kind: 'Outcome', status: 'soon', title: 'Leaves without booking', sub: 'same email as Bounced',
      what: 'They declined the discount and didn’t pick a time.',
      sees: ['An hour later: the “negotiate further or connect with Sales” email.'],
      behind: ['The chat stops selling; the rep owns the next step.'] },

    /* 6 · After the chat */
    { id: 'won', lane: 'after', col: 1, shape: 'end', kind: 'Outcome', status: 'soon', title: 'Orders in the Portal', sub: 'Won · Nice!',
      what: 'The customer accepted or ordered their Portal quote.',
      sees: ['Their order moves to artwork review and production.'],
      behind: ['Nothing more from the chat; the Opportunity stage is never changed automatically.'] },
    { id: 'check', lane: 'after', col: 2, shape: 'choice', kind: 'Behind the scenes', status: 'soon', title: '2 days later: ordered?', sub: 'a scheduled check, not the chat',
      what: 'Two days after the Portal quote is sent, the system checks whether it was accepted or ordered.',
      sees: ['Nothing.'],
      behind: ['Checks the Portal quote status once per quote.'] },
    { id: 'repcall', lane: 'after', col: 3, shape: 'end', kind: 'Outcome', status: 'soon', title: 'Rep calls to find the holdup', sub: 'Salesforce Task, due that day',
      what: 'Not ordered yet, so their rep gets a call task with the Portal quote link and the chat transcript.',
      sees: ['A call from their Willowpack rep.'],
      behind: ['No quote is re-sent from the chat.'] },
    { id: 'rephand', lane: 'after', col: 4, shape: 'end', kind: 'Outcome', title: 'Rep takes over', sub: 'Call booked',
      what: 'The meeting is on the rep’s calendar with the full chat context.',
      sees: ['The call with their rep at the booked time.'],
      behind: ['Labelled Call booked in Conversations.'] }
  ];

  var EDGES = [
    ['ad', 'open', ''], ['open', 'ask', ''], ['open', 'anon', 'won’t share details'],
    ['ask', 'crm', 'in parallel'], ['ask', 'specs', 'all three given'],
    ['specs', 'leftearly', 'leaves'], ['specs', 'price', ''],
    ['price', 'bounced', 'leaves'], ['price', 'approve', 'yes'], ['price', 'notok', 'no'],
    ['notok', 'discount', ''], ['discount', 'approve', 'takes the 5%'], ['discount', 'book', 'still no'],
    ['approve', 'opp', ''], ['crm', 'opp', 'new or existing'], ['opp', 'portal', ''],
    ['book', 'nobook', 'no time picked'], ['book', 'rephand', 'booked'],
    ['portal', 'check', '2 days'], ['check', 'won', 'yes'], ['check', 'repcall', 'not yet']
  ];

  var JOURNEYS = [
    { k: 'yes', name: 'Approves → orders', note: 'The happy path: no call needed.', steps: [
      ['ad', 'Arrives from an ad and types what they’re packaging.'], ['open', 'The chat opens with their message already sent.'],
      ['ask', 'Gives name, company and business email.'], ['crm', 'In parallel: Salesforce check and tier (new customer → Lead).'],
      ['specs', 'Answers a few spec questions.'], ['price', 'Sees the live price.'], ['approve', 'Approves it.'],
      ['opp', 'Account + Contact + Opportunity in Salesforce.'], ['portal', 'Gets the Portal quote by email (and a login invite).'],
      ['check', 'Two days later the system checks.'], ['won', 'Ordered. Nice!']] },
    { k: 'disc', name: 'Takes the discount', steps: [
      ['price', 'Sees the price; it’s a bit high.'], ['notok', 'Doesn’t approve.'], ['discount', 'Offered 5% once.'],
      ['approve', 'Takes it.'], ['opp', 'Opportunity at the discounted price.'], ['portal', 'Portal quote at the discounted price.']] },
    { k: 'call', name: 'Books a call', steps: [
      ['price', 'Sees the price.'], ['notok', 'Doesn’t approve.'], ['discount', 'Offered 5%, still no.'],
      ['book', 'Picks a time with their tier’s rep.'], ['rephand', 'The rep takes it from here.']] },
    { k: 'bounce', name: 'Leaves after the price', steps: [
      ['ask', 'Gave their details (Lead created).'], ['specs', 'Answered the specs.'], ['price', 'Saw the price.'],
      ['bounced', 'Left; an hour later the negotiate / connect-with-Sales email.']] },
    { k: 'anon', name: 'Leaves without details', steps: [
      ['ad', 'Arrives.'], ['open', 'Opens the chat.'], ['anon', 'Won’t share details: logged only, nothing sent to Salesforce.']] },
    { k: 'stall', name: 'Quote sent, no order', steps: [
      ['portal', 'Got the Portal quote.'], ['check', 'Two days later: not ordered.'], ['repcall', 'Their rep calls to find the holdup.']] }
  ];

  WPMap.register('flow', {
    rootId: 'cflow', tabId: 'tab-flow', lanes: LANES, nodes: NODES, edges: EDGES, journeys: JOURNEYS,
    journeyLabel: 'Follow a customer', allLabel: 'Every path',
    sections: [['sees', 'What the customer sees'], ['behind', 'Behind the scenes'], ['check', 'If something looks off']],
    connectedLabel: 'Comes from / leads to',
    hint: 'Click any step for what the customer sees and what happens behind the scenes. Pick a customer path above to follow it step by step.'
  });
})();
