// spec/web.md, "The system": the worlds of the scans, as a user sees and goes among them, over
// recorded GitHub answers.
import { expect, test, type Page } from '@playwright/test';
import { EXAMPLES } from '../../web/examples.ts';
import { address, chosen, filterField, recorded, rested, scan, sky, where, world, worldButtons, type Recorded } from './github.ts';
import { ink, pageScrolls, scrollToTop, scrolled, twoFingersApart } from './in-page.js';
import { OTHER_EXAMPLES } from './recording.ts';

let requests: string[];
let errors: string[];
let slow: Recorded['slow'];

test.beforeEach(async ({ page }) => {
  ({ requests, errors, slow } = await recorded(page));
});

test.afterEach(() => expect(errors, 'errors in the page').toEqual([]));

const system = (page: Page) => page.getByRole('heading', { level: 2 });
const between = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const DEMO = 'jetbrains/atlas-demo';
const TWIN = 'jetbrains/atlas-twin';
const GARDEN = 'jetbrains/garden';
const THREE = address(['JetBrains/atlas-demo', 'JetBrains/atlas-twin', 'JetBrains/garden'], '&view=system');

test('the examples are worlds of the system before they are scanned: not yet charted, in the pen alone', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-sky', 'drawn');
  await expect(sky(page)).toHaveAttribute('data-view', 'system');
  await expect(page.locator('[data-world]')).toHaveCount(EXAMPLES.length);
  await expect(page.locator('[data-world][data-state="uncharted"] b')).toHaveText([...EXAMPLES]);
  await expect(page.locator('[data-place]')).toHaveCount(0);
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(3000);
  const drawn = await page.evaluate(ink);
  expect(drawn.accented).toBe(0);
  expect(drawn.washed).toBe(0); // all sea: no land is known
  expect(requests).toEqual([]);

  // They wait on the rim of the plate, round its middle: across the sky's place on the page, and within it.
  await expect(sky(page)).toHaveAttribute('data-rest', '');
  const at = await Promise.all(EXAMPLES.map(async (id) => (await world(page, id.toLowerCase()).boundingBox())!));
  const left = Math.min(...at.map(({ x }) => x));
  const right = Math.max(...at.map(({ x }) => x));
  expect(right - left).toBeGreaterThan(300);
  const slot = (await page.locator('.globe').boundingBox())!;
  for (const { x, y } of at) {
    expect(x).toBeGreaterThan(slot.x);
    expect(y).toBeGreaterThan(slot.y);
    expect(y).toBeLessThan(slot.y + slot.height);
  }
});

test('every repository scanned is a world; the more alike their skills, the closer they stand', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(THREE);
  await expect(system(page)).toHaveText('The system 3 worlds');
  await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);
  await expect(page.locator('[data-world][data-state="charted"] b')).toHaveText(['JetBrains/atlas-demo', 'JetBrains/atlas-twin', 'JetBrains/garden']);
  await expect(sky(page)).toHaveAttribute('data-view', 'system');

  // The register: the worlds by name, each with its skills and the world most like it.
  await expect(worldButtons(page)).toHaveText([
    'JetBrains/atlas-demo3 skills · nearest JetBrains/atlas-twin, 100% alike',
    'JetBrains/atlas-twin3 skills · nearest JetBrains/atlas-demo, 100% alike',
    'JetBrains/garden2 skills · nearest JetBrains/atlas-demo, 0% alike',
  ]);

  // The same skills: all but touching. Nothing in common: far apart.
  const [demo, twin, garden] = [await where(page, world(page, DEMO)), await where(page, world(page, TWIN)), await where(page, world(page, GARDEN))];
  expect(between(demo, twin) * 2.5).toBeLessThan(between(demo, garden));
  expect(between(demo, twin) * 2.5).toBeLessThan(between(twin, garden));

  // A thread from each world to the one most like it, and how alike they are.
  await expect(page.locator(`[data-kin="${DEMO}|${TWIN}"]`)).toHaveText('100%');
  await expect(page.locator(`[data-kin="${DEMO}|${GARDEN}"]`)).toHaveText('0%');
  await expect(page.locator('[data-kin]')).toHaveCount(2);
  const thread = await where(page, page.locator(`[data-kin="${DEMO}|${TWIN}"]`));
  expect(between(thread, { x: (demo.x + twin.x) / 2, y: (demo.y + twin.y) / 2 })).toBeLessThan(12); // written half way between them
  await expect.poll(async () => (await page.evaluate(ink)).washed).toBeGreaterThan(60); // their lands, washed

  // The same repositories, the same system: opened again, the worlds stand where they stood.
  await page.reload();
  await expect(system(page)).toHaveText('The system 3 worlds');
  await expect.poll(async () => [await where(page, world(page, DEMO)), await where(page, world(page, TWIN)), await where(page, world(page, GARDEN))]).toEqual([demo, twin, garden]);
});

test('a world is the larger, the more skills it has; and wears a ring for every other folder its skills are copied into', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(address(['JetBrains/many', 'JetBrains/garden'], '&view=system'));
  await expect(system(page)).toHaveText('The system 2 worlds');
  // How large each is drawn, in pixels across the page: its name is written that far from its middle.
  const size = async (key: string) => {
    await where(page, world(page, key));
    return world(page, key).evaluate((name) => parseFloat(name.style.getPropertyValue('--size')));
  };
  const [many, garden] = [await size('jetbrains/many'), await size(GARDEN)];
  expect(garden).toBeGreaterThan(20);
  expect(many).toBeGreaterThan(garden * 1.3); // 24 skills against 2
  await expect(world(page, 'jetbrains/many')).toHaveAttribute('data-rings', '0');

  // The same three skills, with and without a copy in .github/skills: a ring round the one, seen from close by.
  await page.goto(address(['JetBrains/atlas-twin']));
  await expect(system(page)).toHaveText('JetBrains/atlas-twin 3 skills');
  await expect(world(page, TWIN)).toHaveAttribute('data-rings', '0');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
  const twin = await rested(page);
  await page.goto(address(['JetBrains/atlas-demo']));
  await expect(system(page)).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect(world(page, DEMO)).toHaveAttribute('data-rings', '1');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
  const demo = await rested(page);
  expect(demo.inked).toBeGreaterThan(twin.inked + 1500);
});

test('clicking a world goes to it; one not yet charted is scanned first', async ({ page }) => {
  await page.goto('./');
  await expect(sky(page)).toHaveAttribute('data-rest', '');
  const koog = (await world(page, 'jetbrains/koog').boundingBox())!;
  await page.mouse.move(koog.x, koog.y);
  await expect(page.locator('[data-world][data-pointed] b')).toHaveText('JetBrains/koog');
  await page.mouse.click(koog.x, koog.y);
  await expect(system(page)).toHaveText('JetBrains/koog 1 skill');
  await expect(page.getByLabel('Repository link')).toHaveValue('https://github.com/JetBrains/koog');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
  await expect(world(page, 'jetbrains/koog')).toHaveAttribute('data-state', 'charted');
  expect(new URL(page.url()).searchParams.getAll('repo')).toEqual(['https://github.com/JetBrains/koog']);

  // Back over the system, it is charted; clicked again, it is not scanned again.
  await page.keyboard.press('Escape');
  await expect(system(page)).toHaveText('The system 1 world');
  await expect(sky(page)).toHaveAttribute('data-view', 'system');
  await expect(sky(page)).toHaveAttribute('data-rest', '');
  expect(new URL(page.url()).searchParams.get('view')).toBe('system');
  const asked = requests.length;
  const again = (await world(page, 'jetbrains/koog').boundingBox())!;
  await page.mouse.click(again.x, again.y);
  await expect(system(page)).toHaveText('JetBrains/koog 1 skill');
  expect(requests.length).toBe(asked);
  expect(new URL(page.url()).searchParams.get('view')).toBeNull();
});

test('the wheel goes nearer to the world under the pointer, and back; so do Escape and “the system”', async ({ page }) => {
  await page.goto(address(['JetBrains/atlas-demo', 'JetBrains/garden'], '&view=system'));
  await expect(system(page)).toHaveText('The system 2 worlds');
  await expect(sky(page)).toHaveAttribute('data-rest', '');

  const garden = (await world(page, GARDEN).boundingBox())!;
  await page.mouse.move(garden.x, garden.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
  await expect(system(page)).toHaveText('JetBrains/garden 2 skills');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
  await expect(chosen(page)).toHaveAccessibleName('sourdough: SKILL.md');

  const slot = (await page.locator('.globe').boundingBox())!;
  await page.mouse.move(slot.x + slot.width / 3, slot.y + slot.height / 2);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 120);
  await expect(system(page)).toHaveText('The system 2 worlds');
  await expect(sky(page)).toHaveAttribute('data-view', 'system');
  await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);

  await worldButtons(page).first().click();
  await expect(system(page)).toHaveText('JetBrains/atlas-demo 3 skills');
  await page.getByRole('button', { name: 'the system · 2 worlds' }).click();
  await expect(system(page)).toHaveText('The system 2 worlds');

  await worldButtons(page).last().click();
  await expect(system(page)).toHaveText('JetBrains/garden 2 skills');
  await page.keyboard.press('Escape');
  await expect(system(page)).toHaveText('The system 2 worlds');
});

test('where the page itself scrolls, the wheel is the page’s; two fingers still go nearer', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await page.goto(address(['JetBrains/many'], '&view=system'));
  await expect(system(page)).toHaveText('The system 1 world');
  await expect(sky(page)).toHaveAttribute('data-rest', '');
  expect(await page.evaluate(pageScrolls)).toBe(true);

  const many = (await world(page, 'jetbrains/many').boundingBox())!;
  await page.mouse.move(many.x, many.y);
  await page.mouse.wheel(0, -240); // nearer, were the wheel the sky's: it is not
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(scrolled)).toBeGreaterThan(100);
  await expect(system(page)).toHaveText('The system 1 world');
  await expect(sky(page)).toHaveAttribute('data-view', 'system');

  // Two fingers apart on a trackpad come as a wheel with Ctrl held: that is the sky's, wherever it is.
  await page.evaluate(scrollToTop);
  const at = (await world(page, 'jetbrains/many').boundingBox())!;
  await page.locator('.globe').evaluate(twoFingersApart, { x: at.x, y: at.y });
  await expect(system(page)).toHaveText('JetBrains/many 24 skills');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
});

test('the register: clicking a world’s entry goes to it; pointing at an entry marks its world, and at a world its entry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(THREE);
  await expect(worldButtons(page)).toHaveCount(3);
  await where(page, world(page, GARDEN));
  await expect(page.locator('[data-kin]')).toHaveCount(2);
  const calm = await rested(page);

  // Pointed at, a world is ringed in red, and its threads go to every other world.
  await worldButtons(page).nth(1).hover();
  await expect(page.locator('[data-world][data-pointed] b')).toHaveText('JetBrains/atlas-twin');
  await expect(page.locator('[data-world][data-pointed] small')).toHaveText('3 skills');
  await expect(page.locator(`[data-kin="${TWIN}|${GARDEN}"]`)).toHaveText('0%');
  await expect(page.locator('[data-kin]')).toHaveCount(3);
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(calm.accented + 100);

  const garden = await where(page, world(page, GARDEN));
  await page.mouse.move(garden.x, garden.y);
  await expect(worldButtons(page).nth(2)).toHaveAttribute('data-pointed', '');
  await expect(worldButtons(page).nth(1)).not.toHaveAttribute('data-pointed', '');

  await worldButtons(page).nth(1).click();
  await expect(system(page)).toHaveText('JetBrains/atlas-twin 3 skills');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
});

test('at a world, the worlds most alike are a step away', async ({ page }) => {
  await page.goto(THREE);
  await worldButtons(page).first().click();
  await expect(system(page)).toHaveText('JetBrains/atlas-demo 3 skills');
  const kin = page.getByRole('navigation', { name: 'Kin' }).getByRole('button');
  await expect(kin).toHaveText(['JetBrains/atlas-twin 100%', 'JetBrains/garden 0%']);
  await expect(kin.first()).toHaveAttribute('title', 'both have: code-style, commits, release');

  await kin.last().click();
  await expect(system(page)).toHaveText('JetBrains/garden 2 skills');
  await expect(chosen(page)).toHaveAccessibleName('sourdough: SKILL.md');
  expect(new URL(page.url()).searchParams.getAll('repo')[0]).toBe('https://github.com/JetBrains/garden');
  await expect(sky(page)).toHaveAttribute('data-rest', ''); // the eye went from one world to the other

  // A world alone has no kin.
  await page.goto(address(['JetBrains/atlas-demo']));
  await expect(system(page)).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect(page.getByRole('navigation', { name: 'Kin' })).toHaveCount(0);
});

test('chart all: every example is scanned, and the view stays over the system', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'chart all nine' }).click();
  await expect(system(page)).toHaveText('The system 9 worlds');
  await expect(page.locator('[data-world][data-state="charted"]')).toHaveCount(9);
  await expect(worldButtons(page)).toHaveCount(9);
  await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^chart all/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Scan' })).toBeEnabled();

  const address = new URL(page.url()).searchParams;
  expect(address.getAll('repo')).toEqual(EXAMPLES.map((id) => `https://github.com/${id}`));
  expect(address.get('view')).toBe('system');
  for (const id of Object.keys(OTHER_EXAMPLES)) expect(requests).toContain(`https://api.github.com/repos/${id}`);

  // At a world of many, the three most alike are a step away, and no more.
  await worldButtons(page).first().click();
  await expect(system(page)).toHaveText('anthropics/skills 1 skill');
  await expect(page.getByRole('navigation', { name: 'Kin' }).getByRole('button')).toHaveCount(3);

  // With some charted already, the rest.
  await page.goto('./');
  await page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'JetBrains/koog' }).click();
  await expect(system(page)).toHaveText('JetBrains/koog 1 skill');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'chart all 8' }).click();
  await expect(system(page)).toHaveText('The system 9 worlds');
});

test('several ?repo= chart them all, the first in view; view=system opens over the system; going about writes the address', async ({ page }) => {
  await page.goto(address(['JetBrains/garden', 'JetBrains/atlas-demo']));
  await expect(system(page)).toHaveText('JetBrains/garden 2 skills');
  await expect(page.getByLabel('Repository link')).toHaveValue('https://github.com/JetBrains/garden');
  await expect(page.locator('[data-world][data-state="charted"]')).toHaveCount(2);
  const repos = () => new URL(page.url()).searchParams.getAll('repo');
  expect(repos()).toEqual(['https://github.com/JetBrains/garden', 'https://github.com/JetBrains/atlas-demo']);

  await page.keyboard.press('Escape');
  await expect(system(page)).toHaveText('The system 2 worlds');
  expect(new URL(page.url()).searchParams.get('view')).toBe('system');
  await worldButtons(page).first().click();
  await expect(system(page)).toHaveText('JetBrains/atlas-demo 3 skills');
  expect(repos()).toEqual(['https://github.com/JetBrains/atlas-demo', 'https://github.com/JetBrains/garden']);
  expect(new URL(page.url()).searchParams.get('view')).toBeNull();

  await page.reload();
  await expect(system(page)).toHaveText('JetBrains/atlas-demo 3 skills');
  await page.keyboard.press('Escape');
  await expect(system(page)).toHaveText('The system 2 worlds');
  await page.reload();
  await expect(system(page)).toHaveText('The system 2 worlds');
  await expect(page.getByRole('region', { name: 'Scan result' })).toHaveCount(0);
});

test('a scan started while another runs takes the view; the earlier one’s world is charted where it stands', async ({ page }) => {
  const releaseDemo = slow('JetBrains/atlas-demo');
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(world(page, DEMO)).toHaveAttribute('data-state', 'scanning');
  await page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'JetBrains/koog' }).click();
  await expect(system(page)).toHaveText('JetBrains/koog 1 skill');

  releaseDemo();
  await expect(world(page, DEMO)).toHaveAttribute('data-state', 'charted');
  await expect(system(page)).toHaveText('JetBrains/koog 1 skill');
  await expect(page.getByRole('navigation', { name: 'Kin' }).getByRole('button')).toHaveText([/^JetBrains\/atlas-demo \d+%$/]);
  expect(new URL(page.url()).searchParams.getAll('repo')).toEqual(['https://github.com/JetBrains/koog', 'https://github.com/JetBrains/atlas-demo']);
});

test('while a scan runs, a meridian sweeps its world', async ({ page }) => {
  // GitHub takes its time over this repository, for as long as the test holds the answer.
  const release = slow('JetBrains/atlas-demo');
  await page.goto('./');
  await expect.poll(async () => (await page.evaluate(ink)).inked).toBeGreaterThan(3000);
  expect((await page.evaluate(ink)).accented).toBe(0);

  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
  await expect(world(page, DEMO)).toHaveAttribute('data-state', 'scanning');
  await expect(world(page, DEMO).locator('small')).toHaveText('scanning…');
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(40);

  release();
  await expect(system(page)).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect(page.getByRole('button', { name: 'Scan' })).toBeEnabled();
});

test('what cannot be scanned is scribbled over, until the next scan', async ({ page }) => {
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/no-such-repository');
  await expect(page.getByRole('alert')).toHaveText(/Repository not found/);
  const lost = page.locator('[data-world][data-state="lost"]');
  await expect(lost.locator('b')).toHaveText('JetBrains/no-such-repository');
  await expect(lost.locator('small')).toHaveText('not scanned');
  await expect(sky(page)).toHaveAttribute('data-view', 'system');
  await expect.poll(async () => (await page.evaluate(ink)).accented).toBeGreaterThan(150);

  // An example that cannot be scanned keeps its place, scribbled over.
  await page.route('https://api.github.com/repos/JetBrains/koog', (route) => route.fulfill({ status: 404, json: { message: 'Not Found' }, headers: { 'access-control-allow-origin': '*' } }));
  await page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'JetBrains/koog' }).click();
  await expect(page.getByRole('alert')).toHaveText('error Repository not found: https://github.com/JetBrains/koog');
  await expect(lost.locator('b')).toHaveText('JetBrains/koog'); // the earlier one is wiped
  await expect(page.locator('[data-world]')).toHaveCount(EXAMPLES.length);

  // The next scan that works wipes it: only the chosen place is left in red.
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(system(page)).toHaveText('JetBrains/atlas-demo 3 skills');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(lost).toHaveCount(0);
  await expect(world(page, 'jetbrains/koog')).toHaveAttribute('data-state', 'uncharted');
  await expect(sky(page)).toHaveAttribute('data-rest', '');
  expect((await page.evaluate(ink)).accented).toBeLessThan(1200);
});

test('dragging over the system turns the plate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(THREE);
  await expect(system(page)).toHaveText('The system 3 worlds');
  const before = await where(page, world(page, GARDEN));
  await expect(page.locator('.aim')).toHaveText(/^az \d{3}° \d{2}′ {2}alt \+\d{2}° \d{2}′$/); // where the eye stands over the plate
  const aim = await page.locator('.aim').textContent();

  const slot = (await page.locator('.globe').boundingBox())!;
  await page.mouse.move(slot.x + slot.width - 60, slot.y + slot.height - 60);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width - 260, slot.y + slot.height - 60, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => between(await where(page, world(page, GARDEN)), before)).toBeGreaterThan(40);
  await expect(page.locator('.aim')).not.toHaveText(aim!);
  await expect(system(page)).toHaveText('The system 3 worlds'); // a drag is not a click
});

test('an organization: every repository of it that has skills is a world; its skills are read over the system', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/atlas-org');
  await expect(system(page)).toHaveText('atlas-org 4 skills in 2 repositories');
  await expect(sky(page)).toHaveAttribute('data-view', 'system'); // the eye stays over the system
  await expect(page.locator('[data-world][data-state="charted"] b')).toHaveText(['atlas-org/alpha', 'atlas-org/gamma']);
  await expect(page.locator('[data-world]')).toHaveCount(EXAMPLES.length + 2); // the world that stood for the organization is gone
  await expect(page.locator(`[data-kin="atlas-org/alpha|atlas-org/gamma"]`)).toHaveText(/^\d+%$/);

  // The world of the chosen skill is marked; and of the skill pointed at.
  const marked = page.locator('[data-world][data-pointed] b');
  await expect(chosen(page)).toHaveAccessibleName('code-style: SKILL.md');
  await expect(marked).toHaveText('atlas-org/alpha');
  const skills = page.getByRole('navigation', { name: 'Skills' }).getByRole('button');
  await skills.filter({ hasText: 'gradle' }).click();
  await expect(chosen(page)).toHaveAccessibleName('gradle: SKILL.md');
  await page.mouse.move(2, 2);
  await expect(marked).toHaveText('atlas-org/gamma');
  await skills.filter({ hasText: 'commits' }).hover();
  await expect(marked).toHaveText('atlas-org/alpha');

  // Back over the system, its worlds are in the register, and the organization over them.
  await page.keyboard.press('Escape');
  await expect(system(page)).toHaveText('The system 2 worlds');
  await expect(worldButtons(page)).toHaveText([/^atlas-org\/alpha2 skills · nearest atlas-org\/gamma, \d+% alike$/, /^atlas-org\/gamma2 skills · nearest atlas-org\/alpha, \d+% alike$/]);
  const organization = page.getByRole('navigation', { name: 'Organizations' }).getByRole('button');
  await expect(organization).toHaveText('atlas-org 4 skills in 2 repositories');
  expect(new URL(page.url()).searchParams.get('view')).toBe('system');

  // One of its worlds, from close by: that repository's skills alone.
  await worldButtons(page).last().click();
  await expect(system(page)).toHaveText('atlas-org/gamma 2 skills');
  await expect(sky(page)).toHaveAttribute('data-view', 'world');
  await expect(page.locator('[data-place]')).toHaveText(['gradle', 'release']);
  await page.keyboard.press('Escape');

  // And the organization's skills again.
  await organization.click();
  await expect(system(page)).toHaveText('atlas-org 4 skills in 2 repositories');
  await expect(sky(page)).toHaveAttribute('data-view', 'system');
  expect(new URL(page.url()).searchParams.getAll('repo')[0]).toBe('https://github.com/atlas-org');
});

test('the filter, on the world: only the places of the skills listed are named', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await scan(page, 'https://github.com/JetBrains/atlas-demo');
  await expect(page.locator('[data-place]:not([data-out])')).toHaveText(['code-style', 'commits', 'release']);

  await filterField(page).fill('commit');
  await expect(page.locator('[data-place]:not([data-out])')).toHaveText(['commits']);
  await expect(page.locator('[data-place][data-out]')).toHaveText(['code-style', 'release']);
  await expect(page.locator('[data-place]').filter({ hasText: 'code-style' })).toBeHidden();
  // The first match is chosen, and its place turns to the front.
  await expect(page.locator('[data-place][data-chosen]')).toHaveText('commits');
  const slot = (await page.locator('.globe').boundingBox())!;
  const commits = await where(page, page.locator('[data-place][data-chosen]'));
  expect(Math.hypot(commits.x - (slot.x + slot.width / 2), commits.y - (slot.y + slot.height / 2))).toBeLessThan(Math.min(slot.width, slot.height) * 0.18);

  await filterField(page).fill('');
  await expect(page.locator('[data-place][data-out]')).toHaveCount(0);
});
