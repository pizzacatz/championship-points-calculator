/**
 * End-to-end smoke test: drives the built app in a real browser.
 *   npm run build && npx vite preview --port 4188 --strictPort &
 *   node tests/smoke.spec.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4188/';
const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push(`  ok   ${name}`); }
  catch (err) { checks.push(`  FAIL ${name}\n         ${err.message.split('\n')[0]}`); process.exitCode = 1; }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });

const stat = (label) =>
  page.locator('.stat', { has: page.locator('.k', { hasText: new RegExp(`^${label}$`, 'i') }) })
    .locator('.v').innerText();

await check('the app renders', async () => {
  assert.match(await page.locator('h1').first().innerText(), /Championship Points/);
});

await check('the target defaults to the previous-season cutoff', async () => {
  assert.equal(await page.getByLabel('Planning target in Championship Points').inputValue(), '842');
});

// --- catalog -------------------------------------------------------------
await check('the catalog lists zones collapsed, with counts', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  assert.match(await cat.innerText(), /US and Canada/);
  assert.match(await cat.innerText(), /0 of \d+/);
});

await check('bulk-add takes a whole zone', async () => {
  const zone = page.locator('.zone', { hasText: 'US and Canada' });
  await zone.getByRole('button', { name: 'Add all' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.plan-row').length > 5);
  const n = await page.locator('.plan-row').count();
  assert.ok(n >= 10, `expected a full zone, got ${n}`);
});

await check('unchecking one event removes it again', async () => {
  const before = await page.locator('.plan-row').count();
  const zone = page.locator('.zone', { hasText: 'US and Canada' });
  await zone.locator('.zone-list input[type=checkbox]').first().uncheck();
  await page.waitForFunction((b) => document.querySelectorAll('.plan-row').length === b - 1, before);
  assert.equal(await page.locator('.plan-row').count(), before - 1);
});

await check('Clear empties the zone', async () => {
  await page.locator('.zone', { hasText: 'US and Canada' }).getByRole('button', { name: 'Clear' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.plan-row').length === 0);
});

// --- the ladder ----------------------------------------------------------
await check('a blank major is solved for by the ladder', async () => {
  const zone = page.locator('.zone', { hasText: 'US and Canada' });
  await zone.getByRole('button', { name: 'Add all' }).click();
  const ladder = page.locator('section', { has: page.getByRole('heading', { name: 'What you need' }) });
  await ladder.locator('tbody tr').first().waitFor({ timeout: 5000 });
  assert.match(await ladder.innerText(), /Regional Championship/);
});

await check('the ladder never demands a band the field cannot pay', async () => {
  const ladder = page.locator('section', { has: page.getByRole('heading', { name: 'What you need' }) });
  const text = await ladder.innerText();
  // NA majors project from 705 players, so 257-512 (kicker 1,025) is impossible.
  assert.doesNotMatch(text, /257-512|513-1024/);
});

// --- one number per event ------------------------------------------------
await check('typing a CP records a result, with no status to toggle', async () => {
  const row = page.locator('.plan-row').first();
  await row.getByLabel('CP').fill('350');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.stat')].some((s) =>
      s.querySelector('.k')?.textContent === 'CP now' && s.querySelector('.v')?.textContent.trim() === '350'));
  assert.equal((await stat('CP now')).trim(), '350');
});

await check('350 at a Regional is recognised as a direct invitation', async () => {
  assert.match(await page.locator('.plan-row').first().innerText(), /Direct invite/);
});

await check('placement works as the alternative input', async () => {
  const row = page.locator('.plan-row').nth(1);
  await row.getByLabel('Place').fill('9');
  await page.waitForFunction(() =>
    document.querySelectorAll('.plan-row')[1]?.textContent?.includes('200 CP'));
  assert.match(await row.innerText(), /200 CP/);
});

await check('an impossible CP value is rejected', async () => {
  const row = page.locator('.plan-row').first();
  await row.getByLabel('CP').fill('351');
  await row.locator('[role="alert"]').waitFor({ timeout: 4000 });
  assert.match(await row.locator('[role="alert"]').innerText(), /not one of them/);
  await row.getByLabel('CP').fill('350');
});

await check('a row asks for one number and nothing else', async () => {
  const inputs = await page.locator('.plan-row').first().locator('input').count();
  assert.equal(inputs, 2, `expected CP and Place only, got ${inputs}`);
});

// --- BFL, persistence, chrome -------------------------------------------
await check('the Best Finish Limit table reports occupancy', async () => {
  const bfl = page.locator('table', { has: page.getByText('Regional / Special / International') });
  assert.match(await bfl.innerText(), /of 5/);
});

await check('the plan survives a reload', async () => {
  const before = await page.locator('.plan-row').count();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.plan-row').count(), before);
});

await check('the version is present but quiet', async () => {
  const v = page.locator('.version a');
  assert.match(await v.innerText(), /^v\d+\.\d+\.\d+ · rules /);
  const opacity = await v.evaluate((el) => Number(getComputedStyle(el).opacity));
  assert.ok(opacity < 0.8, `version should be subtle, opacity was ${opacity}`);
});

await check('the removed v1 sections are gone', async () => {
  const body = await page.locator('main').innerText();
  for (const gone of ['Method, sources and limits', 'Official sources',
                      'Direct invitations', 'Ways to reach your target',
                      'Projected attendance']) {
    assert.doesNotMatch(body, new RegExp(gone), `"${gone}" should be removed`);
  }
});

await check('the theme toggle is an icon and works', async () => {
  const t = page.locator('.theme-toggle');
  assert.equal(await t.locator('svg').count(), 1);
  await t.click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(13, 13, 13)');
});

await check('no horizontal scroll at 320px', async () => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(150);
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 1, `overflows by ${over}px`);
  await page.setViewportSize({ width: 1280, height: 900 });
});

await check('every control has an accessible name', async () => {
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea, button')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
        || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
        || el.closest('label') || (el.tagName === 'BUTTON' && el.textContent.trim())))
      .map((el) => el.tagName + (el.id ? `#${el.id}` : '')));
  assert.deepEqual(unnamed, []);
});

await check('the browser reported no errors', async () => assert.deepEqual(errors, []));

await page.screenshot({ path: 'docs/v2-light.png', fullPage: true });
await browser.close();
console.log(checks.join('\n'));
console.log(process.exitCode ? '\nsmoke FAILED' : `\nsmoke passed (${checks.length} checks)`);
