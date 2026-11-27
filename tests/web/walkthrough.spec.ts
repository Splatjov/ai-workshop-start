// spec/web.md, "Recordings and screenshots": the demo as a test. A user's walk through the page,
// over recorded GitHub answers: after each step, what the user should see, and at the key
// moments a screenshot compared with the reviewed baseline in tests/web/__screenshots__/.
// Every run records a video (playwright.config.ts); CI keeps it.
import { expect, test, type Page } from '@playwright/test';
import { answer as text } from '../../src/core/replay.ts';
import { place, sky, world } from './github.ts';
import { COMMITS_MD, GRADLE_MD, RECORDING, STYLE_MD } from './recording.ts';

// The same pixels on every run: one viewport, no motion, and drawably's hand-drawn strokes and the
// sky's pen from fixed seeds instead of a new random sketch per mount.
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });

let errors: string[];

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript(() => {
    // A sequence of its own for every place that calls it: how many sketches drawably has drawn
    // before the sky is made depends on timing, and must not change the sky's hand.
    const seeds = new Map<string, number>();
    Math.random = () => {
      const site = new Error().stack?.split('\n')[2] ?? '';
      let seed = ((seeds.get(site) ?? 20261126) + 0x6d2b79f5) | 0;
      seeds.set(site, seed);
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const answer = RECORDING[route.request().url()];
    if (!answer) return route.abort('internetdisconnected');
    await route.fulfill({
      status: answer.status,
      body: text(answer, route.request().postData() ?? ''),
      headers: { 'access-control-allow-origin': '*' },
    });
  });
});

test.afterEach(() => expect(errors, 'errors in the page').toEqual([]));

const skills = (page: Page) => page.getByRole('navigation', { name: 'Skills' }).getByRole('button');
const chosen = (page: Page) => page.getByRole('region', { name: /: SKILL\.md$/ });

/** The whole page, once the fonts, the chosen skill and the sky have settled. */
async function screenshot(page: Page, name: string) {
  await page.waitForFunction('document.fonts.status === "loaded"');
  // The sky marks itself at rest once nothing on it moves: the eye, the worlds, the first sketch.
  await expect(page.locator('canvas.sky')).toHaveAttribute('data-rest', '');
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
}

async function scan(page: Page, url: string) {
  await page.getByLabel('Repository link').fill(url);
  await page.getByRole('button', { name: 'Scan' }).click();
}

test('a repository: scan it, choose a skill, filter, a filter without a match', async ({ page }) => {
  await test.step('open the page: the link field, the examples, nothing scanned; the system, its examples on the rim', async () => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Skill Atlas/);
    await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);
    await expect(sky(page)).toHaveAttribute('data-view', 'system');
    await expect(world(page, 'anthropics/skills')).toBeAttached();
    await screenshot(page, 'start');
  });

  await test.step('scan JetBrains/atlas-demo: its world, 3 skills and their places, the first one chosen', async () => {
    await scan(page, 'https://github.com/JetBrains/atlas-demo');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('JetBrains/atlas-demo 3 skills');
    await expect(sky(page)).toHaveAttribute('data-view', 'world');
    await expect(page.locator('[data-place]')).toHaveText(['code-style', 'commits', 'release']);
    await expect(place(page, 'code-style')).toHaveAttribute('data-chosen', '');
    await expect(skills(page)).toHaveCount(3);
    await expect(skills(page).first()).toHaveAttribute('aria-current', 'true');
    await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(STYLE_MD);
    await screenshot(page, 'repository');
  });

  await test.step('choose commits: its description, its copy, its SKILL.md', async () => {
    await skills(page).filter({ hasText: 'commits' }).click();
    await expect(place(page, 'commits')).toHaveAttribute('data-chosen', '');
    await expect(chosen(page)).toContainText('also in .github/skills/commits/SKILL.md');
    await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(COMMITS_MD);
    await screenshot(page, 'skill');
  });

  await test.step('filter "style": 1 of 3 skills, code-style chosen', async () => {
    await page.getByLabel('Filter skills').fill('style');
    await expect(page.getByRole('region', { name: 'Scan result' })).toContainText('1 of 3 skills');
    await expect(skills(page)).toHaveCount(1);
    await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(STYLE_MD);
    await screenshot(page, 'filter');
  });

  await test.step('filter "no-such-skill": a message, nothing chosen', async () => {
    await page.getByLabel('Filter skills').fill('no-such-skill');
    await expect(page.getByRole('status')).toHaveText('No skill matches “no-such-skill”.');
    await expect(chosen(page)).toHaveCount(0);
    await screenshot(page, 'no-match');
  });
});

test('an organization: its skills under their repositories; a link that cannot be scanned', async ({ page }) => {
  await test.step('scan github.com/atlas-org: 4 skills in 2 repositories, each a world; the view stays over the system', async () => {
    await page.goto('./');
    await scan(page, 'https://github.com/atlas-org');
    await expect(page.getByRole('region', { name: 'Scan result' })).toContainText('4 skills in 2 repositories');
    await expect(world(page, 'atlas-org/alpha')).toBeAttached();
    await expect(world(page, 'atlas-org/gamma')).toBeAttached();
    await expect(sky(page)).toHaveAttribute('data-view', 'system');
    await expect(chosen(page).getByLabel('SKILL.md')).toBeVisible();
    await screenshot(page, 'organization');
  });

  await test.step('filter "gradle": only gamma is listed', async () => {
    await page.getByLabel('Filter skills').fill('gradle');
    await expect(skills(page)).toHaveCount(1);
    await expect(chosen(page).getByLabel('SKILL.md')).toHaveText(GRADLE_MD);
  });

  await test.step('scan a repository that is not there: the message, as an alert', async () => {
    await scan(page, 'https://github.com/JetBrains/no-such-repository');
    await expect(page.getByRole('alert')).toHaveText('error Repository not found: https://github.com/JetBrains/no-such-repository');
    await expect(sky(page)).toHaveAttribute('data-view', 'system');
    await screenshot(page, 'error');
  });
});
