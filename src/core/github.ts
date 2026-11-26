import { AtlasError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import { pooled, type OrganizationSource, type Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** With a token, skills are found through code search where it reaches; without it, through the tree. */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`;
 * `https://github.com/owner/repo/tree/<ref>` for a commit, a branch or a tag; or
 * `https://github.com/owner`, without a repository, for all of an organization's or a user's.
 */
export function parseGitHubUrl(input: string): { owner: string; repo?: string; ref?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)(?:\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^?#]+?))?)?\/?$/i.exec(input.trim());
  if (!match) return undefined;
  const [, owner, repo, ref] = match;
  return { owner, ...(repo && { repo }), ...(ref && { ref }) };
}

/** A repository at its ref, or else its default branch; or every repository of an organization. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source | OrganizationSource> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  if (!name.repo) return openOrganization(github, name.owner, options);
  const info = await github.json<RepositoryInfo>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  return openRepository(github, info, name.ref, options);
}

type RepositoryInfo = { full_name: string; default_branch: string };

/**
 * Resolves the ref, or else the default branch, to a commit and lists the files that may be skills.
 * `covered`: whether code search knows the repository; it does not when archived or long inactive.
 */
async function openRepository(github: Client, info: RepositoryInfo, ref: string | undefined, options: GitHubOptions, covered = true): Promise<Source> {
  const id = info.full_name;
  const { sha } = await github.json<{ sha: string }>(
    `${API}/repos/${id}/commits/${encodePath(ref ?? info.default_branch)}`,
    `Not found in https://github.com/${id}: ${ref ?? info.default_branch}`,
  );
  const warnings: string[] = [];
  // Code search sees only the default branch: another ref is listed through its tree.
  const search = Boolean(options.token) && !ref && covered;
  const hint = ref
    ? 'code search sees only the default branch'
    : options.token
      ? 'code search does not cover this repository'
      : 'GITHUB_TOKEN searches everywhere';
  const paths = search ? await searchPaths(github, id) : await treePaths(github, id, sha, warnings, hint);
  return source(github, id, sha, paths, warnings);
}

function source(github: Client, id: string, sha: string, paths: string[], warnings: string[]): Source {
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/** How many of an organization's repositories are asked about at the same time. */
const AT_ONCE = 8;

/**
 * Every repository of an organization, or of a user, at its default branch: the repository list,
 * then each one's tree. With a token, one code search over all of them first, and the tree only
 * of those it does not answer for. Forks are not scanned.
 */
async function openOrganization(github: Client, owner: string, options: GitHubOptions): Promise<OrganizationSource> {
  const { login } = await github.json<{ login: string }>(
    `${API}/users/${owner}`,
    `Organization not found: https://github.com/${owner}`,
  );
  const warnings: string[] = [];
  const listed = await listOrganization(github, login);
  const searched = options.token ? await searchOrganization(github, login, warnings) : [];
  // Code search leaves out archived and long inactive repositories: their trees are read, as without a token.
  const known = new Set(searched.map((found) => found.repository.id));
  const rest = listed.filter((repository) => !repository.fork && !known.has(repository.full_name));
  const repositories = [...searched, ...(await openListed(github, rest, options))];
  return { organization: { id: login, url: `https://github.com/${login}` }, repositories, warnings };
}

/** Code search over all of the owner's repositories: only those with a SKILL.md come back. */
async function searchOrganization(github: Client, login: string, warnings: string[]): Promise<Source[]> {
  const found = await searchCode<{ path: string; repository: { full_name: string } }>(github, `user:${login}`, warnings);
  const paths = new Map<string, Set<string>>(); // pages can repeat a result
  for (const item of found) {
    const id = item.repository.full_name;
    paths.set(id, (paths.get(id) ?? new Set()).add(item.path));
  }
  return pooled([...paths], AT_ONCE, async ([id, files]) => {
    const { sha } = await github.json<{ sha: string }>(`${API}/repos/${id}/commits/HEAD`);
    return source(github, id, sha, [...files], []);
  });
}

type ListedRepository = RepositoryInfo & { fork: boolean };

/** Every repository the owner has, forks included, 100 a page. */
async function listOrganization(github: Client, login: string): Promise<ListedRepository[]> {
  const repositories: ListedRepository[] = [];
  for (let page = 1; ; page++) {
    const answer = await github.json<ListedRepository[]>(`${API}/users/${login}/repos?per_page=100&page=${page}`);
    repositories.push(...answer);
    if (answer.length < 100) break;
  }
  return repositories;
}

/** Each repository listed through its tree; empty ones are left out. */
async function openListed(github: Client, repositories: RepositoryInfo[], options: GitHubOptions): Promise<Source[]> {
  const sources = await pooled(repositories, AT_ONCE, (info) =>
    openRepository(github, info, undefined, options, false).catch((error: unknown) => {
      if (error instanceof EmptyRepository) return undefined;
      throw error;
    }),
  );
  return sources.filter((opened) => opened !== undefined);
}

/** A repository without a commit: nothing to scan. */
class EmptyRepository extends AtlasError {}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const found = await searchCode<{ path: string }>(github, `repo:${id}`, []);
  return [...new Set(found.map((item) => item.path))]; // pages can repeat a result
}

/** Every file named SKILL.md in `scope`, a `repo:` or a `user:` qualifier. */
async function searchCode<T>(github: Client, scope: string, warnings: string[]): Promise<T[]> {
  const items: T[] = [];
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: T[] }>(
      `${API}/search/code?q=filename:SKILL.md+${scope}&per_page=100&page=${page}`,
    );
    items.push(...result.items);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
    if (page === 10) warnings.push(`code search answers with at most 1000 files of ${result.total_count}; the rest are not scanned`);
  }
  return items;
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[], hint: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')} (${hint})`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new AtlasError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    const response = await get(url, { headers });
    if (response.ok) return response.json();
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    if (response.status === 404) throw new AtlasError(notFound);
    if (response.status === 409 && /empty/i.test(text)) throw new EmptyRepository(`Repository is empty: ${url}`);
    if ((response.status === 403 || response.status === 429) && /rate limit/i.test(text)) {
      throw new AtlasError(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
    }
    if (response.status === 401) throw new AtlasError('GitHub rejected the token in GITHUB_TOKEN');
    throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
