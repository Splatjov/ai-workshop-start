// The browser entry: the same commands, printed into the page, and the same scan as data for the
// web view, over live GitHub without a token. No Node APIs here.
import { run } from './commands.ts';
import { AtlasError } from './core/errors.ts';
import { openGitHub, type Fetch } from './core/github.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

export type BrowserOptions = {
  /** Live GitHub; the page's own fetch by default. */
  fetch?: Fetch;
};

/** A skill as the web view shows it: its pinned link and its SKILL.md, as scanned. */
export type SkillView = Skill & { link: string; markdown: string };

/** One scan for the web view: the result, or the message the CLI would print and exit 1 on. */
export type ScanView =
  | { repository: Repository; skills: SkillView[]; warnings: string[] }
  | { error: string };

export function createBrowserBackend(options: BrowserOptions = {}) {
  const live = options.fetch ?? ((url, init) => fetch(url, init));
  const open = (input: string) => openGitHub(input, { fetch: live });

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

    /** Scans a GitHub repository URL; each skill keeps the SKILL.md text the scan read. */
    async scan(input: string): Promise<ScanView> {
      try {
        const source = remember(await open(input.trim()));
        const result = await scan(source);
        const skills = await Promise.all(
          result.skills.map(async (skill) => ({
            ...skill,
            link: skillLink(result.repository, skill),
            markdown: new TextDecoder().decode(await source.read(skill.path)),
          })),
        );
        return { repository: result.repository, skills, warnings: result.warnings };
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
