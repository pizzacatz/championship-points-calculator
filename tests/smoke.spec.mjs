/**
 * End-to-end smoke test: drives the built app in a real browser and checks that
 * a plan can be entered, scored, and explained. Run against `vite preview`.
 *
 *   npm run build && npx vite preview --port 4188 &
 *   node tests/smoke.spec.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4188/championship-points-calculator/';
const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push(`  ok   ${name}`); }
  catch (err) { checks.push(`  FAIL ${name}\n         ${err.message.split('\n')[0]}`); process.exitCode = 1; }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });

const statValue = (label) =>
  page.locator('.stat', { has: page.locator('.k', { hasText: new RegExp(`^${label}$`, 'i') }) })
    .locator('.v').innerText();

await check('the app renders its heading', async () => {
  assert.match(await page.locator('h1').first().innerText(), /Championship Points Calculator/);
});

await check('the previous-season cutoff loads from the bundled data', async () => {
  assert.equal((await statValue('Previous cutoff')).trim(), '842');
});

await check('the plan starts empty', async () => {
  assert.match(await page.locator('.empty').innerText(), /No events yet/);
});

// --- Add a completed Regional win -----------------------------------------
await page.getByRole('button', { name: '+ Regional Championship' }).click();
const row = page.locator('.plan-row').first();
await row.getByLabel('Status').selectOption('completed');
await row.getByLabel('Event name').fill('Atlanta Regional');
await row.getByLabel('Final placement').fill('1');

await check('a Regional win scores 350 CP', async () => {
  await page.waitForFunction(() =>
    document.querySelector('.stat .v')?.textContent?.trim() === '350');
  assert.equal((await statValue('Current CP')).trim(), '350');
});

await check('a Regional win is reported as a direct invitation', async () => {
  await page.locator('.callout.ok', { hasText: 'Direct invitation earned' }).waitFor({ timeout: 4000 });
  assert.match(await row.innerText(), /Direct invitation earned/);
});

await check('the row explains the band and the points', async () => {
  assert.match(await row.locator('.plan-explain').innerText(), /1st place → 1 band, worth 350 CP/);
});

// --- Add a planned Regional and check displacement -------------------------
await page.getByRole('button', { name: '+ Regional Championship' }).click();
const planned = page.locator('.plan-row').nth(1);
await planned.getByLabel('Event name').fill('Orlando Regional');
await planned.getByLabel('Final placement').fill('9');

await check('a planned result moves projected CP but not current CP', async () => {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.stat')].some((s) =>
      s.querySelector('.k')?.textContent === 'Projected CP' && s.querySelector('.v')?.textContent.trim() === '550'));
  assert.equal((await statValue('Current CP')).trim(), '350');
  assert.equal((await statValue('Projected CP')).trim(), '550');
});

await check('a planned major from the baseline is labelled conditional', async () => {
  assert.match(await planned.innerText(), /Conditional on kicker/);
});

// --- Best Finish Limit --------------------------------------------------
await check('the shared major bucket reports its occupancy', async () => {
  const bfl = page.locator('table', { has: page.getByText('Regional / Special / International') });
  assert.match(await bfl.innerText(), /2 of 5/);
});

// --- Validation ------------------------------------------------------------
await row.getByLabel('CP awarded').fill('999');
await check('an impossible placement and CP combination is rejected', async () => {
  await row.locator('[role="alert"]').waitFor({ timeout: 4000 });
  assert.match(await row.locator('[role="alert"]').innerText(), /not a possible award/);
});
await row.getByLabel('CP awarded').fill('');

// --- Generated paths -------------------------------------------------------
await check('three generated paths are offered', async () => {
  assert.equal(await page.locator('.path-card').count(), 3);
  assert.match(await page.locator('.path-card').first().innerText(), /Least demanding placements/);
});

await check('generated paths never demand a direct-invite finish', async () => {
  const text = await page.locator('.paths').innerText();
  for (const m of text.matchAll(/finish (\d+)/g)) assert.ok(Number(m[1]) > 1, `demanded finish ${m[1]}`);
});

// --- Persistence -----------------------------------------------------------
await page.reload({ waitUntil: 'networkidle' });
await check('the plan survives a reload', async () => {
  assert.equal(await page.locator('.plan-row').count(), 2);
  assert.equal((await statValue('Current CP')).trim(), '350');
});

// --- Game separation -------------------------------------------------------
await page.getByLabel('Game').selectOption('TCG');
await check('switching game re-reads the cutoff for that game', async () => {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.stat')].some((s) =>
      s.querySelector('.k')?.textContent === 'Previous cutoff' && s.querySelector('.v')?.textContent.trim() === '738'));
  assert.equal((await statValue('Previous cutoff')).trim(), '738');
});
await page.getByLabel('Game').selectOption('VGC');

// --- Themes and responsiveness --------------------------------------------
await check('the dark theme applies', async () => {
  await page.getByRole('button', { name: /theme/i }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(13, 13, 13)');
});

await check('the page does not scroll horizontally at 320px', async () => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `overflows by ${overflow}px`);
});
await page.setViewportSize({ width: 1280, height: 900 });

await check('every form control has an accessible name', async () => {
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea, button')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => !(
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
        el.closest('label') ||
        (el.tagName === 'BUTTON' && el.textContent.trim())
      )).map((el) => el.tagName + (el.id ? `#${el.id}` : '') + `[${el.type ?? ''}]`));
  assert.deepEqual(unnamed, []);
});

await check('the browser reported no errors', async () => {
  assert.deepEqual(consoleErrors, []);
});

await page.screenshot({ path: 'docs/screenshot-dark.png', fullPage: true });
await page.getByRole('button', { name: /theme/i }).click();
await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
await page.screenshot({ path: 'docs/screenshot-light.png', fullPage: true });

await browser.close();
console.log(checks.join('\n'));
console.log(process.exitCode ? '\nsmoke test FAILED' : `\nsmoke test passed (${checks.length} checks)`);
