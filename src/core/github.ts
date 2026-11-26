import { AtlasError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import { pooled, type OrganizationSource, type Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** With a token, skills are found through code search where it reaches; without it, through the tree. */
  token?: string;
  /** Where the user gives the token, as the messages name it; the CLI's `GITHUB_TOKEN` by default. */
  tokenSource?: TokenSource;
};

/**
 * `name`: "GitHub rejected the token in <name>"; `set`: "GitHub rate limit reached; <set>";
 * `search`: the hint of the warning for a tree too large to list without a token.
 */
export type TokenSource = { name: string; set: string; search: string };

const ENVIRONMENT: TokenSource = { name: 'GITHUB_TOKEN', set: 'set GITHUB_TOKEN', search: 'GITHUB_TOKEN searches everywhere' };

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
      : (options.tokenSource ?? ENVIRONMENT).search;
  const paths = search ? await searchPaths(github, id) : (await treePaths(github, id, sha, warnings, hint)).paths;
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
 * Every repository of an organization, or of a user, at its default branch. Forks are not
 * scanned. Without a token, each one's tree. With one, only the trees of the repositories that
 * may have skills: those code search answers for, and those with a skill folder at a usual place.
 */
async function openOrganization(github: Client, owner: string, options: GitHubOptions): Promise<OrganizationSource> {
  const { login, public_repos } = await github.json<{ login: string; public_repos?: number }>(
    `${API}/users/${owner}`,
    `Organization not found: https://github.com/${owner}`,
  );
  const warnings: string[] = [];
  const listed = (await listOrganization(github, login, public_repos ?? 0)).filter((repository) => !repository.fork);
  const repositories = options.token
    ? await openCandidates(github, login, listed, warnings)
    : await pooled(listed, AT_ONCE, (info) => openListed(github, info, options));
  return {
    organization: { id: login, url: `https://github.com/${login}` },
    repositories: repositories.filter((opened) => opened !== undefined),
    warnings,
  };
}

type ListedRepository = RepositoryInfo & { fork: boolean };

/** Every repository the owner has, forks included, 100 a page; the pages are asked for together. */
async function listOrganization(github: Client, login: string, count: number): Promise<ListedRepository[]> {
  const page = (number: number) => github.json<ListedRepository[]>(`${API}/users/${login}/repos?per_page=100&page=${number}`);
  const numbers = Array.from({ length: Math.max(1, Math.ceil(count / 100)) }, (_, index) => index + 1);
  const pages = await pooled(numbers, AT_ONCE, page);
  // More repositories than the owner's count said: go on, page by page.
  while (pages.at(-1)!.length === 100) pages.push(await page(pages.length + 1));
  return pages.flat();
}

/**
 * Without a token, one request for a repository without skills: its tree, by the branch's name.
 * Only one with a SKILL.md is asked for its commit too. Empty repositories are left out.
 */
async function openListed(github: Client, info: RepositoryInfo, options: GitHubOptions): Promise<Source | undefined> {
  const id = info.full_name;
  try {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`).catch((error: unknown) => {
      if (error instanceof EmptyRepository) throw error;
      return undefined; // asked again below, by the commit
    });
    if (tree && !tree.truncated) {
      const paths = files(tree);
      if (!paths.some(isSkill)) return undefined;
      const commit = await github.json<{ sha: string; commit: { tree: { sha: string } } }>(
        `${API}/repos/${id}/commits/${encodePath(info.default_branch)}`,
      );
      // The same tree: nothing was pushed in between. Asked for by a branch, GitHub answers
      // with the commit's sha, not the tree's.
      if (tree.sha === commit.sha || tree.sha === commit.commit.tree.sha) return source(github, id, commit.sha, paths, []);
    }
    // A tree too large for one answer, a branch the tree cannot be asked for by name, a push in between.
    return await openRepository(github, info, undefined, options, false);
  } catch (error) {
    if (error instanceof EmptyRepository) return undefined;
    throw error;
  }
}

const isSkill = (path: string) => path.split('/').at(-1) === 'SKILL.md';

/** Where a repository with skills usually has them, from its top: one of these is there. */
const PROBES = ['SKILL.md', 'skills', ...SKILL_ROOTS];

/** How many repositories one GraphQL request asks about: more, and GitHub does not answer in time. */
const PROBED_AT_ONCE = 25;

type Probed = {
  nameWithOwner: string;
  isEmpty: boolean;
  defaultBranchRef: { target: { oid: string } } | null;
} & Record<string, unknown>;

/**
 * With a token: one code search over all the repositories, and for each 25 of them one request
 * that says their commit and whether a usual skill place is there. Only a repository with either
 * is read, whole, through its tree; the others cost no request of their own.
 */
async function openCandidates(github: Client, login: string, listed: ListedRepository[], warnings: string[]): Promise<(Source | undefined)[]> {
  const batches: ListedRepository[][] = [];
  for (let index = 0; index < listed.length; index += PROBED_AT_ONCE) batches.push(listed.slice(index, index + PROBED_AT_ONCE));
  const [searched, probed] = await Promise.all([
    searchOrganization(github, login, warnings),
    pooled(batches, AT_ONCE, (batch) => probe(github, batch)),
  ]);
  const candidates = probed.flat().filter(
    (repository) =>
      !repository.isEmpty &&
      repository.defaultBranchRef &&
      (searched.has(repository.nameWithOwner) || PROBES.some((_, index) => repository[`p${index}`])),
  );
  return pooled(candidates, AT_ONCE, async (repository) => {
    const id = repository.nameWithOwner;
    const sha = repository.defaultBranchRef!.target.oid;
    const own: string[] = [];
    const { paths, whole } = await treePaths(github, id, sha, own, 'and where code search finds a SKILL.md');
    // A tree listed whole has every file, and the search's index may be behind it. Code search
    // adds only what a tree too large to list leaves out.
    return source(github, id, sha, whole ? paths : [...new Set([...paths, ...(searched.get(id) ?? [])])], own);
  });
}

/** One GraphQL request for a batch; a batch GitHub cannot answer in time is asked for in halves. */
async function probe(github: Client, batch: ListedRepository[]): Promise<Probed[]> {
  const places = PROBES.map((path, index) => `p${index}:object(expression:${JSON.stringify(`HEAD:${path}`)}){__typename}`).join(' ');
  const repositories = batch.map((repository, index) => {
    const [owner, name] = repository.full_name.split('/');
    return `r${index}:repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){nameWithOwner isEmpty defaultBranchRef{target{oid}} ${places}}`;
  });
  try {
    const data = await github.graphql<Record<string, Probed | null>>(`{${repositories.join(' ')}}`);
    // Null: a repository that went away since it was listed.
    return Object.values(data).filter((repository) => repository !== null);
  } catch (error) {
    if (!(error instanceof TimedOut) || batch.length === 1) throw error;
    const half = Math.ceil(batch.length / 2);
    return (await Promise.all([probe(github, batch.slice(0, half)), probe(github, batch.slice(half))])).flat();
  }
}

/** Code search over all of the owner's repositories: the SKILL.md paths it knows, by repository. */
async function searchOrganization(github: Client, login: string, warnings: string[]): Promise<Map<string, Set<string>>> {
  const found = await searchCode<{ path: string; repository: { full_name: string } }>(github, `user:${login}`, warnings);
  const paths = new Map<string, Set<string>>(); // pages can repeat a result
  for (const item of found) {
    const id = item.repository.full_name;
    paths.set(id, (paths.get(id) ?? new Set()).add(item.path));
  }
  return paths;
}

/** GitHub gave up on a request that took it too long. */
class TimedOut extends AtlasError {}

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
    if (page === 10) warnings.push(`code search answers with at most 1000 files of ${result.total_count}; a repository among the rest is scanned only with a skill folder at a usual place`);
  }
  return items;
}

type Tree = { sha: string; truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer: not `whole`. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[], hint: string): Promise<{ paths: string[]; whole: boolean }> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return { paths: files(tree), whole: true };
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')} (${hint})`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return { paths, whole: false };
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

function client({ fetch, token, tokenSource = ENVIRONMENT }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: Parameters<Fetch>[1]): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new AtlasError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  /** The answer, when GitHub gives one; its headers say when a limit resets. */
  async function send(url: string, notFound: string, post?: string): Promise<Response> {
    const response = await get(url, post === undefined ? { headers } : { method: 'POST', headers, body: post });
    if (response.ok) return response;
    if (response.status === 502 || response.status === 504) throw new TimedOut(`GitHub answered ${response.status} for ${url}`);
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    if (response.status === 404) throw new AtlasError(notFound);
    if (response.status === 409 && /empty/i.test(text)) throw new EmptyRepository(`Repository is empty: ${url}`);
    if ((response.status === 403 || response.status === 429) && /rate limit/i.test(text)) {
      throw new AtlasError(`GitHub rate limit reached; ${token ? `try again in ${wait(response)}` : tokenSource.set}`);
    }
    if (response.status === 401) throw new AtlasError(`GitHub rejected the token in ${tokenSource.name}`);
    throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    return (await send(url, notFound)).json();
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A GraphQL answer's data; needs a token. */
    async graphql<T>(query: string): Promise<T> {
      const url = `${API}/graphql`;
      const response = await send(url, `Not found on GitHub: ${url}`, JSON.stringify({ query }));
      const answer = (await response.json()) as {
        data?: T;
        errors?: { type?: string; message?: string }[];
      };
      if (answer.data) return answer.data;
      const [error] = answer.errors ?? [];
      // A used-up limit is a 200 here, with the headers of a REST answer past its limit.
      if (error?.type === 'RATE_LIMITED') throw new AtlasError(`GitHub rate limit reached; try again in ${wait(response)}`);
      throw new AtlasError(`GitHub answered ${url} with an error${error?.message ? `: ${error.message}` : ''}`);
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

/**
 * How long until GitHub answers again. A limit that is used up (the token's 5000 requests an
 * hour, code search's ten a minute) says when it resets; any other is over in a minute.
 */
function wait(response: Response): string {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (response.headers.get('x-ratelimit-remaining') !== '0' || !reset) return 'a minute';
  const minutes = Math.ceil((reset * 1000 - Date.now()) / 60_000);
  return minutes > 1 ? `${minutes} minutes` : 'a minute';
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
