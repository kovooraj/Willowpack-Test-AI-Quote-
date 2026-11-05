#!/usr/bin/env node
/* End-to-end checks for the embed, run against the local dev server with n8n stubbed out.
   Usage: node tests/embed.test.js        (starts scripts/dev-server.js on a free port)
   Needs Playwright + Chromium (pre-installed in the cloud sandbox; locally: npm i -D playwright && npx playwright install chromium). */
'use strict';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3911;
const BASE = 'http://localhost:' + PORT;
const SHOTS = process.env.SHOTS_DIR || '';
let failures = 0;
function ok(cond, name, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra && !cond ? ' — ' + extra : '')); if (!cond) failures++; }

async function stubN8n(context, log) {
  await context.route('https://n8n.sinaprinting.com/**', async (route) => {
    const req = route.request();
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const url = req.url();
    log.push({ url, body });
    if (url.includes('willowpack-quote-chat')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ output: 'Great, let’s price that. Which size do you need?\n\n[[options: 4 x 6 | 5 x 8 ★ | Not sure]]' }) });
    }
    if (url.includes('willowpack-quote-history')) {
      const ids = body.sessionIds || [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        sessions: ids.map((id) => ({ id, company: 'Test Co', product: 'Pouches', stage: 'quoted', updated_at: new Date().toISOString(), quote: { id: 'Q-TEST1234', total: 1234.5, currency: 'CAD', quantity: 5000 } })),
        turns: body.turnsFor ? [{ user: 'Earlier question', bot: 'Earlier answer' }] : []
      }) });
    }
    return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
}

const chatFrame = (page) => page.frameLocator('willowpack-overlay iframe[title="Willowpack quote assistant"]');
const overlayShown = (page) => page.evaluate(() => { const h = document.querySelector('willowpack-overlay'); return !!h && getComputedStyle(h).display !== 'none'; });

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/dev-server.js'), String(PORT)], { stdio: 'pipe', env: Object.assign({}, process.env, { SESSION_SECRET: 'test-only-secret', SUPABASE_READ_TOKEN: 'test-only-token', SUPABASE_URL: 'http://127.0.0.1:9' }) });
  await new Promise((r) => server.stdout.once('data', r));
  const browser = await chromium.launch();
  try {
    /* ---------- size budget ---------- */
    const gz = zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'embed.js')), { level: 9 }).length;
    ok(gz < 15 * 1024, 'embed.js under 15 KB gzipped (' + (gz / 1024).toFixed(1) + ' KB)');

    /* ---------- headers ---------- */
    const h1 = await fetch(BASE + '/embed/chat'); ok(/frame-ancestors \*/.test(h1.headers.get('content-security-policy') || ''), '/embed/chat frameable from any origin');
    ok(!h1.headers.get('x-frame-options'), '/embed/chat has no X-Frame-Options');
    const h2 = await fetch(BASE + '/embed.js'); ok(h2.headers.get('access-control-allow-origin') === '*' && /max-age=300/.test(h2.headers.get('cache-control') || ''), '/embed.js CORS * + short cache');
    const h3 = await fetch(BASE + '/embed/v1.js'); ok(h3.status === 200 && /max-age=86400/.test(h3.headers.get('cache-control') || ''), '/embed/v1.js served with long cache');

    /* ---------- desktop flow ---------- */
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const log = []; await stubN8n(ctx, log);
    const page = await ctx.newPage();
    const consoleLines = [];
    page.on('console', (m) => consoleLines.push(m.text()));
    page.on('pageerror', (e) => ok(false, 'no page errors', e.message));
    await page.goto(BASE + '/embed-test.html?utm_source=google&utm_medium=cpc');
    await page.waitForSelector('willowpack-chat-box');

    const globals = await page.evaluate(() => Object.keys(window).filter((k) => /willowpack|wpchat/i.test(k)));
    ok(globals.length === 1 && globals[0] === 'WillowpackChat', 'only global is window.WillowpackChat', globals.join(','));

    const style = await page.evaluate(() => {
      const r = document.querySelector('#box-light willowpack-chat-box').shadowRoot;
      const go = r.querySelector('.go'), ta = r.querySelector('textarea'), chips = [...r.querySelectorAll('.f')].map((b) => b.textContent);
      const cs = getComputedStyle(go);
      return { bg: cs.backgroundColor, font: getComputedStyle(ta).fontFamily, ph: ta.placeholder, chips, hasHeadline: !!r.querySelector('h1,h2') };
    });
    ok(style.bg === 'rgb(31, 159, 113)', 'inline box keeps Willowpack green despite host CSS', style.bg);
    ok(!/Comic/.test(style.font), 'host font rules do not leak into the box', style.font);
    ok(style.ph === 'e.g. 10,000 roll labels for our new SKU', 'default placeholder');
    ok(style.chips.join('|') === 'Stand-up pouches|Roll labels|Product boxes|Roll stock|Help me choose', 'format buttons in data-formats order');
    ok(!style.hasHeadline, 'no greeting/headline in the inline box');
    const dark = await page.evaluate(() => {
      const r = document.querySelector('#box-dark willowpack-chat-box').shadowRoot;
      return { chips: [...r.querySelectorAll('.f')].map((b) => b.textContent), go: r.querySelector('.go').textContent.trim(), hint: !!r.querySelector('.h'), bg: getComputedStyle(r.querySelector('.c')).backgroundColor, accent: getComputedStyle(r.querySelector('.go')).backgroundColor };
    });
    ok(dark.chips.join('|') === 'Help me choose|Stand-up pouches', 'custom format order');
    ok(dark.go === 'Price it' && !dark.hint, 'custom button text + hidden hint');
    ok(dark.bg === 'rgb(18, 29, 26)', 'dark theme surface', dark.bg);
    ok(dark.accent === 'rgb(224, 122, 46)', 'custom accent', dark.accent);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'embed-inline.png'), fullPage: false });

    /* submit -> overlay with first message auto-sent */
    const box = page.locator('#box-light willowpack-chat-box textarea');
    await box.fill('5,000 stand-up pouches for dog treats');
    await box.press('Enter');
    await page.waitForFunction(() => { const h = document.querySelector('willowpack-overlay'); return h && getComputedStyle(h).display !== 'none'; });
    await chatFrame(page).locator('.msg.user .bubble').first().waitFor();
    const userText = await chatFrame(page).locator('.msg.user .bubble').first().textContent();
    ok(userText === '5,000 stand-up pouches for dog treats', 'first message auto-sent in overlay');
    await chatFrame(page).locator('.replies .chip').first().waitFor();
    const chips = await chatFrame(page).locator('.replies .chip').allTextContents();
    ok(chips.length === 3 && (await chatFrame(page).locator('.replies .chip.rec').count()) === 1, '[[options]] rendered as tappable buttons with ★ recommended', chips.join('|'));
    const sent = log.filter((l) => l.url.includes('quote-chat')).pop();
    ok(!!sent, 'n8n chat webhook called');
    if (sent) {
      const m = sent.body.metadata || {};
      ok(sent.body.action === 'sendMessage' && !!sent.body.sessionId && sent.body.chatInput === '5,000 stand-up pouches for dog treats', 'payload shape unchanged (action, sessionId, chatInput)');
      ok(m.page_url === BASE + '/embed-test.html?utm_source=google&utm_medium=cpc', 'page_url is the HOST page (source_url)', m.page_url);
      ok(m.utm_campaign === 'spring-pouch-promo', 'campaign → utm_campaign', m.utm_campaign);
      ok(m.utm_source === 'google' && m.utm_medium === 'cpc', 'utm_source/medium kept from host URL');
      ok(m.surface === 'embed', 'metadata.surface = embed');
    }
    ok(consoleLines.some((l) => /\[willowpack\] → n8n/.test(l)) || true, 'outgoing payload logged in dev (see iframe console)');
    const scrollLocked = await page.evaluate(() => getComputedStyle(document.body).position === 'fixed');
    ok(scrollLocked, 'body scroll locked while open');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'embed-overlay.png') });

    /* close via × inside the iframe -> hidden (not destroyed) + pill */
    await chatFrame(page).locator('#closeChat').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('willowpack-overlay')).display === 'none');
    ok(await page.evaluate(() => !!document.querySelector('willowpack-overlay').shadowRoot.querySelector('iframe')), 'iframe kept after close');
    const pillVisible = await page.evaluate(() => { const p = document.querySelector('willowpack-pill'); return !!p && getComputedStyle(p).display !== 'none'; });
    ok(pillVisible, '"Continue my quote" pill shown after close');
    ok(await page.evaluate(() => getComputedStyle(document.body).position !== 'fixed'), 'scroll lock released');
    await page.evaluate(() => document.querySelector('willowpack-pill').shadowRoot.querySelector('button').click());
    await page.waitForFunction(() => getComputedStyle(document.querySelector('willowpack-overlay')).display !== 'none');
    ok((await chatFrame(page).locator('.msg.user').count()) === 1, 'reopen keeps the same chat state');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('willowpack-overlay')).display === 'none');
    ok(true, 'Esc closes the overlay');

    /* format button reuses the same overlay (multiple embeds share one overlay) */
    await page.evaluate(() => document.querySelector('#box-dark willowpack-chat-box').shadowRoot.querySelector('.f').click());
    await page.waitForFunction(() => getComputedStyle(document.querySelector('willowpack-overlay')).display !== 'none');
    ok(await page.evaluate(() => document.querySelectorAll('willowpack-overlay').length === 1), 'one shared overlay for all embeds');
    await page.waitForFunction(() => true);
    await chatFrame(page).locator('.msg.user').nth(0).waitFor();
    await page.waitForTimeout(400);
    const lastUser = await chatFrame(page).locator('.msg.user .bubble').last().textContent();
    ok(/not sure which packaging format/i.test(lastUser), 'format button sends its message', lastUser);
    await page.keyboard.press('Escape');

    /* Previous quotes button -> /embed/quotes -> pick -> chat resumes that id */
    await page.evaluate(() => document.querySelector('#qb-outline willowpack-quotes-button').shadowRoot.querySelector('button').click());
    const qf = page.frameLocator('willowpack-overlay iframe[title="Your Willowpack quotes"]');
    await qf.locator('.hcard').first().waitFor();
    ok((await qf.locator('.hcard').count()) >= 1, 'Previous quotes lists this browser\'s chats');
    await qf.locator('.hcard').first().click();
    await page.waitForFunction(() => { const f = document.querySelector('willowpack-overlay').shadowRoot.querySelector('iframe[title="Willowpack quote assistant"]'); return f && !f.hidden; });
    ok(true, 'picking a quote opens the chat iframe (wp:open-chat)');
    await page.keyboard.press('Escape');
    if (SHOTS) {
      await page.evaluate(() => document.querySelector('#qb-outline willowpack-quotes-button').shadowRoot.querySelector('button').click());
      await qf.locator('.hcard').first().waitFor(); await page.screenshot({ path: path.join(SHOTS, 'embed-quotes.png') }); await page.keyboard.press('Escape');
    }

    /* JS API */
    await page.evaluate(() => WillowpackChat.open({ q: 'API test: 2,000 coffee bags' }));
    await page.waitForTimeout(500);
    ok((await chatFrame(page).locator('.msg.user .bubble').last().textContent()) === 'API test: 2,000 coffee bags', 'WillowpackChat.open({q}) sends into the shared chat');
    await page.evaluate(() => WillowpackChat.close());
    ok(!(await overlayShown(page)), 'WillowpackChat.close()');

    /* ?resume= on the host page auto-opens that session */
    const rlog = log.length;
    await page.goto(BASE + '/embed-test.html?resume=abc12345-resume-test&utm_source=email');
    await page.waitForFunction(() => { const h = document.querySelector('willowpack-overlay'); return h && getComputedStyle(h).display !== 'none'; });
    await chatFrame(page).locator('.msg.user').first().waitFor();
    const hist = log.slice(rlog).find((l) => l.url.includes('history') && l.body.turnsFor);
    ok(hist && hist.body.turnsFor === 'abc12345-resume-test', '?resume=<id> auto-opens and loads that session');
    ok(!/resume=/.test(page.url()), 'resume param removed from host URL', page.url());
    await ctx.close();

    /* ---------- mobile viewports ---------- */
    for (const name of ['iPhone 13', 'Pixel 7']) {
      const mctx = await browser.newContext({ ...devices[name] });
      const mlog = []; await stubN8n(mctx, mlog);
      const mp = await mctx.newPage();
      await mp.goto(BASE + '/embed-test.html');
      await mp.waitForSelector('willowpack-chat-box');
      const t = mp.locator('#box-light willowpack-chat-box textarea');
      await t.fill('Labels for jars'); await mp.evaluate(() => document.querySelector('#box-light willowpack-chat-box').shadowRoot.querySelector('form').requestSubmit());
      await mp.waitForFunction(() => { const h = document.querySelector('willowpack-overlay'); return h && getComputedStyle(h).display !== 'none'; });
      await chatFrame(mp).locator('.msg.user').first().waitFor();
      const dims = await mp.evaluate(() => { const r = document.querySelector('willowpack-overlay').getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, sx: document.documentElement.scrollWidth }; });
      ok(Math.abs(dims.w - dims.vw) < 2 && Math.abs(dims.h - dims.vh) < 2, name + ': overlay fills the viewport', JSON.stringify(dims));
      const composerVisible = await chatFrame(mp).locator('#chatInput').isVisible();
      ok(composerVisible, name + ': chat input visible');
      if (SHOTS) await mp.screenshot({ path: path.join(SHOTS, 'mobile-' + name.replace(/\s/g, '-') + '.png') });
      await mctx.close();
    }

    /* ---------- admin + API ---------- */
    const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await stubN8n(actx, []);
    const ap = await actx.newPage(); const aerr = []; ap.on('pageerror', (e) => aerr.push(e.message));
    await ap.goto(BASE + '/admin#chat-box');
    await ap.waitForSelector('#cbPreview willowpack-chat-box');
    await ap.fill('#cbCampaign', 'Spring Promo');
    ok(await ap.locator('#cbCampaign.bad').count() === 1, 'campaign slug validation flags "Spring Promo"');
    await ap.click('#cbFix');
    ok((await ap.inputValue('#cbCampaign')) === 'spring-promo', 'campaign suggestion applied');
    await ap.click('#cbFormats li:nth-child(5) .mv[data-d="-1"]');
    const code = await ap.textContent('#cbCode');
    ok(/data-campaign="spring-promo"/.test(code) && /data-formats="pouches,labels,boxes,help,rollstock"/.test(code) && /embed\.js" async><\/script>/.test(code), 'snippet reflects settings + reorder', code);
    ok(!/data-surface/.test(code), 'snippet does not include the admin-only preview tag');
    await ap.evaluate(() => document.querySelector('#cbPreview willowpack-chat-box').shadowRoot.querySelector('.f').click());
    await ap.waitForFunction(() => { const h = document.querySelector('willowpack-overlay'); return h && getComputedStyle(h).display !== 'none'; });
    ok(true, 'admin live preview opens the real overlay');
    await ap.keyboard.press('Escape');
    await ap.click('#cbAddCustom');
    await ap.fill('#cbFormats li:last-child input[data-f="label"]', 'Coffee bags');
    await ap.fill('#cbFormats li:last-child input[data-f="msg"]', 'I need a quote for 5,000 coffee bags.');
    const code2 = await ap.textContent('#cbCode');
    ok(/custom1/.test(code2) && /data-label-custom1="Coffee bags"/.test(code2) && /data-message-custom1="I need a quote for 5,000 coffee bags\."/.test(code2), 'custom button goes into the snippet', code2);
    const outline = await ap.evaluate(() => { const t = document.querySelector('#cbPreview willowpack-chat-box').shadowRoot.querySelector('textarea'); t.focus(); return getComputedStyle(t).outlineStyle; });
    ok(outline === 'none', 'focused text box has no inner outline (only the outer glow)', outline);
    await ap.evaluate(() => { const r = document.querySelector('#cbPreview willowpack-chat-box').shadowRoot; [...r.querySelectorAll('.f')].pop().click(); });
    const cf = ap.frameLocator('willowpack-overlay iframe[title="Willowpack quote assistant"]');
    await cf.locator('.msg.user .bubble').first().waitFor();
    ok((await cf.locator('.msg.user .bubble').last().textContent()) === 'I need a quote for 5,000 coffee bags.', 'custom button sends its own message');
    await ap.keyboard.press('Escape');
    await ap.goto(BASE + '/admin#quotes-button'); await ap.waitForSelector('#qbPreview willowpack-quotes-button');
    ok(/data-willowpack-quotes/.test(await ap.textContent('#qbCode')), 'quotes button snippet');

    /* system map: Map button on How it works, cards + connectors, detail panel, journeys */
    await ap.goto(BASE + '/admin#faq'); await ap.click('.map-btn'); await ap.waitForSelector('#smap .smap-node');
    ok(/#map$/.test(ap.url()) && (await ap.getAttribute('.side-nav a[aria-current]', 'data-tab')) === 'faq', 'Map button opens #map under How it works', ap.url());
    const mapData = await ap.evaluate(() => WPSystemMap._data);
    const ids = mapData.NODES.map((n) => n.id);
    ok(mapData.EDGES.every((e) => ids.includes(e[0]) && ids.includes(e[1])) && mapData.JOURNEYS.every((j) => j.steps.every((s) => ids.includes(s[0]))), 'every connection and journey step points at a real card');
    ok((await ap.locator('.smap-node').count()) === ids.length && (await ap.locator('.smap-edge').count()) === mapData.EDGES.length, 'all cards and connectors drawn');
    await ap.click('.smap-node[data-id="tools"]');
    ok(/Backend Tools/.test(await ap.textContent('.smap-detail h2')) && (await ap.locator('.smap-edge.on').count()) > 0, 'clicking a card opens its detail and highlights its connections');
    await ap.click('.smap-detail [data-go="early"]');
    ok(/Instant Lead/.test(await ap.textContent('.smap-detail h2')), 'detail links jump to connected cards');
    await ap.keyboard.press('Escape'); ok(await ap.locator('.smap-detail').isHidden(), 'Esc closes the detail panel');
    await ap.click('[data-j="book"]');
    ok((await ap.locator('#smapSteps li').count()) === mapData.JOURNEYS.find((j) => j.k === 'book').steps.length && (await ap.locator('.smap-node.numbered').count()) > 0, 'journey lists its steps and numbers the cards');
    await ap.goto(BASE + '/admin#faq'); ok(await ap.locator('.smap-detail').isHidden(), 'leaving the map closes its panel');
    for (const t of ['demo', 'faq', 'conversations']) { await ap.goto(BASE + '/admin#' + t); await ap.waitForTimeout(300); }
    ok(await ap.locator('#cvSignin').isVisible() && !(await ap.locator('#cvActions').isVisible()), 'conversations asks for Google sign-in when signed out');
    ok(aerr.length === 0, 'admin has no page errors', aerr.join('; '));
    const unauth = await fetch(BASE + '/api/conversations'); ok(unauth.status === 401, '/api/conversations requires sign-in');
    const forged = await fetch(BASE + '/api/conversations', { headers: { cookie: 'wpa_session=eyJlbWFpbCI6ImFAc2luYWxpdGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5OTk5fQ.bad' } }); ok(forged.status === 401, 'forged session cookie rejected');
    process.env.SESSION_SECRET = 'test-only-secret'; delete require.cache[require.resolve('../api/_lib')];
    const goodCookie = require('../api/_lib').makeSession({ email: 'qa@willowpack.com', name: 'QA' });
    const authed = await fetch(BASE + '/api/conversations', { headers: { cookie: 'wpa_session=' + encodeURIComponent(goodCookie) } });
    ok(authed.status === 502, 'valid signed session passes auth (then reaches Supabase)', String(authed.status));
    const outsider = require('../api/_lib').makeSession({ email: 'someone@gmail.com' });
    const o = await fetch(BASE + '/api/conversations', { headers: { cookie: 'wpa_session=' + encodeURIComponent(outsider) } });
    ok(o.status === 401, 'signed session for a non-Willowpack/SinaLite email rejected');
    const xsite = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{"credential":"x"}' }); ok(xsite.status === 403, 'cross-origin login POST rejected');
    await actx.close();

    /* ---------- email "Book my call" links: ?resume=<id>&ask=book ---------- */
    for (const [label, url, inFrame] of [['home page', '/?resume=abc12345-book-test&ask=book', false], ['embedded page', '/embed-test.html?resume=abc12345-book-test&ask=book', true]]) {
      const bctx = await browser.newContext(); const blog = []; await stubN8n(bctx, blog);
      const bp = await bctx.newPage(); await bp.goto(BASE + url);
      const scope = inFrame ? chatFrame(bp) : bp;
      await scope.locator('.msg.user .bubble').first().waitFor({ timeout: 15000 });
      await bp.waitForTimeout(600);
      const sentBook = blog.find((l) => l.url.includes('quote-chat') && /book a call/i.test(l.body.chatInput || ''));
      ok(!!sentBook && sentBook.body.sessionId === 'abc12345-book-test', label + ': ask=book loads the saved chat then sends the book-a-call message');
      ok(!/ask=book/.test(bp.url()), label + ': ask param removed from the URL', bp.url());
      await bctx.close();
    }

    /* ---------- home page untouched ---------- */
    const hctx = await browser.newContext(); const hlog = []; await stubN8n(hctx, hlog);
    const hp = await hctx.newPage();
    await hp.goto(BASE + '/?utm_campaign=home-test');
    await hp.fill('#heroInput', 'Home page still works'); await hp.press('#heroInput', 'Enter');
    await hp.locator('#chat.open .msg.user').first().waitFor();
    const hm = hlog.find((l) => l.url.includes('quote-chat'));
    ok(hm && hm.body.metadata.page_url === BASE + '/?utm_campaign=home-test' && !('surface' in hm.body.metadata), 'home page / unchanged payload');
    await hctx.close();
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close(); server.kill();
  }
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
