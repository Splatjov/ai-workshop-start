// spec/web.md, "Deployed": the Pages workflow builds the web view of main and deploys web/dist,
// and the built page loads everything by relative paths, so it works at /<repository>/.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('the Pages workflow deploys the build of main, on every push and by hand', () => {
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /push:\n\s+branches: \[main\]/);
  assert.match(pages, /workflow_dispatch:/);
  assert.match(pages, /pages: write/);
  assert.match(pages, /id-token: write/);
  assert.match(pages, /npm ci\n\s+- run: npm run web:build/);
  // Pages is turned on by a person, once: `enablement` needs a token other than GITHUB_TOKEN,
  // so the workflow neither asks for it nor passes a token of its own.
  assert.match(pages, /- uses: actions\/configure-pages@v\d+\n\s+- uses:/);
  assert.doesNotMatch(pages, /enablement/);
  assert.doesNotMatch(pages, /^\s+token:/m);
  assert.match(pages, /actions\/upload-pages-artifact@v\d+\n\s+with:\n\s+path: web\/dist/);
  assert.match(pages, /actions\/deploy-pages@v\d+/);
  assert.equal(JSON.parse(read('package.json')).scripts['web:build'], 'vite build web');
});

test('the built page loads its scripts and styles by relative paths, so any path serves it', () => {
  const out = mkdtempSync(join(tmpdir(), 'skill-atlas-pages-'));
  try {
    execFileSync(join(root, 'node_modules/.bin/vite'), ['build', 'web', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: root });
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#)/.test(u));
    assert.ok(urls.some((u) => u.endsWith('.js')), `a script: ${urls}`);
    for (const url of urls) assert.match(url, /^\.\//, `${url} is relative`);
    const assets = readdirSync(join(out, 'assets'));
    for (const url of urls.filter((u) => u.startsWith('./assets/'))) assert.ok(assets.includes(url.slice('./assets/'.length)), `${url} is built`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
