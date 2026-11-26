// spec/web.md, "The sky": the globe, as a user sees and turns it, over recorded GitHub answers.
import { expect, test, type Page } from '@playwright/test';
import { chosen, recorded, scan, skillButtons } from './github.ts';
import { ink, withoutWebGL } from './in-page.js';
import { MANY_LONG_NAME, RECORDING } from './recording.ts';

let errors: string[];

test.beforeEach(async ({ page }) => {
  ({ errors } = await recorded(page));
});

test.afterEach(() => expect(errors, 'errors in the page').toEqual([]));

const sky = (page: Page) => page.locator('canvas.sky');
const star = (page: Page, name: string) => page.locator('[data-star]').filter({ hasText: new RegExp(`^${name}$`) });

/**
 * The middle of a star, on the page, once the globe has come to rest: its name's element is a
 * point there, placed by the engine a frame or more after the page wrote it.
 */
async function where(page: Page, name: string): Promise<{ x: number; y: number }> {
  const point = star(page, name);
  await expect(point).toHaveAttribute('style', /translate3d/);
  let last = await point.boundingBox();
  await expect
    .poll(
      async () => {
        const next = await point.boundingBox();
        const rested = next !== null && last !== null && next.x === last.x && next.y === last.y;
        last = next;
        return rested;
      },
      { intervals: [150] },
    )
    .toBe(true);
  return { x: last!.x, y: last!.y };
}

/** The ink on a sky that has stopped changing: for a still sky, to compare what is drawn. */
async function rested(page: Page) {
  let last = await page.evaluate(ink);
  await expect
    .poll(
      async () => {
        const next = await page.evaluate(ink);
        const same = next.weight === last.weight;
        last = next;
        return same;
      },
      { intervals: [200] },
    )
    .toBe(true);
  return last;
}

test('the globe is drawn before anything is scanned, in the pen alone, and boils', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-sky', 'drawn');
  await expect(sky(page)).toHaveAttribute('data-motion', 'boiling');
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(3000);
  expect((await page.evaluate(ink)).accented).toBe(0);
  await expect(page.locator('[data-star]')).toHaveCount(0);

  const { weight } = await page.evaluate(ink);
  await expect.poll(async () => (await page.evaluate(ink)).weight).not.toBe(weight); // it drifts

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

test('every skill is a star, named, in the constellation of its directory', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.locator('[data-star]')).toHaveText(['code-style', 'commits', 'release']);
  await expect(page.locator('[data-constellation]')).toHaveText(['.claude/skills', 'docs', 'tools']);
  await expect(star(page, 'code-style')).toHaveAttribute('data-chosen', '');
  await expect(star(page, 'commits')).not.toHaveAttribute('data-chosen', '');
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(60); // the chosen star, circled in red
});

test('the chosen star turns to the front, with its name beside it', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await where(page, 'code-style'); // the result is on the page, and the globe in its place on it
  const slot = (await page.locator('.globe').boundingBox())!;
  const middle = { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 };

  for (const name of ['code-style', 'release']) {
    if (name !== 'code-style') await skillButtons(page).filter({ hasText: name }).click();
    await expect(star(page, name)).toHaveAttribute('data-chosen', '');
    const at = await where(page, name);
    expect(Math.hypot(at.x - middle.x, at.y - middle.y), `${name}, from the middle of the globe`).toBeLessThan(Math.min(slot.width, slot.height) * 0.18);

    // Its name is shown, level with the star and next to it, not over it.
    await expect(star(page, name)).toHaveCSS('opacity', '1');
    const text = (await star(page, name).locator('i').boundingBox())!;
    const beside = Math.max(text.x - at.x, at.x - (text.x + text.width));
    expect(beside).toBeGreaterThan(4);
    expect(beside).toBeLessThan(40);
    expect(Math.abs(text.y + text.height / 2 - at.y)).toBeLessThan(6);
  }
});

test('a name with no room beside its star is written above it, inside the globe’s place', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/many');
  await skillButtons(page).last().click();
  const long = star(page, MANY_LONG_NAME);
  await expect(long).toHaveAttribute('data-chosen', '');
  const at = await where(page, MANY_LONG_NAME);

  await expect(long).toHaveAttribute('data-side', 'above');
  await expect(long).toHaveCSS('opacity', '1');
  const slot = (await page.locator('.globe').boundingBox())!;
  const text = (await long.locator('i').boundingBox())!;
  expect(text.y + text.height).toBeLessThan(at.y);
  expect(text.x).toBeGreaterThanOrEqual(slot.x);
  expect(text.x + text.width).toBeLessThanOrEqual(slot.x + slot.width);
});

test('clicking a star chooses its skill', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the globe turns at once, so the stars stand still
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(chosen(page)).toHaveAccessibleName('code-style: SKILL.md');

  const commits = await where(page, 'commits');
  await page.mouse.click(commits.x, commits.y);
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');
  await expect(skillButtons(page).nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(star(page, 'commits')).toHaveAttribute('data-chosen', '');

  // Beside the stars, a click chooses nothing.
  const slot = (await page.locator('.globe').boundingBox())!;
  await page.mouse.click(slot.x + 6, slot.y + 6);
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');
});

test('pointing at a skill marks its star, and pointing at a star marks its skill', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');

  await where(page, 'release'); // the result is on the page, its stars in their places
  const calm = await rested(page);
  await skillButtons(page).filter({ hasText: 'release' }).hover();
  await expect(page.locator('[data-star][data-pointed]')).toHaveText('release');
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(calm.inked + 60); // a ring of ink round it

  const commits = await where(page, 'commits');
  await page.mouse.move(commits.x, commits.y);
  await expect(page.locator('[data-star][data-pointed]')).toHaveText('commits');
  await expect(skillButtons(page).nth(1)).toHaveAttribute('data-pointed', '');
  await expect(skillButtons(page).nth(2)).not.toHaveAttribute('data-pointed', '');

  // Clicked, the star keeps the red ring alone: the pointer's ring is gone from it.
  const ringed = await rested(page);
  await page.mouse.click(commits.x, commits.y);
  await expect(star(page, 'commits')).toHaveAttribute('data-chosen', '');
  const after = await rested(page);
  expect(after.accented).toBeGreaterThan(60);
  expect(after.inked).toBeLessThan(ringed.inked);
});

test('dragging turns the globe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  const before = await where(page, 'code-style');
  const aim = await page.locator('.aim').textContent();

  const slot = (await page.locator('.globe').boundingBox())!;
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height - 40);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2 + 90, slot.y + slot.height - 40, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => (await where(page, 'code-style')).x).toBeGreaterThan(before.x + 30);
  await expect(page.locator('.aim')).not.toHaveText(aim!);
  await expect(chosen(page)).toHaveAccessibleName('code-style: SKILL.md'); // a drag is not a click
});

test('while a scan runs, a meridian sweeps the globe', async ({ page }) => {
  // GitHub takes its time over this repository, for as long as the test holds the answer.
  let answer = () => {};
  const held = new Promise<void>((resolve) => (answer = resolve));
  await page.route('https://api.github.com/repos/JetBrains/atlas-demo', async (route) => {
    await held;
    await route.fulfill({ json: RECORDING['https://api.github.com/repos/JetBrains/atlas-demo'].body, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('./');
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(3000);
  expect((await page.evaluate(ink)).accented).toBe(0);

  await page.getByLabel('Repository link').fill('https://github.com/JetBrains/atlas-demo');
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(150);

  answer();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect(page.getByRole('button', { name: 'Scan' })).toBeEnabled();
});

test('what cannot be scanned is scribbled over', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/no-such-repository');
  await expect(page.getByRole('alert')).toHaveText(/Repository not found/);
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(1500);

  // The next scan that works wipes it: only the chosen star is left in red.
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeLessThan(900);
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

test('prefers-reduced-motion: the sky is drawn, and still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(sky(page)).toHaveAttribute('data-motion', 'still');
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(3000);

  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(star(page, 'code-style')).toHaveAttribute('data-chosen', '');
  const first = await where(page, 'code-style');
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(60);
  const { weight } = await rested(page);
  await page.waitForTimeout(900); // two boils long
  expect(await where(page, 'code-style')).toEqual(first);
  expect((await page.evaluate(ink)).weight).toBe(weight);
  await expect(sky(page)).toHaveAttribute('data-frame', '0');
});

test('no WebGL → the page works without the sky', async ({ page }) => {
  await page.addInitScript(withoutWebGL);
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-sky', 'none');
  await expect(sky(page)).toBeHidden();
  await expect(page.locator('.globe .still')).toBeVisible(); // a still globe, in drawably's strokes

  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
  await skillButtons(page).filter({ hasText: 'commits' }).click();
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');
});

test('the same commit, the same sky: a scan shared by its address draws the stars where they were', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  const stars = async () => [await where(page, 'code-style'), await where(page, 'commits'), await where(page, 'release')];
  await expect(star(page, 'code-style')).toHaveAttribute('data-chosen', '');
  const first = await stars();
  expect(new URL(page.url()).searchParams.get('repo')).toBe('https://github.com/JetBrains/atlas-demo');

  await page.reload();
  await expect(star(page, 'code-style')).toHaveAttribute('data-chosen', '');
  await expect.poll(stars).toEqual(first);
});
