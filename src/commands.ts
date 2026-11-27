// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { filterSkills, skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, scanOrganization, type OrganizationSource, type ScanResult, type Source } from './core/scan.ts';
import { groupByTheme } from './core/themes.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source | OrganizationSource>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory> [--filter <words>] [--group]
        find every SKILL.md in a repository and print it;
        github.com/<owner>, without a repository: in all of an organization's;
        --filter: only the skills with every word in their name, description or path;
        --group: the skills by theme, from the words they share
  help  show this help

GITHUB_TOKEN, in the environment: a higher GitHub rate limit, and code search.`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

const scanUsage = 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>] [--group]';

async function scanCommand(args: string[], context: Context) {
  const { target, filter, group } = scanArguments(args);
  const opened = await context.open(target);
  if ('repositories' in opened && group) {
    const result = await scanOrganization(opened);
    const all = result.repositories.flatMap((repository) => repository.skills);
    const shown = filterSkills(all, filter);
    const repositories = new Set(shown.map((skill) => skill.repository)).size;
    context.print(`${result.organization.id} · ${count(shown.length, all.length)} in ${repositories} ${repositories === 1 ? 'repository' : 'repositories'}`);
    printThemes(shown, result.repositories.map((scanned) => scanned.repository), context);
    for (const warning of result.warnings) context.error(`warning: ${warning}`);
  } else if ('repositories' in opened) {
    const result = await scanOrganization(opened);
    const shown = result.repositories
      .map((repository) => ({ ...repository, shown: filterSkills(repository.skills, filter) }))
      .filter((repository) => repository.shown.length > 0);
    const all = result.repositories.reduce((sum, repository) => sum + repository.skills.length, 0);
    const matching = shown.reduce((sum, repository) => sum + repository.shown.length, 0);
    const repositories = shown.length === 1 ? 'repository' : 'repositories';
    context.print(`${result.organization.id} · ${count(matching, all)} in ${shown.length} ${repositories}`);
    for (const repository of shown) {
      context.print('');
      printRepository(repository, repository.shown, context);
    }
    for (const warning of result.warnings) context.error(`warning: ${warning}`);
  } else {
    const result = await scan(opened);
    const shown = filterSkills(result.skills, filter);
    if (group) {
      context.print(`${result.repository.id} · ${count(shown.length, result.skills.length)}`);
      printThemes(shown, [result.repository], context);
    } else printRepository(result, shown, context);
    for (const warning of result.warnings) context.error(`warning: ${warning}`);
  }
}

/** The one thing to scan; after `--filter` or in `--filter=`, the words to filter by; `--group`. */
function scanArguments(args: string[]): { target: string; filter: string; group: boolean } {
  const targets: string[] = [];
  let filter = '';
  let group = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--filter') {
      if (++index >= args.length) throw new AtlasError(scanUsage);
      filter = args[index];
    } else if (arg.startsWith('--filter=')) filter = arg.slice('--filter='.length);
    else if (arg === '--group') group = true;
    else if (arg.startsWith('--')) throw new AtlasError(`Unknown option: ${arg}\n${scanUsage}`);
    else targets.push(arg);
  }
  if (targets.length !== 1) throw new AtlasError(scanUsage);
  return { target: targets[0], filter, group };
}

/** `N skills`, or `M of N skills` when a filter left some out. */
function count(shown: number, all: number): string {
  return `${shown === all ? all : `${shown} of ${all}`} ${all === 1 ? 'skill' : 'skills'}`;
}

/** `<owner>/<repo> · N skills`, then each shown skill. */
function printRepository({ repository, skills }: ScanResult, shown: Skill[], context: Context) {
  context.print(`${repository.id} · ${count(shown.length, skills.length)}`);
  for (const skill of shown) printSkill(repository, skill, context);
}

/** Each theme after a blank line, `<title> · N skills`, then its skills (spec/cli.md, "Themes"). */
function printThemes(skills: Skill[], repositories: Repository[], context: Context) {
  const byId = new Map(repositories.map((repository) => [repository.id, repository]));
  for (const theme of groupByTheme(skills)) {
    context.print('');
    context.print(`${theme.title} · ${count(theme.skills.length, theme.skills.length)}`);
    for (const skill of theme.skills) printSkill(byId.get(skill.repository)!, skill, context);
  }
}

/** A skill's name and first sentence, its link, and its copies. */
function printSkill(repository: Repository, skill: Skill, { print }: Context) {
  print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
  print(`  ${skillLink(repository, skill)}`);
  if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
