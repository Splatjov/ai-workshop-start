import type { Repository } from './model.ts';
import type { Source } from './scan.ts';

/**
 * Where the CLI keeps what it read of a repository between runs, by `<owner>/<repo>/<commit>`
 * (lower case). A commit never changes, so what was read at it never goes stale. Both may fail:
 * a store that cannot be read is a miss, one that cannot be written keeps nothing.
 */
export type ScanCache = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
};

/**
 * What a scan read at a commit: the repository, every SKILL.md as text (null: listed, but gone),
 * and the listing's warnings. `whole`: the listing was the whole tree, so it serves every scan of
 * the commit; else only a scan listed the same way (`listing`: code search, or the hint of a tree
 * too large to list), whose warnings and paths are the same.
 */
type Kept = {
  format: 1;
  repository: Repository;
  listing: string;
  whole: boolean;
  warnings: string[];
  files: { path: string; text: string | null }[];
};

export const cacheKey = (id: string, commit: string) => `${id}/${commit}`.toLowerCase();

/** The source as it was kept for this commit, when it serves this listing; read from the store, not GitHub. */
export async function kept(cache: ScanCache | undefined, id: string, commit: string, listing: string): Promise<Source | undefined> {
  if (!cache) return undefined;
  const record = parse(await cache.get(cacheKey(id, commit)).catch(() => undefined));
  if (!record || record.repository.commit !== commit || !(record.whole || record.listing === listing)) return undefined;
  const files = new Map(record.files.map((file) => [file.path, file.text]));
  return {
    repository: record.repository,
    paths: [...files.keys()],
    warnings: record.warnings,
    read: async (path) => {
      const text = files.get(path);
      return typeof text === 'string' ? new TextEncoder().encode(text) : undefined;
    },
  };
}

/** The source, which keeps what the scan reads in the store once it has read it all. */
export function keeping(cache: ScanCache | undefined, source: Source, listing: string, whole: boolean): Source {
  if (!cache) return source;
  const { repository, warnings } = source;
  return {
    ...source,
    keep: async (files) => {
      const record: Kept = { format: 1, repository, listing, whole, warnings, files: files.map(({ path, text }) => ({ path, text: text ?? null })) };
      await cache.set(cacheKey(repository.id, repository.commit), JSON.stringify(record)).catch(() => undefined);
    },
  };
}

/** A record as kept, or undefined for anything else: a missing, cut or foreign file is a miss. */
function parse(text: string | undefined): Kept | undefined {
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const record = value as Partial<Kept> | null;
  const repository = record?.repository as Partial<Repository> | undefined;
  const valid =
    record?.format === 1 &&
    typeof record.listing === 'string' &&
    typeof record.whole === 'boolean' &&
    Array.isArray(record.warnings) &&
    record.warnings.every((warning) => typeof warning === 'string') &&
    Array.isArray(record.files) &&
    record.files.every((file) => typeof file?.path === 'string' && (typeof file.text === 'string' || file.text === null)) &&
    ['id', 'organization', 'name', 'url', 'commit'].every((key) => typeof repository?.[key as keyof Repository] === 'string');
  return valid ? (record as Kept) : undefined;
}
