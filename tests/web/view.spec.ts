// spec/web.md: the page, as a user sees it, over recorded GitHub answers.
import { expect, test, type Locator } from '@playwright/test';
import { chosen, recorded, scan, skillButtons, type Recorded } from './github.ts';
import { placesInView } from './in-page.js';
import { BROKEN_MD, COMMIT, COMMITS_MD, MANY_BIG_MD, MANY_ONE_LINE_MD, STYLE_MD } from './recording.ts';

const blob = `https://github.com/JetBrains/atlas-demo/blob/${COMMIT}`;
let requests: string[];
let answered: string[];
let errors: string[];
let slow: Recorded['slow'];

test.beforeEach(async ({ page }) => {
  ({ requests, answered, errors, slow } = await recorded(page));
});

test.afterEach(() => expect(errors, 'errors in the page').toEqual([]));

test('a field for the repository link, hand-drawn icons, nothing scanned yet', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Skill Atlas/);
  await expect(page.getByLabel('Repository link')).toHaveAttribute('placeholder', 'https://github.com/owner/repo');
  await expect(page.locator('main svg path').first()).toBeAttached(); // the sketchy icons, as SVG
  await expect(page.locator('.drawably-inputbox svg, .drawably-button svg').first()).toBeAttached(); // drawably's sketch
  await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('scan: the repository, its skills sorted by name, the first one chosen with its SKILL.md', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');

  const repository = page.getByRole('heading', { level: 2 });
  await expect(repository).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect(repository.getByRole('link')).toHaveAttribute('href', `https://github.com/JetBrains/atlas-demo/tree/${COMMIT}`);

  await expect(skillButtons(page)).toHaveText([
    'code-styleFollow the code style.docs/code-style/SKILL.md',
    'commitsWrite commit messages the way this repository does..claude/skills/commits/SKILL.md',
    'releasetools/release/SKILL.md',
  ]);
  await expect(skillButtons(page).first()).toHaveAttribute('aria-current', 'true');

  await expect(chosen(page).getByRole('heading', { level: 3 })).toHaveText('code-style');
  await expect(chosen(page).getByRole('link')).toHaveAttribute('href', `${blob}/docs/code-style/SKILL.md`);
  await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(STYLE_MD);
});

test('choosing a skill: the whole description, the pinned link, its copies and its SKILL.md', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'github.com/JetBrains/atlas-demo');
  await skillButtons(page).filter({ hasText: 'commits' }).click();

  await expect(skillButtons(page).nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(skillButtons(page).first()).not.toHaveAttribute('aria-current', 'true');
  const skill = chosen(page);
  await expect(skill).toHaveAccessibleName('commits: SKILL.md');
  await expect(skill).toContainText('Write commit messages the way this repository does. Use for every commit.');
  await expect(skill.getByRole('link')).toHaveAttribute('href', `${blob}/.claude/skills/commits/SKILL.md`);
  await expect(skill).toContainText('also in .github/skills/commits/SKILL.md');
  await expect(skill.getByLabel('SKILL.md')).toHaveText(COMMITS_MD);
  // Its size, and its text line by line, as scanned: the lines, joined, are the file.
  await expect(skill).toContainText(`7 lines · ${new TextEncoder().encode(COMMITS_MD).length} B`);
  await expect(skill.locator('pre .line')).toHaveCount(7);
  expect(await skill.locator('pre').evaluate((pre) => pre.textContent)).toBe(COMMITS_MD);
  await expect(skill.locator('pre .line.matter')).toHaveText(['---', 'name: commits', /^description: /, '---']);
});

test('warnings: under the repository, as notes; the skill is still shown', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.getByRole('note')).toHaveText([/^tools\/release\/SKILL\.md: malformed front matter: .*; using the directory name$/]);
  await skillButtons(page).filter({ hasText: 'release' }).click();
  await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(BROKEN_MD);
});

test('the size of a SKILL.md: its lines and its bytes, in kB from a thousand', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/many');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/many 24 skills');

  await skillButtons(page).nth(1).click();
  const bytes = new TextEncoder().encode(MANY_BIG_MD).length;
  expect(bytes).toBeGreaterThan(1000);
  await expect(chosen(page)).toContainText(`${MANY_BIG_MD.split('\n').length - 1} lines · ${(bytes / 1000).toFixed(1)} kB`);
  await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(MANY_BIG_MD);

  await skillButtons(page).nth(2).click();
  await expect(chosen(page)).toContainText('1 line · 10 B');
  await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(MANY_ONE_LINE_MD);
});

test('many warnings: each one a note, and the index keeps its room', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/many');
  const notes = page.getByRole('note');
  await expect(notes).toHaveCount(9);
  await expect(notes.filter({ hasText: 'malformed front matter' })).toHaveCount(8);
  await expect(notes.filter({ hasText: 'no front matter' })).toHaveText('.claude/skills/skill-03/SKILL.md: no front matter; using the directory name');

  const index = (await page.getByRole('navigation', { name: 'Skills' }).boundingBox())!;
  expect(index.height).toBeGreaterThan(200);
  await expect(skillButtons(page).first()).toBeInViewport({ ratio: 1 });
  await notes.last().scrollIntoViewIfNeeded(); // the notes scroll in their own corner
  await expect(notes.last()).toBeInViewport({ ratio: 1 });
  await expect(skillButtons(page).first()).toBeInViewport({ ratio: 1 });
});

test('a long index: the chosen skill stays in view, however it is chosen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the world turns at once, so its places stand still
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/many');
  const buttons = skillButtons(page);
  await expect(buttons).toHaveCount(24);
  await expect(buttons.nth(17)).not.toBeInViewport();

  // By a click, far down the index: it stays where it was clicked.
  await buttons.nth(17).click();
  await expect(buttons.nth(17)).toHaveAttribute('aria-current', 'true');
  await expect(buttons.nth(17)).toBeInViewport({ ratio: 1 });

  // By the keys, on and on: the index follows.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await expect(buttons.nth(22)).toBeFocused();
  await expect(buttons.nth(22)).toBeInViewport({ ratio: 1 });
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
  await expect(buttons.nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(buttons.nth(2)).toBeInViewport({ ratio: 1 });

  // By its place, on the world: the index scrolls to a skill that was out of view.
  await expect.poll(() => page.evaluate(placesInView)).toContain('skill-03');
  const far = (await page.evaluate(placesInView)).filter((name) => name >= 'skill-12').at(-1);
  expect(far, 'a place in view whose skill is far down the index').toBeDefined();
  const entry = buttons.filter({ hasText: far });
  await expect(entry).not.toBeInViewport();
  const at = (await page.locator('[data-place]').filter({ hasText: far }).boundingBox())!;
  await page.mouse.click(at.x, at.y);
  await expect(entry).toHaveAttribute('aria-current', 'true');
  await expect(entry).toBeInViewport({ ratio: 1 });
});

test('a /tree/<ref> URL scans that commit', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo/tree/v1');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
  expect(requests).toContain(`https://api.github.com/repos/JetBrains/atlas-demo/commits/v1`);
});

test('no SKILL.md → 0 skills, nothing to choose', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/empty');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/empty 0 skills');
  await expect(page.getByRole('navigation', { name: 'Skills' })).toHaveCount(0);
  await expect(chosen(page)).toHaveCount(0);
});

test('what cannot be scanned → the CLI’s message, as an alert', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/no-such-repository');
  await expect(page.getByRole('alert')).toHaveText('error Repository not found: https://github.com/JetBrains/no-such-repository');

  await scan(page, 'https://github.com/JetBrains/atlas-demo/tree/no-such-branch');
  await expect(page.getByRole('alert')).toHaveText('error Not found in https://github.com/JetBrains/atlas-demo: no-such-branch');

  await scan(page, 'https://example.com/JetBrains/atlas-demo');
  await expect(page.getByRole('alert')).toHaveText('error Not a GitHub repository URL: https://example.com/JetBrains/atlas-demo');
  await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);

  await scan(page, 'https://github.com/JetBrains/not-answered');
  await expect(page.getByRole('alert')).toHaveText(/^error Cannot reach GitHub: /);
});

test('?repo=<URL> scans at once; scanning writes it to the address', async ({ page }) => {
  await page.goto(`./?repo=${encodeURIComponent('https://github.com/JetBrains/atlas-demo')}`);
  await expect(page.getByLabel('Repository link')).toHaveValue('https://github.com/JetBrains/atlas-demo');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');

  await scan(page, 'https://github.com/JetBrains/empty');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/empty 0 skills');
  expect(new URL(page.url()).searchParams.get('repo')).toBe('https://github.com/JetBrains/empty');
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/empty 0 skills');
});

test('examples: nine repositories with skills, each a link that fills the field and scans it', async ({ page }) => {
  await page.goto('./');
  const examples = page.getByRole('navigation', { name: 'Examples' }).getByRole('link');
  await expect(examples).toHaveText([
    'anthropics/skills',
    'obra/superpowers',
    'vercel-labs/agent-skills',
    'openai/codex',
    'huggingface/skills',
    'trailofbits/skills',
    'getsentry/skills',
    'JetBrains/kotlin',
    'JetBrains/koog',
  ]);
  for (const example of await examples.all()) {
    const id = await example.textContent();
    await expect(example).toHaveAttribute('href', `?repo=${encodeURIComponent(`https://github.com/${id}`)}`);
  }
  expect(requests).toEqual([]);

  await examples.filter({ hasText: 'JetBrains/koog' }).click();
  await expect(page.getByLabel('Repository link')).toHaveValue('https://github.com/JetBrains/koog');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  await expect(chosen(page).getByRole('heading', { level: 3 })).toHaveText('commits');
  expect(new URL(page.url()).searchParams.get('repo')).toBe('https://github.com/JetBrains/koog');
});

test('examples: Ctrl/Cmd-, Shift- and middle-click open a new tab or window, this page does not scan', async ({ page, context }) => {
  await page.goto('./');
  const koog = page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'JetBrains/koog' });
  const clicks: Parameters<Locator['click']>[0][] = [{ modifiers: ['ControlOrMeta'] }, { modifiers: ['Shift'] }, { button: 'middle' }];
  for (const click of clicks) {
    const opened = context.waitForEvent('page');
    await koog.click(click);
    const tab = await opened;
    await expect(tab.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
    await tab.close();
  }
  await expect(page.getByLabel('Repository link')).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('repo')).toBeNull();
});

test('a scan started while another runs wins, even when the earlier one answers later', async ({ page }) => {
  const releaseDemo = slow('JetBrains/atlas-demo');
  const releaseKoog = slow('JetBrains/koog');
  const button = page.locator('form').getByRole('button');
  const demoDone = () => answered.filter((url) => url.includes('/atlas-demo/') && url.endsWith('SKILL.md')).length;
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(button).toHaveText(/Scanning…/);
  await page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'JetBrains/koog' }).click();

  // The earlier scan ends first: it is not shown, and the page is still scanning.
  releaseDemo();
  await expect.poll(demoDone).toBe(4);
  await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);
  await expect(button).toHaveText(/Scanning…/);
  await expect(button).toBeDisabled();

  releaseKoog();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  await expect(button).toHaveText(/Scan$/);
  await expect(button).toBeEnabled();
  await expect(page.getByLabel('Repository link')).toHaveValue('https://github.com/JetBrains/koog');
  expect(new URL(page.url()).searchParams.get('repo')).toBe('https://github.com/JetBrains/koog');
});

test('a later scan that ends first stays shown when the earlier one answers', async ({ page }) => {
  const releaseDemo = slow('JetBrains/atlas-demo');
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'JetBrains/koog' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');

  releaseDemo();
  await expect.poll(() => answered.filter((url) => url.includes('/atlas-demo/') && url.endsWith('SKILL.md')).length).toBe(4);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  await expect(page.locator('form').getByRole('button')).toBeEnabled();
});
