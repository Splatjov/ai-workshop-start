// The browser entry: the same commands, printed into the page, and the same scan as data for the
// web view, over live GitHub, with the token the page was given, if any. No Node APIs here.
import { run } from './commands.ts';
import { AtlasError } from './core/errors.ts';
import { openGitHub, type Fetch, type TokenSource } from './core/github.ts';
import { skillLink, type Organization, type Repository, type Skill } from './core/model.ts';
import { pooled, scan, type Source } from './core/scan.ts';

export type BrowserOptions = {
  /** Live GitHub; the page's own fetch by default. */
  fetch?: Fetch;
};

/** A skill as the web view shows it: its pinned link and its SKILL.md, as scanned. */
export type SkillView = Skill & { link: string; markdown: string };

/** One scanned repository, as the web view shows it. */
export type RepositoryView = { repository: Repository; skills: SkillView[]; warnings: string[] };

/** An organization's repositories that have skills; each warning names its repository. */
export type OrganizationView = { organization: Organization; repositories: RepositoryView[]; warnings: string[] };

/** One scan for the web view: the result, or the message the CLI would print and exit 1 on. */
export type ScanView = RepositoryView | OrganizationView | { error: string };

export type ScanOptions = {
  /** A GitHub token: a higher rate limit, and code search. It goes to GitHub only. */
  token?: string;
};

/** The page has no environment: its messages name the field the token is typed into. */
const TOKEN_FIELD: TokenSource = { name: 'the GitHub token field', set: 'fill in the GitHub token field' };

export function createBrowserBackend(options: BrowserOptions = {}) {
  const live = options.fetch ?? ((url, init) => fetch(url, init));
  const open = (input: string, token?: string) =>
    openGitHub(input, { fetch: live, token: token?.trim() || undefined, tokenSource: TOKEN_FIELD });

  /** The scan, with each skill's link and the SKILL.md text the scan read. */
  async function view(opened: Source): Promise<RepositoryView> {
    const source = remember(opened);
    const result = await scan(source);
    const skills = await Promise.all(
      result.skills.map(async (skill) => ({
        ...skill,
        link: skillLink(result.repository, skill),
        markdown: new TextDecoder().decode(await source.read(skill.path)),
      })),
    );
    return { repository: result.repository, skills, warnings: result.warnings };
  }

  return {
    /** Runs a typed command line, such as `skill-atlas scan <URL>`, and returns what it printed. */
    async run(commandLine: string): Promise<string> {
      const output: string[] = [];
      const write = (text: string) => output.push(text);
      try {
        await run(words(commandLine), { open, print: write, error: write });
      } catch (error) {
        write(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return output.join('\n');
    },

    /** Scans a GitHub repository, or an organization's repositories; each skill keeps the SKILL.md text the scan read. */
    async scan(input: string, { token }: ScanOptions = {}): Promise<ScanView> {
      try {
        const opened = await open(input.trim(), token);
        if (!('repositories' in opened)) return await view(opened);
        const views = await pooled(opened.repositories, 8, view);
        views.sort((a, b) => (a.repository.id < b.repository.id ? -1 : a.repository.id > b.repository.id ? 1 : 0));
        return {
          organization: opened.organization,
          repositories: views.filter((repository) => repository.skills.length > 0),
          warnings: [
            ...opened.warnings,
            ...views.flatMap((repository) => repository.warnings.map((warning) => `${repository.repository.id}: ${warning}`)),
          ],
        };
      } catch (error) {
        if (error instanceof AtlasError) return { error: error.message };
        return { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  };
}

/** The same source, each file read once: the text shown is the text scanned. */
function remember(source: Source): Source {
  const files = new Map<string, Promise<Uint8Array | undefined>>();
  return {
    ...source,
    read(path) {
      if (!files.has(path)) files.set(path, source.read(path));
      return files.get(path)!;
    },
  };
}

/** The words of a command line; the leading `$` and `skill-atlas` are optional. */
function words(commandLine: string): string[] {
  const words = commandLine.trim().split(/\s+/).filter(Boolean);
  if (words[0] === '$') words.shift();
  if (words[0] === 'skill-atlas') words.shift();
  return words;
}
