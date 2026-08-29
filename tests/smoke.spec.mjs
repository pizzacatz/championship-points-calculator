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

await check('the goal defaults to the previous-season cutoff', async () => {
  assert.equal(await page.getByLabel('CP Goal:').inputValue(), '842');
});

await check('the goal buttons name their seasons', async () => {
  const line = page.locator('.goal-line');
  assert.equal(await line.getByRole('button', { name: '2026' }).isEnabled(), true);
  assert.equal(await line.getByRole('button', { name: '2027' }).isDisabled(), true);
});

await check('every catalog date is ISO and the column lines up', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: 'Expand all' }).click();
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const ds = [...document.querySelectorAll('.zone-date')];
    const text = ds.map((d) => d.textContent.trim());
    return {
      nonIso: text.filter((t) => !/^\d{4}-\d{2}-\d{2}$/.test(t)),
      // A month-only event reads 2026-09-00: same ten characters, day unannounced.
      monthOnly: text.filter((t) => t.endsWith('-00')).length,
      lefts: [...new Set(ds.map((d) => Math.round(d.getBoundingClientRect().left)))].length,
      rights: [...new Set(ds.map((d) => Math.round(d.getBoundingClientRect().right)))].length,
      tabular: getComputedStyle(ds[0]).fontVariantNumeric,
    };
  });
  assert.deepEqual(r.nonIso, [], 'non-ISO dates present');
  assert.ok(r.monthOnly >= 6, 'Global Challenges should read YYYY-MM-00');
  assert.equal(r.lefts, 1, `dates start at ${r.lefts} different x positions`);
  assert.equal(r.rights, 1, `dates end at ${r.rights} different x positions`);
  assert.match(r.tabular, /tabular-nums/, 'dates need fixed-width figures to align');
  await cat.getByRole('button', { name: 'Collapse all' }).click();
});

await check('four figures, and TO GO measured against banked CP', async () => {
  const t = (await page.locator('.totals').innerText()).replace(/\n/g, ' ');
  for (const label of ['CP now', 'To go', 'Goal', 'Available']) {
    assert.match(t, new RegExp(label, 'i'), `missing ${label}`);
  }
  // Nothing banked, so TO GO is the whole goal — not "reached" off a projection.
  assert.equal((await stat('To go')).trim(), '842');
});

await check('the zone counts all line up on the word "of"', async () => {
  const xs = await page.evaluate(() => {
    const out = [];
    for (const z of document.querySelectorAll('.zone')) {
      const c = z.querySelector('.zone-count'); if (!c) continue;
      const of = [...c.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes('of'));
      const r = document.createRange(); r.selectNode(of);
      out.push(Math.round(r.getBoundingClientRect().left));
    }
    return [...new Set(out)];
  });
  assert.equal(xs.length, 1, `counts at ${xs.length} different positions: ${xs}`);
});

// --- catalog -------------------------------------------------------------
await check('the catalog lists zones collapsed, with counts', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  assert.match(await cat.innerText(), /US and Canada/);
  assert.match(await cat.innerText(), /0 of \d+/);
});

await check('expand all and collapse all work', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  // Derived, not hard-coded: the number of groups grows as sections are added.
  const groups = await cat.locator('.zone').count();
  assert.ok(groups >= 4, `expected several groups, saw ${groups}`);
  await cat.getByRole('button', { name: 'Expand all' }).click();
  await page.waitForTimeout(300);
  assert.equal(await cat.locator('.zone-list').count(), groups);
  await cat.getByRole('button', { name: 'Collapse all' }).click();
  await page.waitForTimeout(300);
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

// --- placement and turnout ------------------------------------------------
await check('typing a placement records a result, with no status to toggle', async () => {
  const row = page.locator('.plan-row').first();
  await row.getByLabel('Placement').fill('1');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.totals .t')].some((s) =>
      s.querySelector('i')?.textContent === 'CP now' && s.querySelector('b')?.textContent.trim() === '350'));
  assert.equal((await stat('CP now')).trim(), '350');
});

await check('winning a Regional is recognised as a direct invitation', async () => {
  assert.match(await page.locator('.plan-row').first().innerText(), /Direct invite/);
});

await check('a placement is priced against the zone median until it is changed', async () => {
  const row = page.locator('.plan-row').nth(1);
  await row.getByLabel('Placement').fill('9');
  await page.waitForFunction(() =>
    document.querySelectorAll('.plan-row')[1]?.textContent?.includes('200 CP'));
  assert.match(await row.innerText(), /200 CP/);
  // The assumption has to be visible, not implied: 705 is the VGC NA median.
  assert.equal(await row.getByLabel('Players').inputValue(), '705');
});

await check('the assumed turnout reads as an assumption until it is touched', async () => {
  const row = page.locator('.plan-row').nth(1);
  const assumed = await row.getByLabel('Players').getAttribute('class');
  assert.match(assumed ?? '', /assumed/, 'an untouched default is not marked');
  await row.getByLabel('Players').fill('700');
  await page.waitForTimeout(500);
  assert.doesNotMatch(await row.getByLabel('Players').getAttribute('class') ?? '', /assumed/);
  // Clearing it goes back to the default rather than leaving the row unscoreable.
  // Emptying it leaves it empty. It is a required field, not one that argues.
  await row.getByLabel('Players').fill('');
  await page.waitForTimeout(500);
  assert.equal(await row.getByLabel('Players').inputValue(), '');
  await row.getByLabel('Players').fill('705');
  await row.getByLabel('Players').blur();
});

await check('the turnout can be emptied one digit at a time', async () => {
  const row = page.locator('.plan-row').nth(1);
  const players = row.getByLabel('Players');
  await players.click();
  await page.keyboard.press('End');
  // The whole complaint: the field used to refill itself with the default the
  // instant it went empty, so the last digit could not be deleted.
  for (const expected of ['70', '7', '']) {
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(250);
    assert.equal(await players.inputValue(), expected,
      `backspacing gave "${await players.inputValue()}", not "${expected}"`);
  }
  assert.equal(await row.locator('[role="alert"]').count(), 0,
    'the row complained while the field still had focus');
});

await check('an empty turnout is the only thing the row complains about', async () => {
  const row = page.locator('.plan-row').nth(1);
  const players = row.getByLabel('Players');
  await players.blur();
  await row.locator('[role="alert"]').waitFor({ timeout: 4000 });
  assert.match(await row.locator('[role="alert"]').innerText(), /how many players/i);
  // A turnout that cannot hold the placement is a contradiction, but it scores 0
  // for the right reason on its own, so it is not worth an error.
  await players.fill('5');
  await players.blur();
  await page.waitForTimeout(600);
  assert.equal(await row.locator('[role="alert"]').count(), 0,
    'a field smaller than the placement raised an error');
  assert.match(await row.innerText(), /0 CP/);
  await players.fill('705');
  await players.blur();
  await page.waitForTimeout(600);
  assert.match(await row.innerText(), /200 CP/);
});

await check('there is no way to type a CP value', async () => {
  const labels = await page.locator('.plan-row').first().locator('.plan-inputs label')
    .allInnerTexts();
  assert.deepEqual(labels, ['Placement', 'Players'], `row inputs are ${labels.join(', ')}`);
});

await check('an unplayed row asks for the placement only', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: '+ League Challenge' }).click();
  await page.waitForTimeout(400);
  const row = page.locator('.plan-row', { hasText: 'League Challenge' }).last();
  const labels = await row.locator('.plan-inputs label').allInnerTexts();
  assert.deepEqual(labels, ['Placement'], 'turnout is asked for before there is a finish');
  await row.getByRole('button', { name: /Remove/ }).click();
  await page.waitForTimeout(400);
});

await check('the CP field is four characters wide, with no spinner', async () => {
  const r = await page.evaluate(() => {
    const i = document.querySelector('.plan-inputs input');
    i.value = '1024'; i.dispatchEvent(new Event('input', { bubbles: true }));
    return { w: Math.round(i.getBoundingClientRect().width),
             spinner: getComputedStyle(i).appearance,
             fits: i.scrollWidth <= i.clientWidth + 1 };
  });
  assert.ok(r.w < 56, `field is ${r.w}px — wider than four characters need`);
  assert.equal(r.spinner, 'textfield', 'number spinners still eating width');
  assert.ok(r.fits, 'four digits do not fit');
});

// --- Global and Grand Challenges -----------------------------------------
await check('VGC gets a Global & Grand Challenge section, by month', async () => {
  const gc = page.locator('.zone', { hasText: 'Global & Grand Challenges' });
  assert.equal(await gc.count(), 1);
  if (!(await gc.locator('.zone-list').count())) {
    await gc.locator('.zone-toggle').click();
    await page.waitForTimeout(300);
  }
  const t = await gc.innerText();
  // Published by month, so the day reads 00 — same ten characters as every other date.
  for (const m of ['2026-09-00', '2026-10-00', '2026-12-00',
                   '2027-01-00', '2027-03-00', '2027-04-00']) {
    assert.match(t, new RegExp(m), `missing ${m}`);
  }
});

await check('they are absent from a TCG plan', async () => {
  await page.getByLabel('Game').selectOption('TCG');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.zone', { hasText: 'Global & Grand Challenges' }).count(), 0);
  await page.getByLabel('Game').selectOption('VGC');
  await page.waitForTimeout(600);
});

// --- overdue events, and not losing typed work ---------------------------
await check('a past event with no result is marked overdue and left out of the ladder', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: '+ League Cup' }).click();
  await page.waitForTimeout(400);
  const row = page.locator('.plan-row', { hasText: 'League Cup' });
  await row.getByLabel(/^Date for/).fill('2026-01-10');
  await page.waitForTimeout(700);
  assert.match(await row.getAttribute('class'), /overdue/);
  assert.match(await row.innerText(), /This event has passed/);
  const ladder = await page.locator('section', { has: page.getByRole('heading', { name: 'What you need' }) }).innerText();
  assert.doesNotMatch(ladder, /League Cup/, 'a finished event must not be solved for');
});

await check('entering its result clears the overdue state', async () => {
  const row = page.locator('.plan-row', { hasText: 'League Cup' });
  await row.getByLabel('Placement').fill('1');
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

await check('a local placement scores from the assumed turnout', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: '+ League Cup' }).click();
  await page.waitForTimeout(400);
  // An earlier check leaves a dated Cup behind; the new one is undated, so it
  // sorts last.
  const row = page.locator('.plan-row', { hasText: 'League Cup' }).last();
  await row.getByLabel('Placement').fill('6');        // 5th-8th, kicker 17
  await page.waitForTimeout(700);
  assert.match(await row.innerText(), /25 CP/);
  assert.equal(await row.getByLabel('Players').inputValue(), '32');
  assert.doesNotMatch(await row.innerText(), /Needs the CP/);
});

await check('the band name is not restated on the row', async () => {
  const row = page.locator('.plan-row', { hasText: 'League Cup' }).last();
  assert.doesNotMatch(await row.innerText(), /band/i);
  let asked = false;
  const d = (x) => { asked = true; x.accept(); };
  page.on('dialog', d);
  await row.getByRole('button', { name: /Remove/ }).click();
  await page.waitForTimeout(500);
  page.off('dialog', d);
});

await check('the official sources are back, collapsed', async () => {
  const det = page.locator('details.sources');
  assert.equal(await det.count(), 1);
  assert.equal(await det.evaluate((e) => e.open), false, 'must start closed');
  await det.locator('summary').click();
  await page.waitForTimeout(200);
  assert.match(await det.innerText(), /championships\.pokemon\.com|about\//);
  await det.locator('summary').click();
});

await check('the plan can be filtered by event type, without changing a total', async () => {
  const before = await stat('CP now');
  const filter = page.locator('.plan-filter');
  assert.ok(await filter.count() > 0, 'no filter shown for a mixed plan');
  const rows = await page.locator('.plan-row').count();
  await filter.getByRole('button', { name: /^Cup/ }).click();
  await page.waitForTimeout(500);
  assert.ok(await page.locator('.plan-row').count() < rows, 'filter hid nothing');
  assert.equal(await stat('CP now'), before, 'filtering changed a total');
  assert.match(await page.locator('.filter-note').innerText(), /changes nothing that is counted/);
  await filter.getByRole('button', { name: /^All/ }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.plan-row').count(), rows);
});

await check('a long event name breaks at "Championships" on a narrow screen', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const lines = await page.evaluate(() => {
    // Pick a row that actually has "Championships" in its name.
    const t = [...document.querySelectorAll('.plan-title')]
      .find((el) => /Championship/.test(el.textContent));
    // Every space before "Championships" is bound, so it is the only break.
    if (!t) return { missing: true };
    return { text: t.textContent, nbsp: (t.textContent.match(/\u00a0/g) || []).length,
             overflow: t.scrollWidth - t.clientWidth };
  });
  assert.ok(!lines.missing, 'no Championships row in the plan to check');
  assert.ok(lines.nbsp > 0, 'no bound spaces — the title can break anywhere');
  assert.ok(lines.overflow <= 1, `title overflows its column by ${lines.overflow}px`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
});

await check('a local date is set from a calendar button, and can be changed', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: '+ League Cup' }).click();
  await page.waitForTimeout(400);
  const row = page.locator('.plan-row', { hasText: 'League Cup' }).last();
  const btn = row.locator('.date-btn');
  assert.equal(await btn.locator('svg').count(), 1, 'no calendar icon before a date is set');
  assert.match(await btn.getAttribute('aria-label'), /^Set a date for/);
  await row.getByLabel(/^Date for/).fill('2026-11-15');
  await page.waitForTimeout(500);
  // Once set, the button shows the date in the same ISO form as every other.
  assert.equal((await btn.innerText()).trim(), '2026-11-15');
  assert.match(await btn.getAttribute('aria-label'), /^Change the date for/);
  let asked = false;
  const d = (x) => { asked = true; x.accept(); };
  page.on('dialog', d);
  await row.getByRole('button', { name: /Remove/ }).click();
  await page.waitForTimeout(400);
  page.off('dialog', d);
});

await check('Global Challenges are named without their dates, and tick individually', async () => {
  const gc = page.locator('.zone', { hasText: 'Global & Grand' });
  if (!(await gc.locator('.zone-list').count())) {
    await gc.locator('.zone-toggle').click();
    await page.waitForTimeout(300);
  }
  const names = await gc.locator('.ev-name').allInnerTexts();
  assert.ok(names.every((n) => n.trim() === 'Global Challenge'),
    `names still carry dates: ${names.slice(0, 2)}`);
  const before = await page.locator('.plan-row').count();
  await gc.locator('.zone-list input[type=checkbox]').first().check();
  await page.waitForTimeout(500);
  // Six identically named events must not tick together.
  assert.match(await gc.locator('.zone-count').innerText(), /1\s*of\s*6/);
  assert.equal(await page.locator('.plan-row').count(), before + 1);
  await gc.locator('.zone-list input[type=checkbox]').first().uncheck();
  await page.waitForTimeout(400);
});

await check('a plan saved before the rename is migrated on load', async () => {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cpc.paths.v1') || '[]');
    raw[0].events.push({
      id: 'legacy', name: 'Global Challenge \u2014 September 2026',
      eventTypeId: 'vgc-global-challenge', date: '2026-09-30',
      displayDate: 'Sept. 18\u201320',            // an old official range
      placement: null, awardedPoints: null, attendance: null, catalogName: 'legacy',
    });
    // A pre-v2.8 result, recorded as CP with no placement and no turnout.
    raw[0].events.push({
      id: 'legacy-cp', name: 'Legacy Cup', eventTypeId: 'league-cup',
      date: '2026-10-04', placement: null, awardedPoints: 20, attendance: null,
    });
    localStorage.setItem('cpc.paths.v1', JSON.stringify(raw));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const row = page.locator('.plan-row', { hasText: 'Global Challenge' }).last();
  const text = await row.innerText();
  assert.doesNotMatch(text, /September 2026/, 'the month is still in the name');
  assert.doesNotMatch(text, /Sept\. 18/, 'the old range is still shown');
  const asked = [];
  page.on('dialog', (d) => { asked.push(1); d.accept(); });
  await row.getByRole('button', { name: /Remove/ }).click();
  await page.waitForTimeout(400);
});

await check('a local shows its date once, on the button', async () => {
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: '+ League Challenge' }).click();
  await page.waitForTimeout(400);
  const row = page.locator('.plan-row', { hasText: 'League Challenge' }).last();
  await row.getByLabel(/^Date for/).fill('2026-11-15');
  await page.waitForTimeout(600);
  const count = ((await row.innerText()).match(/2026-11-15/g) || []).length;
  assert.equal(count, 1, `date shown ${count} times`);
  // The date button must not stretch the remove control beside it.
  const w = await row.locator('.icon').evaluate((e) => Math.round(e.getBoundingClientRect().width));
  assert.ok(w < 40, `remove button is ${w}px wide`);
  const d = (x) => x.accept();
  page.on('dialog', d);
  await row.getByRole('button', { name: /Remove/ }).click();
  await page.waitForTimeout(400);
  page.off('dialog', d);
});

await check('on mobile the CP is pinned bottom right, with the BFL chip to its left', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  // Two and three digit values on Regional rows, so a shifting width would show.
  const regionals = page.locator('.plan-row', { hasText: 'Regional Championships' });
  await regionals.nth(0).getByLabel('Placement').fill('65');   // 80 CP
  await regionals.nth(1).getByLabel('Placement').fill('1');    // 350 CP
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const out = [];
    // Only clean, scored rows: an error or overdue note adds height below the
    // figure and would make "bottom of the row" mean something else.
    const clean = [...document.querySelectorAll('.plan-row')]
      .filter((r) => !r.querySelector('.row-error') && !r.classList.contains('overdue')
        && /Regional Championships/.test(r.textContent));
    for (const r of clean.slice(0, 2)) {
      const cpEl = r.querySelector('.plan-result strong');
      const bfl = r.querySelector('.plan-result .bfl');
      const x = r.querySelector('.icon');
      if (!cpEl || !x) continue;
      const rb = r.getBoundingClientRect(), cb = cpEl.getBoundingClientRect();
      out.push({
        left: Math.round(cb.left),
        bottomGap: Math.round(rb.bottom - cb.bottom),
        rightGap: Math.round(rb.right - cb.right),
        bflLeft: bfl ? bfl.getBoundingClientRect().right <= cb.left + 1 : null,
        xTop: Math.round(x.getBoundingClientRect().top - rb.top),
        xRight: Math.round(rb.right - x.getBoundingClientRect().right),
      });
    }
    return out;
  });
  assert.equal(m.length, 2, 'need two scored rows to compare');
  // A fixed box for the figure means the chip beside it does not move.
  assert.equal(new Set(m.map((x) => x.left)).size, 1,
    `CP starts at different x for 2 and 3 digits: ${m.map((x) => x.left)}`);
  for (const r of m) {
    assert.ok(r.bottomGap <= 14, `CP sits ${r.bottomGap}px above the row bottom`);
    assert.ok(r.rightGap <= 16, `CP sits ${r.rightGap}px from the right edge`);
    assert.ok(r.bflLeft !== false, 'the BFL chip is not to the left of the CP');
    assert.ok(r.xTop <= 14 && r.xRight <= 16, 'the remove control is not in the top right');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
});

await check('no em-dashes remain in the rendered page', async () => {
  const text = await page.locator('main').innerText();
  const found = text.match(/[^\n]{0,24}\u2014[^\n]{0,24}/g);
  assert.equal(found, null, `em-dash still shown: ${found && found[0]}`);
});

await check('the season line names events needing results', async () => {
  // An earlier check removes its overdue row, so make one.
  const cat = page.locator('section', { has: page.getByRole('heading', { name: 'Events' }) });
  await cat.getByRole('button', { name: '+ League Challenge' }).click();
  await page.waitForTimeout(400);
  const row = page.locator('.plan-row', { hasText: 'League Challenge' }).last();
  await row.getByLabel(/^Date for/).fill('2026-02-14');
  await page.waitForTimeout(700);
  assert.match(await page.locator('.season-line').innerText(), /needs? results/);
  await row.getByRole('button', { name: /Remove/ }).click();
  await page.waitForTimeout(400);
});

await check('the removed v1 sections are gone', async () => {
  const body = await page.locator('main').innerText();
  for (const gone of ['Method, sources and limits', 'Official sources',
                      'Direct invitations', 'Ways to reach your target',
                      'Projected attendance', 'Add what you can get to',
                      'Excluded by BFL', 'Needs the CP', 'Below kicker',
                      'On plan to reach', "Below last season"]) {
    assert.doesNotMatch(body, new RegExp(gone), `"${gone}" should be removed`);
  }
});

await check('a result saved as CP survives as a placement and a turnout', async () => {
  const row = page.locator('.plan-row', { hasText: 'Legacy Cup' });
  // 20 CP at a Cup is the 9th-16th band, whose kicker is 48. Both are recovered,
  // and the CP the plan was worth is unchanged.
  assert.equal(await row.getByLabel('Placement').inputValue(), '9');
  assert.equal(await row.getByLabel('Players').inputValue(), '48');
  assert.match(await row.innerText(), /20 CP/);
});

await check("a local's date sits beside its name, not out by the inputs", async () => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.plan-row')]
        .find((r) => r.querySelector('.field-date'));
      if (!row) return null;
      const title = row.querySelector('.plan-title');
      const chip = row.querySelector('.field-date');
      // The end of the name itself, not of its box: the title stretches to fill
      // the row, so its right edge says nothing about where the words stop.
      const range = document.createRange();
      range.selectNodeContents(title.firstChild);
      const text = range.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      return {
        insideTitle: title.contains(chip),
        gap: Math.round(c.left - text.right),
        sameLine: c.top < text.bottom && c.bottom > text.top,
      };
    });
    assert.ok(m, 'no local row with a date control');
    assert.ok(m.insideTitle, `at ${width}px the date control is not part of the title`);
    assert.ok(m.sameLine, `at ${width}px the date control is not on the name's line`);
    assert.ok(m.gap >= 0 && m.gap <= 14,
      `at ${width}px the date control sits ${m.gap}px from the end of the name`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
});

await check('a Global Challenge never asks for a turnout, or complains about one', async () => {
  const gc = page.locator('.zone', { hasText: 'Global & Grand' });
  if (!(await gc.locator('.zone-list').count())) {
    await gc.locator('.zone-toggle').click();
    await page.waitForTimeout(300);
  }
  await gc.locator('.zone-list input[type=checkbox]').first().check();
  await page.waitForTimeout(500);
  const row = page.locator('.plan-row', { hasText: 'Global Challenge' }).first();
  await row.getByLabel('Placement').fill('20');
  await row.getByLabel('Placement').blur();
  await page.waitForTimeout(700);
  // Pokémon Champions has 10M+ downloads, so its kickers are taken as met and
  // there is no field size to ask for. A row with no input to fill must not then
  // complain that it is empty.
  assert.equal(await row.getByLabel('Players').count(), 0, 'an online event asked for a turnout');
  assert.equal(await row.locator('[role="alert"]').count(), 0,
    `an online event raised: ${await row.locator('[role="alert"]').innerText().catch(() => '')}`);
  assert.match(await row.innerText(), /13 CP/);
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
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    // Anything inside a scroll container is allowed to be wider than the page.
    const inScroller = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
      }
      return false;
    };
    const guilty = [];
    for (const el of document.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.right > w + 0.5 && b.width > 0 && !inScroller(el)) {
        guilty.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`
          + ` right=${Math.round(b.right)} "${(el.textContent || '').trim().slice(0, 24)}"`);
      }
    }
    return { over: document.documentElement.scrollWidth - w, guilty: guilty.slice(0, 4) };
  });
  assert.ok(r.over <= 1, `overflows by ${r.over}px — ${r.guilty.join(' | ') || 'no element identified'}`);
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
