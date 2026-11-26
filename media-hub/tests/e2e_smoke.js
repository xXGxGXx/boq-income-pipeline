#!/usr/bin/env node
/* Browser smoke test for a built Media Hub (synthetic demo library).
 *
 *   python3 tools/make_demo.py build/demo
 *   python3 tools/build.py --catalog build/demo/catalog.json --plan build/demo/media_plan.json --out dist
 *   node tests/e2e_smoke.js dist [--shots DIR]
 *
 * Runs the folder build through tools/media_serve.py with the page's own CSP ENFORCED (no bypass), on desktop and on a
 * phone profile, then the single-file build from file://. Any uncaught page error, console error or CSP violation fails
 * the run. Uses Playwright's bundled Chromium (no H.264, so the demo's MP4 is expected not to decode; WebM is used).
 */
'use strict';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), net = require('net');

const DIST = path.resolve(process.argv[2] || 'dist');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : null;
const APP = path.join(DIST, 'media-hub-app'), STANDALONE = path.join(DIST, 'media-hub-standalone.html');
const catalog = JSON.parse(fs.readFileSync(path.join(APP, 'index.html'), 'utf8').match(/<script type="application\/json" id="catalog">([\s\S]*?)<\/script>/)[1]);
const N = catalog.items.length;
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() { return new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
function pngBytes(seed) {                                       // a tiny valid 2x2 PNG, different for every seed
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, seed & 255, 40, 90, 200, 10, seed >> 8 & 255, 0, 30, 60, 90, 120, 150]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', require('zlib').deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function watch(page, label) {
  const errs = [];
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  return async () => {
    const csp = await page.evaluate(() => window.__csp || []).catch(() => []);
    ok(!errs.length, label + ': no page or console errors' + (errs.length ? '\n      ' + errs.slice(0, 6).join('\n      ') : ''));
    ok(!csp.length, label + ': no CSP violations' + (csp.length ? '\n      ' + csp.slice(0, 6).join('\n      ') : ''));
  };
}
const cards = page => page.$$eval('#grid .card', c => c.length);
async function search(page, q) { await page.fill('#q', q); await sleep(260); return page.$eval('#count', e => e.textContent); }
async function shot(page, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(400); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } }
async function blurKey(page, key) { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press(key); }

(async () => {
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-lib-')); fs.mkdirSync(path.join(lib, 'Camera'));
  fs.writeFileSync(path.join(lib, 'Camera', 'phone-pic.png'), pngBytes(7));
  const port = await freePort();
  const srv = spawn('python3', [path.join(__dirname, '..', 'tools', 'media_serve.py'), '--dir', APP, '--port', String(port), '--library', lib], { stdio: 'ignore', env: { ...process.env, MEDIA_SERVE_QUIET: '1' } });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 50; i++) { try { await new Promise((res, rej) => net.connect(port, '127.0.0.1').on('connect', function () { this.end(); res(); }).on('error', rej)); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  try {
    /* ---------------- desktop, served, CSP enforced ---------------- */
    console.log('Desktop (served, CSP enforced)');
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); const done = await watch(page, 'desktop');
    await page.goto(base); await page.waitForFunction(n => document.querySelectorAll('#grid .card').length >= n, N, { timeout: 15000 });
    ok(true, 'grid shows all ' + N + ' demo items');
    await shot(page, 'desktop-home');
    ok(/5 items/.test(await search(page, 'kind:video')), 'search kind:video → 3 clips + 2 video links');
    ok(/1 item/.test(await search(page, 'tag:sunset')), 'search tag:sunset → 1');
    ok(/2 items/.test(await search(page, 'is:ai')), 'search is:ai → 2');
    ok(/0 items/.test(await search(page, '"no such phrase anywhere"')), 'quoted phrase with no match → 0');
    await search(page, '');

    // viewer: picture, step, close
    await page.click('#grid .card[data-id="DEMO-01"]'); await page.waitForSelector('#viewer.open');
    ok(await page.$eval('#vTitle', e => e.textContent) === 'Harbour at dawn', 'viewer opens the picture');
    await blurKey(page, 'ArrowRight'); await sleep(250);
    ok(await page.$eval('#vTitle', e => e.textContent) !== 'Harbour at dawn', 'ArrowRight steps to the next item');
    await page.goBack(); await sleep(300);
    ok(!(await page.$('#viewer.open')), 'Back closes the viewer');

    // viewer: WebM clip decodes and plays
    await page.click('#grid .card[data-id="DEMO-CLIP"]'); await page.waitForSelector('#viewer.open video');
    await page.$eval('#viewer video', v => { v.muted = true; return v.play().catch(() => { }); });
    await page.waitForFunction(() => { const v = document.querySelector('#viewer video'); return v && v.currentTime > 0.3; }, null, { timeout: 8000 }).then(() => ok(true, 'WebM clip plays'), () => ok(false, 'WebM clip plays'));
    await shot(page, 'desktop-viewer-video');
    await page.keyboard.press('Escape'); await sleep(450);
    ok(!(await page.$('#viewer.open')), 'Esc closes the viewer');

    // dialogs: focus moves in, the page behind is inert, Tab stays inside, Space still plays, focus comes back
    await page.focus('#grid .card[data-id="DEMO-CLIP"]'); await page.keyboard.press('Enter'); await page.waitForSelector('#viewer.open video'); await sleep(150);
    ok(await page.evaluate(() => document.getElementById('viewer').contains(document.activeElement)), 'opening the viewer moves keyboard focus into it');
    ok(await page.evaluate(() => document.getElementById('main').inert && document.getElementById('nav').inert), 'the page behind the viewer is inert');
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.getElementById('viewer').contains(document.activeElement)), 'Tab stays inside the viewer');
    await page.evaluate(() => document.getElementById('viewer').focus());
    const p0 = await page.$eval('#viewer video', v => v.paused); await page.keyboard.press(' '); await sleep(300);
    ok(!!(await page.$('#viewer.open')) && (await page.$eval('#viewer video', v => v.paused)) !== p0, 'Space toggles play/pause (it does not press a focused Close button)');
    await page.click('#vInfo'); await page.waitForSelector('#sheet.open'); await sleep(150);
    ok(await page.evaluate(() => document.getElementById('sheet').contains(document.activeElement) && document.getElementById('viewer').inert), 'details sheet over the viewer takes focus; the viewer behind it is inert');
    await page.keyboard.press('Escape'); await sleep(450);
    if (await page.$('#sheet.open')) await page.evaluate(() => closeSheet());
    ok(await page.evaluate(() => !document.getElementById('viewer').inert && document.getElementById('viewer').contains(document.activeElement)), 'closing the sheet gives focus back to the viewer');
    await page.keyboard.press('Escape'); await sleep(450); if (await page.$('#viewer.open')) await page.evaluate(() => closeViewer());
    ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.id === 'DEMO-CLIP' && !document.getElementById('main').inert), 'closing the viewer returns focus to the card it was opened from');

    // app link (from the Perplexity draft, with a demo code)
    await page.goto(base + '?open=DEMO-01'); await page.waitForSelector('#viewer.open', { timeout: 8000 }).then(() => ok(true, 'app link ?open=DEMO-01 opens the viewer'), () => ok(false, 'app link ?open=DEMO-01 opens the viewer'));
    await page.goto(base); await page.waitForFunction(n => document.querySelectorAll('#grid .card').length >= n, N);

    // favourite survives reload
    await page.click('#grid .card[data-id="DEMO-03"] .favbtn'); await sleep(50);   // reload well inside the 400 ms save delay
    await page.goto(base); await page.waitForFunction(n => document.querySelectorAll('#grid .card').length >= n, N);
    ok(await page.$eval('#grid .card[data-id="DEMO-03"] .favbtn', b => b.getAttribute('aria-pressed')) === 'true', 'favourite survives a reload');

    // import a file: stored byte-for-byte
    const bytes = pngBytes(4242), sha = crypto.createHash('sha256').update(bytes).digest('hex');
    await page.setInputFiles('#filePick', { name: 'imported-test.png', mimeType: 'image/png', buffer: bytes });
    await page.waitForFunction(() => imported.some(i => i.name === 'imported-test.png') && document.querySelector('#grid .card[data-id^="imp-"]'), null, { timeout: 10000 }).then(() => ok(true, 'imported file appears in the grid'), () => ok(false, 'imported file appears in the grid'));
    const stored = await page.evaluate(async () => { const it = imported.find(i => i.name === 'imported-test.png'); const r = it && await dbGet('files', it.id); return r && r.blob instanceof Blob ? sha256Hex(await r.blob.arrayBuffer()) : null; }).catch(e => 'err ' + e.message);
    ok(stored === sha, 'imported bytes are identical (SHA-256 ' + sha.slice(0, 12) + '…, got ' + String(stored).slice(0, 16) + ')');

    // folders and phone folders from the companion server
    await page.click('nav [data-tab="folders"]'); await sleep(400);
    ok((await page.$$eval('#ftiles *', e => e.length)) > 3, 'Folders tab draws its folder tiles');
    await shot(page, 'desktop-folders');
    const phone = await page.evaluate(async () => { await loadServerLibrary(true); return serverItems.length; }).catch(e => 'err ' + e.message);
    ok(phone === 1, 'phone folders: 1 shared file listed by the server (got ' + phone + ')');

    // quick actions palette
    await page.click('nav [data-tab="library"]'); await sleep(200);
    await blurKey(page, 'k'); await page.waitForSelector('.open #palQ, #palQ:focus', { timeout: 3000 }).catch(() => { });
    await sleep(100); await page.keyboard.type('quiet lake'); await sleep(250); await page.keyboard.press('Enter'); await sleep(400);
    ok(await page.$eval('#vTitle', e => e.textContent).catch(() => '') === 'Quiet lake' && !!(await page.$('#viewer.open')), 'Quick actions finds and opens an item');
    await page.keyboard.press('Escape'); await sleep(450);

    // scroll feed
    await page.click('#navScroll'); await page.waitForSelector('#feed.open', { timeout: 3000 }).then(() => ok(true, 'Scroll feed opens'), () => ok(false, 'Scroll feed opens'));
    await shot(page, 'desktop-feed');
    await page.click('#feedClose'); await sleep(400);
    ok(!(await page.$('#feed.open')), 'Scroll feed closes');

    // backup round trip
    await page.click('nav [data-tab="tools"]'); await sleep(300);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnBackup')]);
    const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ok(JSON.stringify(backup).includes('DEMO-03'), 'backup contains the favourite');
    ok(!/"pin(Hash|Salt)?"\s*:\s*"[0-9a-f]{16,}/i.test(JSON.stringify(backup)), 'backup carries no PIN material');

    // the app's own self-test
    await page.click('#btnSelfTest'); await page.waitForFunction(() => /Done at/.test(document.querySelector('#diagLog').textContent), null, { timeout: 15000 });
    const diag = await page.$eval('#diagLog', e => e.innerText);
    ok(!/✗/.test(diag), 'self-test reports no failures' + (/✗/.test(diag) ? '\n      ' + diag.split('\n').filter(l => /✗/.test(l)).join('\n      ') : ''));
    await shot(page, 'desktop-tools');

    // offline: service worker serves the shell and media
    await page.goto(base); await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => { });
    const sw = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    ok(sw, 'service worker controls the page after one reload');
    if (sw) {
      await ctx.setOffline(true); await page.reload();
      await page.waitForFunction(n => document.querySelectorAll('#grid .card').length >= n, N, { timeout: 10000 }).then(() => ok(true, 'works offline (grid renders from the cache)'), () => ok(false, 'works offline (grid renders from the cache)'));
      const r = await page.evaluate(async () => { const res = await fetch('media/DEMO-01.png', { headers: { Range: 'bytes=0-7' } }); return res.status + ' ' + (await res.arrayBuffer()).byteLength; });
      ok(r === '206 8', 'offline Range request served from the cache (got ' + r + ')');
      await ctx.setOffline(false);
    }
    await done(); await ctx.close();

    /* ---------------- phone, served ---------------- */
    console.log('Phone (Pixel 7 profile)');
    const pctx = await browser.newContext({ ...devices['Pixel 7'] });
    const pp = await pctx.newPage(); const pdone = await watch(pp, 'phone');
    await pp.goto(base); await pp.waitForFunction(n => document.querySelectorAll('#grid .card').length >= n, N, { timeout: 15000 });
    ok(true, 'phone grid renders');
    ok(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scrolling on the phone');
    const kept = await pp.evaluate(async () => { window.scrollTo({ top: 900, behavior: 'instant' }); renderLibrary(); await loadServerLibrary(true); await new Promise(r => setTimeout(r, 300)); return scrollY; });
    ok(Math.abs(kept - 900) < 60, 'a library refresh keeps your scroll position (it jumped back up to the filter chips; got ' + kept + ')');
    await pp.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await sleep(150);
    await pp.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' })); await sleep(350);
    const tucked = await pp.evaluate(() => document.getElementById('fab').classList.contains('tuck'));
    await pp.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' })); await sleep(350);
    const back = await pp.evaluate(() => !document.getElementById('fab').classList.contains('tuck'));
    await pp.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await sleep(200);
    ok(tucked && back, 'floating buttons step aside on scroll down and return on scroll up (they covered the cards\u2019 \u2605)');
    await shot(pp, 'phone-home');
    await pp.tap('#grid .card[data-id="DEMO-04"]'); await pp.waitForSelector('#viewer.open');
    ok(true, 'tap opens the viewer on the phone'); await shot(pp, 'phone-viewer');
    await pdone(); await pctx.close();

    /* ---------------- single file from file:// ---------------- */
    console.log('Single file (file://)');
    const sctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const sp = await sctx.newPage(); const sdone = await watch(sp, 'standalone');
    await sp.goto('file://' + STANDALONE); await sp.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, N, { timeout: 15000 });
    ok(true, 'single file renders all items');
    await sp.waitForFunction(() => [...document.querySelectorAll('#grid .card img')].some(i => i.naturalWidth > 0), null, { timeout: 8000 }).then(() => ok(true, 'embedded pictures decode'), () => ok(false, 'embedded pictures decode'));
    await sp.click('nav [data-tab="tools"]'); await sleep(200); await sp.click('#btnSelfTest');
    await sp.waitForFunction(() => /Done at/.test(document.querySelector('#diagLog').textContent), null, { timeout: 15000 });
    const sdiag = await sp.$eval('#diagLog', e => e.innerText);
    ok(!/✗/.test(sdiag), 'single-file self-test: embedded media match their hashes' + (/✗/.test(sdiag) ? '\n      ' + sdiag.split('\n').filter(l => /✗/.test(l)).join('\n      ') : ''));
    // Companion kit viewer: phones can't preview the kit zip, so each file opens, copies and saves on its own
    const kitNames = await sp.evaluate(() => Object.keys(JSON.parse(document.querySelector('#kit').textContent || '{}')).sort());
    await sp.click('#btnKitView'); await sp.waitForSelector('#sheet.open'); await sleep(450);   // let the sheet finish sliding up
    ok(kitNames.length > 0 && await sp.$$eval('#sheetBody .kitfile', d => d.length) === kitNames.length, 'kit viewer lists every kit file (' + kitNames.length + ')');
    await sp.click('#sheetBody .kitfile[data-i="0"] summary');
    await sp.waitForFunction(() => document.querySelector('#sheetBody .kitfile[data-i="0"] .kitpre').textContent.length > 0, null, { timeout: 5000 }).catch(() => {});
    const kitText = await sp.$eval('#sheetBody .kitfile[data-i="0"] .kitpre', e => e.textContent);
    const kitWant = await sp.evaluate(n => JSON.parse(document.querySelector('#kit').textContent)[n], kitNames[0]);
    ok(kitText.length > 0 && kitText === kitWant, 'opening a kit file shows its exact text (' + kitNames[0] + ')');
    const [kitDl] = await Promise.all([sp.waitForEvent('download'), sp.click('#sheetBody [data-ksave="0"]')]);
    ok(kitDl.suggestedFilename() === kitNames[0].split('/').pop(), 'Save this file downloads just that file (' + kitDl.suggestedFilename() + ')');
    await sp.click('#scrim', { position: { x: 8, y: 8 } }); await sleep(350);   // top-left: the sheet covers the scrim's centre
    ok(!await sp.$('#sheet.open'), 'tapping outside closes the kit viewer');
    await sdone(); await sctx.close();
  } catch (e) { failures++; console.log('  ✗ crashed: ' + (e.stack || e)); }
  finally { await browser.close(); srv.kill(); fs.rmSync(lib, { recursive: true, force: true }); }
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
