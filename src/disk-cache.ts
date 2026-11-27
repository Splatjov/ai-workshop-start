import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import type { ScanCache } from './core/cache.ts';

/** `$XDG_CACHE_HOME/skill-atlas`, or `~/.cache/skill-atlas`; a relative XDG_CACHE_HOME is ignored, as the XDG spec says. */
export function cacheDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CACHE_HOME && isAbsolute(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : join(homedir(), '.cache');
  return join(base, 'skill-atlas');
}

/** One JSON file a commit: `<directory>/<owner>/<repo>/<commit>.json`. A key it cannot place is never kept. */
export function diskCache(directory = cacheDirectory()): ScanCache {
  const file = (key: string) => {
    const parts = key.split('/');
    const safe = parts.length === 3 && parts.every((part) => /^[\w.-]+$/.test(part) && !/^\.+$/.test(part));
    return safe ? `${join(directory, ...parts)}.json` : undefined;
  };
  return {
    async get(key) {
      const path = file(key);
      return path === undefined ? undefined : readFile(path, 'utf8').catch(() => undefined);
    },
    async set(key, value) {
      const path = file(key);
      if (path === undefined) return;
      // Written whole, then moved in place: a run that stops halfway leaves no cut file behind.
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(temporary, value);
        await rename(temporary, path);
      } catch {
        // Nothing kept: the next scan asks GitHub again.
      }
    },
  };
}
