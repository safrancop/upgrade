// End-to-end check of the real page in Chromium, at desktop and phone width.
// Walks every section and tab, checks off a habit, reloads, exports and imports a backup.
// Fails on any page error or horizontal overflow.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const url = new URL('../index.html', import.meta.url).href;
const browser = await chromium.launch();
const results = [];

async function openNav(page) {
  if (!(await page.locator('#nav').isVisible())) {
    await page.getByRole('button', {name: 'More sections', exact: true}).click();
  }
}
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('upgrade.store.v1')));

try {
  for (const width of [1440, 400]) {
    const context = await browser.newContext({viewport: {width, height: 900}, acceptDownloads: true});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);

    // 1. Every section and every tab renders without errors or sideways scroll.
    await openNav(page);
    const labels = await page.locator('#nav .navitem').evaluateAll(ns => ns.map(n => n.getAttribute('aria-label') || n.textContent.trim()));
    assert.ok(labels.length >= 10, 'All sections are in the menu');
    let tabs = 0;
    for (let i = 0; i < labels.length; i++) {
      await openNav(page);
      await page.locator('#nav .navitem').nth(i).click();
      const view = await page.evaluate(() => document.querySelector('.view.on').id);
      const count = await page.locator('#' + view + ' .tab').count();
      for (let j = 0; j < count; j++) { await page.locator('#' + view + ' .tab').nth(j).click(); tabs++; }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${view} overflows by ${overflow}px at ${width}px`);
    }

    // 2. Checking off a habit is saved and survives a reload.
    await openNav(page);
    await page.locator('#nav .navitem').first().click();
    await page.locator('[aria-label="Check off Reading"]').click();
    const today = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    assert.equal((await store(page)).days[today].entries.reading.done, true, 'Check-off saved');
    await page.reload();
    assert.equal((await store(page)).days[today].entries.reading.done, true, 'Check-off survives reload');

    // 3. Export downloads the whole store as JSON.
    await openNav(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(backup.days[today].entries.reading.done, true, 'Export contains today');
    assert.ok(Array.isArray(backup.habits) && backup.profile, 'Export contains habits and profile');

    // 4. Import a backup file into a fresh browser and get everything back.
    const fresh = await browser.newContext({viewport: {width, height: 900}});
    const p2 = await fresh.newPage();
    p2.on('pageerror', e => errors.push(e.message));
    await p2.goto(url);
    await p2.locator('#importFile').setInputFiles({name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))});
    await p2.waitForFunction(k => JSON.parse(localStorage.getItem('upgrade.store.v1')).days[k]?.entries?.reading?.done === true, today);
    await fresh.close();

    assert.deepEqual(errors, [], 'No page errors');
    results.push({width, sections: labels.length, tabs});
    await context.close();
  }
  console.log('PASS e2e:', JSON.stringify(results));
} finally {
  await browser.close();
}
