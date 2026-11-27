// spec/web.md, "A world": a world, as a user sees and turns it, over recorded GitHub answers.
import { expect, test } from '@playwright/test';
import { chosen, place, recorded, rested, scan, skillButtons, sky, where } from './github.ts';
import { ink, withoutWebGL } from './in-page.js';
import { MANY_LONG_NAME } from './recording.ts';

let errors: string[];

test.beforeEach(async ({ page }) => {
  ({ errors } = await recorded(page));
});

test.afterEach(() => expect(errors, 'errors in the page').toEqual([]));

test('a world is engraved: its sea in the pen, its lands washed with the marker; its lines boil', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.locator('html')).toHaveAttribute('data-sky', 'drawn');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
  await expect(sky(page)).toHaveAttribute('data-motion', 'boiling');
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(20000); // the sea: lines of ink
  await expect.poll(async () => (await page.evaluate(ink)).washed).toBeGreaterThan(3000); // three lands

  const { weight } = await page.evaluate(ink);
  await expect.poll(async () => (await page.evaluate(ink)).weight).not.toBe(weight);
  // Its lines boil through three frames, as drawably's do.
  const frames = new Set<string | null>();
  await expect
    .poll(
      async () => {
        frames.add(await sky(page).getAttribute('data-frame'));
        return [...frames].sort().join(' ');
      },
      { intervals: [90] },
    )
    .toBe('0 1 2');
});

test('every skill is a place, named, on the land of its directory', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.locator('[data-place]')).toHaveText(['code-style', 'commits', 'release']);
  await expect(page.locator('[data-land]')).toHaveText(['.claude/skills', 'docs', 'tools']);
  await expect(place(page, 'code-style')).toHaveAttribute('data-chosen', '');
  await expect(place(page, 'commits')).not.toHaveAttribute('data-chosen', '');
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(60); // the chosen place, circled in red
});

test('the chosen place turns to the front, with its name beside it', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(sky(page)).toHaveAttribute('data-rest', ''); // the eye is at the world, and the world in its place on the page
  const slot = (await page.locator('.globe').boundingBox())!;
  const middle = { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 };

  for (const name of ['code-style', 'release']) {
    if (name !== 'code-style') await skillButtons(page).filter({ hasText: name }).click();
    await expect(place(page, name)).toHaveAttribute('data-chosen', '');
    await expect(sky(page)).toHaveAttribute('data-rest', '');
    const at = await where(page, place(page, name));
    expect(Math.hypot(at.x - middle.x, at.y - middle.y), `${name}, from the middle of the world`).toBeLessThan(Math.min(slot.width, slot.height) * 0.18);

    // Its name is shown, level with the place and next to it, not over it.
    await expect(place(page, name)).toHaveCSS('opacity', '1');
    const text = (await place(page, name).locator('i').boundingBox())!;
    const beside = Math.max(text.x - at.x, at.x - (text.x + text.width));
    expect(beside).toBeGreaterThan(4);
    expect(beside).toBeLessThan(40);
    expect(Math.abs(text.y + text.height / 2 - at.y)).toBeLessThan(6);
  }
});

test('a name with no room beside its place is written above it, clear of the index and the sheet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/many');
  await skillButtons(page).last().click();
  const long = place(page, MANY_LONG_NAME);
  await expect(long).toHaveAttribute('data-chosen', '');
  const at = await where(page, long);

  await expect(long).toHaveAttribute('data-side', 'above');
  await expect(long).toHaveCSS('opacity', '1');
  const index = (await page.getByRole('navigation', { name: 'Skills' }).boundingBox())!;
  const sheet = (await chosen(page).boundingBox())!;
  const text = (await long.locator('i').boundingBox())!;
  expect(text.y + text.height).toBeLessThan(at.y);
  expect(text.x).toBeGreaterThanOrEqual(index.x + index.width);
  expect(text.x + text.width).toBeLessThanOrEqual(sheet.x);
});

test('clicking a place chooses its skill', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the world turns at once, so its places stand still
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(chosen(page)).toHaveAccessibleName('code-style: SKILL.md');

  const commits = await where(page, place(page, 'commits'));
  await page.mouse.click(commits.x, commits.y);
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');
  await expect(skillButtons(page).nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(place(page, 'commits')).toHaveAttribute('data-chosen', '');

  // Beside the places, a click chooses nothing.
  const slot = (await page.locator('.globe').boundingBox())!;
  await page.mouse.click(slot.x + 6, slot.y + 6);
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');
});

test('pointing at a skill marks its place, and pointing at a place marks its skill', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');

  await where(page, place(page, 'release')); // the result is on the page, its places where they are
  const calm = await rested(page);
  await skillButtons(page).filter({ hasText: 'release' }).hover();
  await expect(page.locator('[data-place][data-pointed]')).toHaveText('release');
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(calm.inked + 60); // a ring of ink round it

  const commits = await where(page, place(page, 'commits'));
  await page.mouse.move(commits.x, commits.y);
  await expect(page.locator('[data-place][data-pointed]')).toHaveText('commits');
  await expect(skillButtons(page).nth(1)).toHaveAttribute('data-pointed', '');
  await expect(skillButtons(page).nth(2)).not.toHaveAttribute('data-pointed', '');

  // Clicked, the place keeps the red ring alone: the pointer's ring is gone from it.
  const ringed = await rested(page);
  await page.mouse.click(commits.x, commits.y);
  await expect(place(page, 'commits')).toHaveAttribute('data-chosen', '');
  const after = await rested(page);
  expect(after.accented).toBeGreaterThan(60);
  expect(after.inked).toBeLessThan(ringed.inked);
});

test('dragging turns the world', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  const before = await where(page, place(page, 'code-style'));
  await expect(page.locator('.aim')).toHaveText(/^λ \d{3}° \d{2}′ [EW] {2}φ \d{2}° \d{2}′ [NS]$/); // where on the world the eye looks
  const aim = await page.locator('.aim').textContent();

  const slot = (await page.locator('.globe').boundingBox())!;
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height - 40);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2 + 90, slot.y + slot.height - 40, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => (await where(page, place(page, 'code-style'))).x).toBeGreaterThan(before.x + 30);
  await expect(page.locator('.aim')).not.toHaveText(aim!);
  await expect(chosen(page)).toHaveAccessibleName('code-style: SKILL.md'); // a drag is not a click
});

test('the arrow keys choose the next and the previous skill', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await skillButtons(page).first().focus();

  await page.keyboard.press('ArrowDown');
  await expect(skillButtons(page).nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(skillButtons(page).nth(1)).toBeFocused();
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // the last one: there is no next
  await expect(chosen(page)).toHaveAccessibleName('release: SKILL.md');

  await page.keyboard.press('ArrowUp');
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');
});

test('day, pen on paper, or night, chalk on cyanotype: the system’s at first, then the switch’s; nothing is stored', async ({ page }) => {
  await page.goto('./');
  const night = page.getByRole('switch', { name: 'Night sky' });
  const pen = async () => (await page.evaluate(ink)).tone;
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await expect(night).not.toBeChecked();
  await expect.poll(pen).toBeGreaterThan(20);
  expect(await pen()).toBeLessThan(120); // dark ink

  await night.check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect.poll(pen).toBeGreaterThan(200); // chalk
  await night.uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await expect.poll(pen).toBeLessThan(120);

  await night.check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(night).toBeChecked();
});

test('prefers-reduced-motion: the sky is drawn, and still; the eye is at once where it goes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(sky(page)).toHaveAttribute('data-motion', 'still');
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(3000);

  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(place(page, 'code-style')).toHaveAttribute('data-chosen', '');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
  const first = await where(page, place(page, 'code-style'));
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(60);
  const { weight } = await rested(page);
  await page.waitForTimeout(900); // two boils long
  expect(await where(page, place(page, 'code-style'))).toEqual(first);
  expect((await page.evaluate(ink)).weight).toBe(weight);
  await expect(sky(page)).toHaveAttribute('data-frame', '0');
});

test('no WebGL → the page works without the sky', async ({ page }) => {
  await page.addInitScript(withoutWebGL);
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-sky', 'none');
  await expect(sky(page)).toBeHidden();
  await expect(page.locator('.globe .still')).toBeVisible(); // a still world, in drawably's strokes

  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
  await skillButtons(page).filter({ hasText: 'commits' }).click();
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');
  await expect(chosen(page)).toHaveCSS('opacity', '1');

  // And back to the system, and to the world again from its register.
  await page.getByRole('button', { name: /^the system/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('The system 1 world');
  await page.getByRole('navigation', { name: 'Worlds' }).getByRole('button').click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
});

test('the same commit, the same world: a scan shared by its address draws the places where they were', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  const places = async () => [await where(page, place(page, 'code-style')), await where(page, place(page, 'commits')), await where(page, place(page, 'release'))];
  await expect(place(page, 'code-style')).toHaveAttribute('data-chosen', '');
  const first = await places();
  expect(new URL(page.url()).searchParams.get('repo')).toBe('https://github.com/JetBrains/atlas-demo');

  await page.reload();
  await expect(place(page, 'code-style')).toHaveAttribute('data-chosen', '');
  await expect.poll(places).toEqual(first);
});
