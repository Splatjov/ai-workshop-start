// spec/web.md, "Recordings and screenshots": the baselines are only right in the Playwright
// container they were made in, so CI, `npm run test:screenshots` and the installed Playwright
// must name the same one, and every screenshot the walkthrough takes must have its baseline.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const read = (path: string) => readFileSync(root(path), 'utf8');
const playwright: string = JSON.parse(read('package-lock.json')).packages['node_modules/@playwright/test'].version;

test('CI runs the web tests in the container of the installed Playwright, with the screenshots on', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, new RegExp(`image: mcr\\.microsoft\\.com/playwright:v${playwright.replaceAll('.', '\\.')}-noble\\n`));
  assert.match(ci, /SCREENSHOTS: '1'/);
  assert.match(ci, /npm run test:web/);
});

test('CI keeps the videos and the screenshot diffs, whether the run passed or not', () => {
  const ci = read('.github/workflows/ci.yml');
  const upload = ci.slice(ci.indexOf('actions/upload-artifact'));
  assert.match(upload, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(upload, /test-results\//);
  assert.match(upload, /playwright-report\//);
});

test('npm run test:screenshots takes the image tag from package-lock.json', () => {
  assert.equal(JSON.parse(read('package.json')).scripts['test:screenshots'], 'scripts/screenshots.sh');
  const script = read('scripts/screenshots.sh');
  assert.match(script, /packages\['node_modules\/@playwright\/test'\]\.version/);
  assert.match(script, /mcr\.microsoft\.com\/playwright:v\$VERSION-noble/);
  assert.match(script, /SCREENSHOTS=1/);
});

test('every screenshot of the walkthrough has a reviewed baseline', () => {
  const names = [...read('tests/web/walkthrough.spec.ts').matchAll(/screenshot\(page, '([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(names.length >= 5, `screenshots: ${names}`);
  for (const name of names) {
    assert.ok(existsSync(root(`tests/web/__screenshots__/walkthrough.spec.ts/${name}.png`)), `no baseline for ${name}`);
  }
});

test('every web test records a video, and the screenshots are compared only with SCREENSHOTS set', () => {
  const config = read('playwright.config.ts');
  assert.match(config, /^\s*video: 'on',$/m);
  assert.match(config, /^\s*ignoreSnapshots: !process\.env\.SCREENSHOTS,$/m);
});
