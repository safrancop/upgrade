// End-to-end checks of the real page in Chromium, at desktop and phone width.
// Serves the app over HTTP (so the Content-Security-Policy applies as it does in production),
// or targets APP_URL when given, e.g. APP_URL=https://safrancop.github.io/upgrade/ npm run test:e2e
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

let server = null;
let url = process.env.APP_URL;
if (!url) {
  const port = 4790 + Math.floor(Math.random() * 100);
  server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/dev.mjs', import.meta.url))], {env: {...process.env, PORT: String(port), NO_RELOAD: '1'}});
  await new Promise((resolve, reject) => {
    server.stdout.on('data', d => String(d).includes('running') && resolve());
    server.on('exit', code => reject(new Error('dev server exited ' + code)));
  });
  url = `http://localhost:${port}/`;
}

const browser = await chromium.launch();
const results = [];
const KEY = 'upgrade.store.v1';
const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const store = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

async function openNav(page) {
  if (!(await page.locator('#nav').isVisible())) await page.getByRole('button', {name: 'More sections', exact: true}).click();
}
async function newPage(context, errors) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (/Content Security Policy|Refused to/.test(m.text())) errors.push('CSP: ' + m.text()); });
  await page.goto(url);
  return page;
}
async function walkEverything(page, width, check = async () => {}) {
  await openNav(page);
  const count = await page.locator('#nav .navitem').count();
  let tabs = 0;
  for (let i = 0; i < count; i++) {
    await openNav(page);
    await page.locator('#nav .navitem').nth(i).click();
    const view = await page.evaluate(() => document.querySelector('.view.on').id);
    const n = await page.locator('#' + view + ' .tab').count();
    for (let j = 0; j < n; j++) { await page.locator('#' + view + ' .tab').nth(j).click(); tabs++; }
    await check(view);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${view} overflows by ${overflow}px at ${width}px`);
  }
  return {sections: count, tabs};
}

try {
  for (const width of [1440, 400]) {
    const viewport = {width, height: 900};
    const errors = [];
    const context = await browser.newContext({viewport, acceptDownloads: true});
    const page = await newPage(context, errors);
    const today = todayKey();

    // Every section and tab renders, with no errors, CSP violations or sideways scroll.
    const walked = await walkEverything(page, width);
    assert.ok(walked.sections >= 10, 'All sections are in the menu');

    // A check-off is saved and survives a reload.
    await openNav(page);
    await page.locator('#nav .navitem').first().click();
    await page.locator('[aria-label="Check off Reading"]').click();
    assert.equal((await store(page)).days[today].entries.reading.done, true, 'Check-off saved');
    await page.reload();
    assert.equal((await store(page)).days[today].entries.reading.done, true, 'Check-off survives reload');

    // Your name appears in the greeting.
    await page.locator('.today-settings').click();
    await page.locator('#profileName').fill('Jordan');
    await page.locator('#homePrefsDone').click();
    assert.equal((await store(page)).profile.name, 'Jordan', 'Name saved');
    assert.match(await page.locator('#railHello').textContent(), /Jordan/, 'Greeting uses the name');

    // Two tabs: work done in one tab is not overwritten by a stale save from the other.
    const other = await newPage(context, errors);
    await other.locator('[aria-label="Check off Meditation"]').click();
    await page.waitForTimeout(300); // let the storage event reach the first tab
    await page.locator('[aria-label="Check off Exercise"]').click();
    const both = (await store(page)).days[today].entries;
    assert.equal(both.meditation?.done, true, 'Other tab\'s check-off survived');
    assert.equal(both.exercise?.done, true, 'This tab\'s check-off saved');
    await other.close();

    // Export downloads the whole store and resets the backup reminder.
    await openNav(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(backup.days[today].entries.reading.done, true, 'Export contains today');
    assert.ok((await store(page)).profile.lastExportAt, 'Export time recorded');

    // Import into a fresh browser brings everything back; a broken file changes nothing.
    const fresh = await browser.newContext({viewport});
    const p2 = await newPage(fresh, errors);
    const before = await store(p2);
    await p2.locator('#importFile').setInputFiles({name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"days": "nope"}')});
    await p2.locator('#toast.on').waitFor();
    assert.match(await p2.locator('#toast').textContent(), /No data found/, 'Broken backup is rejected');
    assert.deepEqual(Object.keys((await store(p2)).days), Object.keys(before.days), 'Broken backup changes nothing');
    await p2.locator('#importFile').setInputFiles({name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))});
    await p2.waitForFunction(([k, d]) => JSON.parse(localStorage.getItem(k)).days[d]?.entries?.reading?.done === true, [KEY, today]);
    assert.equal((await store(p2)).profile.name, 'Jordan', 'Profile restored');
    await fresh.close();

    // Stored data is rendered as text: HTML in any field never executes.
    const evil = await browser.newContext({viewport});
    const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
    await evil.addInitScript(([k, x, d]) => {
      if (localStorage.getItem(k)) return;
      const at = new Date().toISOString();
      localStorage.setItem(k, JSON.stringify({
        profile: {name: x, identity: [x]},
        habits: [{id: 'evil', name: x, unit: x, target: 1, minimum: x, anchor: x, ifThen: x}],
        books: [{id: 'b', title: x, author: x, page: 1, pages: 9}],
        days: {[d]: {date: d, entries: {evil: {done: true, value: 1}}, journal: {mood: 3, morning: x, evening: x, gratitude: [x]},
          reading: [{bookId: 'b', pages: 2, note: x, at}], exercise: [{kind: x, minutes: 5, note: x, at}],
          cardio: [{mode: x, minutes: 5, distance: 1, intensity: x, note: x, at}], meditation: [{minutes: 3, kind: x, at}]}}
      }));
    }, [KEY, X, today]);
    // The CSP would block the handler anyway; this checks the escaping underneath it.
    const p3 = await newPage(evil, []);
    await walkEverything(p3, width, async view => {
      assert.equal(await p3.locator('img[src="x"]').count(), 0, `Stored HTML became an element in ${view}`);
    });
    assert.equal(await p3.evaluate(() => window.__xss || 0), 0, 'No stored HTML executed');
    await evil.close();

    // When the browser refuses to save, the person is told instead of losing data silently.
    const full = await browser.newContext({viewport});
    await full.addInitScript(() => { window.__blockSaves = () => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; }; });
    const p4 = await newPage(full, errors);
    await p4.evaluate(() => window.__blockSaves());
    await p4.locator('[aria-label="Check off Reading"]').click();
    await p4.locator('#toast.on').waitFor();
    assert.match(await p4.locator('#toast').textContent(), /Couldn't save/, 'Save failure is announced');
    await openNav(p4);
    assert.match(await p4.locator('#syncTxt').textContent(), /Not saving/, 'Footer shows the failure');
    await full.close();

    // With a week of history and no backup, the footer asks for one.
    const due = await browser.newContext({viewport});
    await due.addInitScript(k => {
      const days = {};
      for (let i = 1; i <= 8; i++) { const d = new Date(); d.setDate(d.getDate() - i); const key = d.toISOString().slice(0, 10); days[key] = {date: key, entries: {}}; }
      if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({profile: {name: 'Sam'}, habits: [], books: [], days}));
    }, KEY);
    const p5 = await newPage(due, errors);
    await openNav(p5);
    assert.match(await p5.locator('#syncTxt').textContent(), /Time for a backup/, 'Backup reminder shows');
    await due.close();

    assert.deepEqual(errors, [], 'No page errors or CSP violations');
    results.push({width, ...walked});
    await context.close();
  }
  console.log('PASS e2e (' + url + '):', JSON.stringify(results));
} finally {
  await browser.close();
  server?.kill();
}
