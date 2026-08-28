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
  page.locator('.totals .t', { has: page.locator('i', { hasText: new RegExp(`^${label}$`, 'i') }) })
    .locator('b').innerText();

await check('the app renders with its title and network link', async () => {
  assert.match(await page.locator('h1').first().innerText(), /Championship Points Calculator 2027/);
  const link = page.locator('.wordmark a.season');
  assert.match(await link.innerText(), /Part of the GPE Network/);
  assert.equal(await link.getAttribute('href'), 'https://georgiaplayevents.com/#etc');
});

await check('the totals live in the sticky header', async () => {
  const box = await page.locator('.masthead').boundingBox();
  assert.ok(box.height < 110, `header should stay one row, was ${box.height}px`);
  assert.equal(await page.locator('.masthead .totals').count(), 1);
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

await check('expand all and collapse all work', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: 'Expand all' }).click();
  await page.waitForTimeout(250);
  assert.equal(await cat.locator('.zone-list').count(), 4);
  await cat.getByRole('button', { name: 'Collapse all' }).click();
  await page.waitForTimeout(250);
  assert.equal(await cat.locator('.zone-list').count(), 0);
});

await check('adding a local is offered beside the catalog, not in the plan', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  assert.equal(await cat.getByRole('button', { name: '+ League Cup' }).count(), 1);
  const plan = page.locator('section', { has: page.getByRole('heading', { name: 'Your plan' }) });
  assert.equal(await plan.getByRole('button', { name: '+ League Cup' }).count(), 0);
});

await check('bulk-add takes a whole zone', async () => {
  const zone = page.locator('.zone', { hasText: 'US and Canada' });
  // The count the catalog itself advertises, rather than a magic number that
  // goes stale as the season's schedule is published.
  const advertised = Number((await zone.locator('.zone-count').innerText()).match(/of (\d+)/)[1]);
  assert.ok(advertised > 0, 'zone advertises no events');
  await zone.getByRole('button', { name: 'Add all' }).click();
  await page.waitForFunction((n) => document.querySelectorAll('.plan-row').length === n, advertised);
  assert.equal(await page.locator('.plan-row').count(), advertised);
});

await check('unchecking one event removes it again', async () => {
  const before = await page.locator('.plan-row').count();
  const zone = page.locator('.zone', { hasText: 'US and Canada' });
  if (!(await zone.locator('.zone-list').count())) {
    await zone.locator('.zone-toggle').click();
    await page.waitForTimeout(250);
  }
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
  // NA majors project from 705 players, so the 257-512 band cannot pay.
  assert.doesNotMatch(text, /Top 512|Top 1024/);
});

await check('the ladder reports how many events can actually count', async () => {
  const ladder = page.locator('section', { has: page.getByRole('heading', { name: 'What you need' }) });
  const t = await ladder.innerText();
  // Eight added majors share a Best Finish Limit of five.
  assert.match(t, /\d of \d/, 'no counting column');
  assert.match(t, /Top \d+|1st place|2nd place/, 'finish should read Top X');
  assert.match(t, /Projected total/i);
});

await check('the standalone Best Finish Limit table is gone', async () => {
  const body = await page.locator('main').innerText();
  assert.doesNotMatch(body, /Best Finish Limits\n/);
});

// --- one number per event ------------------------------------------------
await check('typing a CP records a result, with no status to toggle', async () => {
  const row = page.locator('.plan-row').first();
  await row.getByLabel('CP').fill('350');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.totals .t')].some((s) =>
      s.querySelector('i')?.textContent === 'CP now' && s.querySelector('b')?.textContent.trim() === '350'));
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

// --- overdue events, and not losing typed work ---------------------------
await check('a past event with no result is marked overdue and left out of the ladder', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: '+ League Cup' }).click();
  await page.waitForTimeout(400);
  const row = page.locator('.plan-row', { hasText: 'League Cup' });
  await row.getByLabel('Date').fill('2026-01-10');
  await page.waitForTimeout(700);
  assert.match(await row.getAttribute('class'), /overdue/);
  assert.match(await row.innerText(), /This event has passed/);
  const ladder = await page.locator('section', { has: page.getByRole('heading', { name: 'What you need' }) }).innerText();
  assert.doesNotMatch(ladder, /League Cup/, 'a finished event must not be solved for');
});

await check('entering its result clears the overdue state', async () => {
  const row = page.locator('.plan-row', { hasText: 'League Cup' });
  await row.getByLabel('CP').fill('50');
  await page.waitForTimeout(700);
  assert.doesNotMatch(await row.getAttribute('class'), /overdue/);
});

await check('removing a logged result asks before discarding it', async () => {
  let asked = false;
  const onDialog = (d) => { asked = true; d.dismiss(); };
  page.on('dialog', onDialog);
  await page.locator('.plan-row', { hasText: 'League Cup' })
    .getByRole('button', { name: /Remove/ }).click();
  await page.waitForTimeout(500);
  page.off('dialog', onDialog);
  assert.ok(asked, 'no confirmation before discarding typed work');
});

// --- BFL, persistence, chrome -------------------------------------------
await check('a result shows its Best Finish Limit slot', async () => {
  const logged = page.locator('.plan-row', { hasText: 'Baltimore' });
  assert.match(await logged.innerText(), /BFL \d\/5/);
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
                      'Projected attendance', 'Add what you can get to']) {
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
