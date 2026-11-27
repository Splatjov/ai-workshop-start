#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr. What was read of a GitHub repository at a commit is kept in the cache directory.
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { diskCache } from './disk-cache.ts';
import { openDirectory } from './local.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const cache = diskCache();

process.exitCode = await run(process.argv.slice(2), {
  open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token, cache }) : openDirectory(input)),
  print: (text) => console.log(text),
  error: (text) => console.error(text),
});
