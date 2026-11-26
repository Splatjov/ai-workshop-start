// qa/README.md: the standard test scripts the manual-qa skill follows. Each must be in the form
// it reads: a title, what it needs, and numbered steps, each with a Do and a See.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../qa/', import.meta.url));
const scripts = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
const index = readFileSync(`${dir}README.md`, 'utf8');

test('the scripts: filter, organization, errors, each listed in qa/README.md', () => {
  assert.deepEqual(scripts.sort(), ['errors.md', 'filter.md', 'organization.md']);
  for (const script of scripts) assert.match(index, new RegExp(`\\]\\(${script}\\)`), script);
});

for (const script of scripts) {
  test(`${script}: a title, Needs, and numbered steps from 1, each with a Do and a See`, () => {
    const text = readFileSync(`${dir}${script}`, 'utf8');
    assert.match(text, /^# \S/);
    assert.match(text, /^Needs: /m);
    const steps = text.split(/^(?=\d+\. )/m).slice(1);
    assert.ok(steps.length >= 3, `${steps.length} steps`);
    steps.forEach((s, i) => {
      assert.ok(s.startsWith(`${i + 1}. **Do:**`), `step ${i + 1}: ${s.slice(0, 40)}`);
      assert.match(s, /\*\*See:\*\*/, `step ${i + 1} has no See`);
    });
  });
}
