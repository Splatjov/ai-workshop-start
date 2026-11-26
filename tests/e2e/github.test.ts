// End to end: the real CLI against real GitHub repositories, each pinned to a commit so the answer
// never changes. Needs the network; GITHUB_TOKEN, if set, raises the rate limit. `npm run test:e2e`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { CLI } from '../helpers.ts';

function scan(url: string) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [CLI, 'scan', url], { encoding: 'utf8', timeout: 60_000 });
  return { ...result, seconds: (performance.now() - started) / 1000 };
}

test('JetBrains/koog at 709079e: skills in .claude/skills and deep in the test resources', () => {
  const commit = '709079e4a34d6c9234583352550e6a2b88a0bb85';
  const blob = `https://github.com/JetBrains/koog/blob/${commit}`;
  const result = scan(`https://github.com/JetBrains/koog/tree/${commit}`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'JetBrains/koog · 4 skills',
      'add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples to mkdocs docs that already have Kotlin examples (files under docs/docs/**.md using === "Kotlin" / Knit INCLUDE+SUFFIX blocks).',
      `  ${blob}/.claude/skills/add-java-code-snippets-in-docs/SKILL.md`,
      'arithmetic-evaluator — Evaluate arithmetic expressions and return numeric results.',
      `  ${blob}/integration-tests/src/jvmTest/resources/skills/arithmetic-evaluator/SKILL.md`,
      'split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.',
      `  ${blob}/.claude/skills/split-jvm-nonjvm/SKILL.md`,
      'weather-retrieval — Retrieve current weather information for a specific location.',
      `  ${blob}/integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md`,
      '',
    ].join('\n'),
  );
  assert.equal(result.stderr, '');
});

test('JetBrains/android at 294d4c0: a tree too large for one answer, under 10 s', () => {
  const result = scan('https://github.com/JetBrains/android/tree/294d4c098cb833f7a457cd891a125de82d4e1715');
  assert.equal(result.status, 0, result.stderr);
  // Its only candidate, automation/sponge-scripts/skill.md, is not named SKILL.md.
  assert.equal(result.stdout, 'JetBrains/android · 0 skills\n');
  assert.equal(
    result.stderr,
    'warning: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills (code search sees only the default branch)\n',
  );
  assert.ok(result.seconds < 10, `took ${result.seconds.toFixed(1)} s`);
});
