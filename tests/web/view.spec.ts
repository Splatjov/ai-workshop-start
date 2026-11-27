// spec/web.md: the page, as a user sees it, over recorded GitHub answers.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { answer as text } from '../../src/core/replay.ts';
import { BROKEN_MD, COMMIT, COMMITS_MD, GAMMA_COMMIT, GRADLE_MD, RECORDING, STYLE_MD } from './recording.ts';

const blob = `https://github.com/JetBrains/atlas-demo/blob/${COMMIT}`;
let requests: string[];
let answered: string[];
/** The Authorization header of each request to the GitHub API. */
let authorizations: (string | undefined)[];
let errors: string[];
/** GitHub's answers for URLs matching a pattern wait until its promise resolves: a slow repository. */
let holds: { pattern: RegExp; open: Promise<void> }[];

/** Holds the answers for `repository` until the returned function is called. */
function slow(repository: string): () => void {
  let release!: () => void;
  holds.push({ pattern: new RegExp(`/${repository}[/?]`), open: new Promise((resolve) => (release = resolve)) });
  return release;
}

test.beforeEach(async ({ page, context }) => {
  requests = [];
  answered = [];
  authorizations = [];
  errors = [];
  holds = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // GitHub answers from the recording, in every tab; anything else on GitHub fails, as the network would.
  await context.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.startsWith('https://api.github.com/')) authorizations.push(route.request().headers().authorization);
    const answer = RECORDING[url];
    for (const { pattern, open } of holds) if (pattern.test(url)) await open;
    if (!answer) return route.abort('internetdisconnected');
    await route.fulfill({
      status: answer.status,
      body: text(answer, route.request().postData() ?? ''),
      // As GitHub: code search answers without CORS headers, so a page cannot read it.
      headers: url.startsWith('https://api.github.com/search/code') ? {} : { 'access-control-allow-origin': '*' },
    });
    answered.push(url);
  });
});

test.afterEach(() => expect(errors, 'errors in the page').toEqual([]));

async function scan(page: Page, url: string) {
  await page.getByLabel('Repository link').fill(url);
  await page.getByRole('button', { name: 'Scan' }).click();
}

const skillButtons = (page: Page) => page.getByRole('navigation', { name: 'Skills' }).getByRole('button');
const chosen = (page: Page) => page.getByRole('region', { name: /: SKILL\.md$/ });

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
});

test('warnings: under the repository, as notes; the skill is still shown', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.getByRole('note')).toHaveText([/^tools\/release\/SKILL\.md: malformed front matter: .*; using the directory name$/]);
  await skillButtons(page).filter({ hasText: 'release' }).click();
  await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(BROKEN_MD);
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

const filterField = (page: Page) => page.getByLabel('Filter skills');

test('filter: only the matching skills, M of N skills; the chosen one stays, or else the first match', async ({ page }) => {
  await page.goto('./');
  await expect(filterField(page)).toHaveCount(0); // nothing scanned, nothing to filter
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(skillButtons(page)).toHaveCount(3);
  const scanned = requests.length;

  // The chosen skill, code-style, does not match: the first match is chosen.
  await filterField(page).fill('COMMIT messages');
  await expect(skillButtons(page)).toHaveText(['commitsWrite commit messages the way this repository does..claude/skills/commits/SKILL.md']);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 1 of 3 skills');
  await expect(chosen(page)).toHaveAccessibleName('commits: SKILL.md');
  await expect(skillButtons(page).first()).toHaveAttribute('aria-current', 'true');

  // By path; the chosen skill matches and stays chosen.
  await filterField(page).fill('');
  await skillButtons(page).filter({ hasText: 'release' }).click();
  await filterField(page).fill('skill.md  tools/');
  await expect(skillButtons(page)).toHaveText(['releasetools/release/SKILL.md']);
  await filterField(page).fill('e');
  await expect(skillButtons(page)).toHaveCount(3);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect(chosen(page)).toHaveAccessibleName('release: SKILL.md');

  expect(requests.length, 'filtering does not scan').toBe(scanned);
});

test('filter: no match → a message, nothing chosen; a new scan clears it', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await filterField(page).fill('no-such-skill');
  await expect(page.getByRole('status')).toHaveText('No skill matches “no-such-skill”.');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 0 of 3 skills');
  await expect(page.getByRole('navigation', { name: 'Skills' })).toHaveCount(0);
  await expect(chosen(page)).toHaveCount(0);

  await scan(page, 'https://github.com/JetBrains/koog');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  await expect(filterField(page)).toHaveValue('');
  await expect(skillButtons(page)).toHaveCount(1);

  await scan(page, 'https://github.com/JetBrains/empty');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/empty 0 skills');
  await expect(filterField(page)).toHaveCount(0);
});

test('GitHub token: a password field; the next scan sends it to GitHub, and it is not kept', async ({ page }) => {
  await page.goto('./');
  const token = page.getByLabel('GitHub token');
  await expect(token).toHaveAttribute('type', 'password');
  await expect(token).toHaveAccessibleDescription(/Sent to GitHub only, never stored/);

  // Without a token: no Authorization header, through the tree.
  await scan(page, 'https://github.com/JetBrains/koog');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  expect(authorizations.length).toBeGreaterThan(0);
  expect(authorizations.every((header) => header === undefined)).toBe(true);
  expect(requests.some((url) => url.includes('/search/'))).toBe(false);

  // With one: every API request carries it; still through the tree, as a page cannot read code search.
  authorizations.length = 0;
  requests.length = 0;
  await token.fill('secret-token');
  await scan(page, 'https://github.com/JetBrains/koog');
  await expect.poll(() => requests.some((url) => url.includes('/repos/JetBrains/koog/git/trees/'))).toBe(true);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests.some((url) => url.includes('/search/'))).toBe(false);
  expect(authorizations.length).toBeGreaterThan(0);
  expect(authorizations.every((header) => header === 'Bearer secret-token')).toBe(true);

  // Not in the address, not stored, gone on reload.
  expect(page.url()).not.toContain('secret-token');
  expect(await page.evaluate('JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie])')).toBe('[{},{},""]');
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  await expect(page.getByLabel('GitHub token')).toHaveValue('');
});

test('organization: its skills under their repositories, the first one chosen; the filter spans them', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/atlas-org');

  const heading = page.getByRole('heading', { level: 2 });
  await expect(heading).toHaveText('atlas-org 4 skills in 2 repositories');
  await expect(heading.getByRole('link')).toHaveAttribute('href', 'https://github.com/atlas-org');
  const skills = page.getByRole('navigation', { name: 'Skills' });
  await expect(skills.getByRole('heading', { level: 3 })).toHaveText(['atlas-org/alpha', 'atlas-org/gamma']);
  await expect(skills.getByRole('link', { name: 'atlas-org/gamma' })).toHaveAttribute('href', `https://github.com/atlas-org/gamma/tree/${GAMMA_COMMIT}`);
  await expect(skills.getByRole('region', { name: 'atlas-org/alpha' }).getByRole('button')).toHaveText([/^code-style/, /^commits/]);
  await expect(skills.getByRole('region', { name: 'atlas-org/gamma' }).getByRole('button')).toHaveText([/^gradle/, /^release/]);
  await expect(page.getByRole('note')).toHaveText([/^atlas-org\/gamma: tools\/release\/SKILL\.md: malformed front matter: /]);
  await expect(chosen(page)).toHaveAccessibleName('code-style: SKILL.md');
  await expect(chosen(page).getByRole('link')).toHaveAttribute('href', `https://github.com/atlas-org/alpha/blob/${COMMIT}/docs/code-style/SKILL.md`);
  expect(new URL(page.url()).searchParams.get('repo')).toBe('https://github.com/atlas-org');

  await filterField(page).fill('gradle');
  await expect(heading).toHaveText('atlas-org 1 of 4 skills in 1 repository');
  await expect(skills.getByRole('heading', { level: 3 })).toHaveText(['atlas-org/gamma']);
  await expect(skillButtons(page)).toHaveText(['gradleBuild with Gradle.build/gradle/SKILL.md']);
  await expect(chosen(page).getByRole('link')).toHaveAttribute('href', `https://github.com/atlas-org/gamma/blob/${GAMMA_COMMIT}/build/gradle/SKILL.md`);
  await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(GRADLE_MD);
});

test('organization, with a token: every repository’s tree, as without one, never code search; unknown → the CLI’s message, as an alert', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('GitHub token').fill('secret-token');
  await scan(page, 'github.com/atlas-org');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('atlas-org 4 skills in 2 repositories');
  // Code search would find only what it indexes; the trees find every SKILL.md, the token only raises the limit.
  expect(requests.some((url) => url.includes('/search/'))).toBe(false);
  expect(requests).toContain('https://api.github.com/users/atlas-org/repos?per_page=100&page=1');
  expect(requests.some((url) => url.includes('/repos/atlas-org/beta/git/trees/'))).toBe(true);
  expect(authorizations.every((header) => header === 'Bearer secret-token')).toBe(true);

  await scan(page, 'https://github.com/no-such-org');
  await expect(page.getByRole('alert')).toHaveText('error Organization not found: https://github.com/no-such-org');
});

test('a token GitHub rejects, the rate limit without one → alerts that name the GitHub token field', async ({ page, context }) => {
  // GitHub answers 401 to a request with a token, and is past its rate limit without one.
  await context.route('https://api.github.com/repos/JetBrains/koog', (route) => {
    const rejected = Boolean(route.request().headers().authorization);
    return route.fulfill({
      status: rejected ? 401 : 403,
      body: JSON.stringify({ message: rejected ? 'Bad credentials' : 'API rate limit exceeded for 192.0.2.1.' }),
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/koog');
  await expect(page.getByRole('alert')).toHaveText('error GitHub rate limit reached; fill in the GitHub token field');

  await page.getByLabel('GitHub token').fill('wrong-token');
  await scan(page, 'https://github.com/JetBrains/koog');
  await expect(page.getByRole('alert')).toHaveText('error GitHub rejected the token in the GitHub token field');
  await expect(page.getByRole('alert')).not.toContainText('GITHUB_TOKEN');
});

const groupSwitch = (page: Page) => page.getByRole('switch', { name: 'Group by theme' });
const groupTitles = (page: Page) => page.getByRole('navigation', { name: 'Skills' }).getByRole('heading', { level: 3 });

test('group by theme: a switch, off at first; on, the skills under their themes; the chosen one stays', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-themes');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-themes 7 skills');
  await expect(groupSwitch(page)).not.toBeChecked();
  await expect(groupTitles(page)).toHaveCount(0);
  await skillButtons(page).filter({ hasText: 'pdf-read' }).click();
  const scanned = requests.length;

  await groupSwitch(page).check();
  await expect(groupTitles(page)).toHaveText(['gradle · 2 skills', 'pdf · 2 skills', 'test · unit · 2 skills', 'Other · 1 skill']);
  const nav = page.getByRole('navigation', { name: 'Skills' });
  await expect(nav.getByRole('region', { name: 'test · unit' }).getByRole('button')).toHaveText([/^junit-test/, /^kotlin-test/]);
  await expect(nav.getByRole('region', { name: 'Other' }).getByRole('button')).toHaveText([
    'commitsWrite commit messages the way this repository does..claude/skills/commits/SKILL.md',
  ]);
  await expect(chosen(page)).toHaveAccessibleName('pdf-read: SKILL.md');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-themes 7 skills');

  // Not in the address, not stored; off again: the list as before.
  expect(new URL(page.url()).search).toBe(`?repo=${encodeURIComponent('https://github.com/JetBrains/atlas-themes')}`);
  expect(await page.evaluate('JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie])')).toBe('[{},{},""]');
  await groupSwitch(page).uncheck();
  await expect(groupTitles(page)).toHaveCount(0);
  await expect(skillButtons(page)).toHaveText([/^commits/, /^gradle-build/, /^gradle-publish/, /^junit-test/, /^kotlin-test/, /^pdf-fill/, /^pdf-read/]);
  await expect(chosen(page)).toHaveAccessibleName('pdf-read: SKILL.md');
  expect(requests.length, 'grouping does not scan').toBe(scanned);
});

test('group by theme with the filter: the groups of the skills it leaves; it stays on for the next scan, the filter does not', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-themes');
  await groupSwitch(page).check();
  await expect(chosen(page)).toHaveAccessibleName('gradle-build: SKILL.md'); // the first one shown
  await skillButtons(page).filter({ hasText: 'commits' }).click();
  // The chosen skill, commits, does not match: the first one shown is chosen.
  await filterField(page).fill('with');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-themes 4 of 7 skills');
  await expect(groupTitles(page)).toHaveText(['gradle · 2 skills', 'test · unit · 2 skills']);
  await expect(chosen(page)).toHaveAccessibleName('gradle-build: SKILL.md');
  await filterField(page).fill('no-such-skill');
  await expect(page.getByRole('status')).toHaveText('No skill matches “no-such-skill”.');
  await expect(groupTitles(page)).toHaveCount(0);

  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect(filterField(page)).toHaveValue('');
  await expect(groupSwitch(page)).toBeChecked();
  await expect(groupTitles(page)).toHaveText(['Other · 3 skills']);
  await expect(chosen(page)).toHaveAccessibleName('code-style: SKILL.md');
});

test('group by theme, an organization: the themes across its repositories, each path after its owner/repo', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/themes-org');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('themes-org 4 skills in 2 repositories');
  await expect(groupTitles(page)).toHaveText(['themes-org/build', 'themes-org/docs']);

  await groupSwitch(page).check();
  await expect(groupTitles(page)).toHaveText(['gradle · 2 skills', 'Other · 2 skills']);
  await expect(page.getByRole('navigation', { name: 'Skills' }).getByRole('region', { name: 'gradle' }).getByRole('button')).toHaveText([
    'gradle-buildBuild the project with Gradle.themes-org/build/.claude/skills/gradle-build/SKILL.md',
    'gradle-publishPublish to Maven Central with Gradle.themes-org/docs/.claude/skills/gradle-publish/SKILL.md',
  ]);
  await expect(chosen(page)).toHaveAccessibleName('gradle-build: SKILL.md');
  await skillButtons(page).filter({ hasText: 'gradle-publish' }).click();
  await expect(chosen(page).getByRole('link')).toHaveAttribute(
    'href',
    `https://github.com/themes-org/docs/blob/${COMMIT}/.claude/skills/gradle-publish/SKILL.md`,
  );
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('themes-org 4 skills in 2 repositories');
});

test('group by theme: a scan started while another runs wins, grouped', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-themes');
  await groupSwitch(page).check();
  const releaseDemo = slow('JetBrains/atlas-demo');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'JetBrains/koog' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  releaseDemo();
  await expect.poll(() => answered.filter((url) => url.includes('/atlas-demo/') && url.endsWith('SKILL.md')).length).toBe(4);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/koog 1 skill');
  await expect(groupTitles(page)).toHaveText(['Other · 1 skill']);
  await expect(groupSwitch(page)).toBeChecked();
});
