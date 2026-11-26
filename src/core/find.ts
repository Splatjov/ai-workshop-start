/** A skill found in a repository: its SKILL.md, its name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * Every file named exactly SKILL.md, named after its directory (a SKILL.md at the
 * root after the repository). Nothing is ignored; copies are merged later, by `mergeCopies`.
 */
export function findSkills(paths: string[], repositoryName: string): SkillFile[] {
  return paths
    .filter((path) => path.split('/').at(-1) === 'SKILL.md')
    .sort()
    .map((path) => ({ path, name: path.split('/').at(-2) ?? repositoryName, copies: [] }));
}

/**
 * The same file in several places is one skill: the first path by skill root, then by path,
 * keeps it, and the others become its copies. Files that differ stay separate skills.
 */
export function mergeCopies<T extends { file: SkillFile; text: string }>(read: T[]): T[] {
  const rank = (path: string) => {
    const index = SKILL_ROOTS.findIndex((root) => path.startsWith(`${root}/`));
    return index < 0 ? SKILL_ROOTS.length : index;
  };
  const ordered = [...read].sort(
    (a, b) => rank(a.file.path) - rank(b.file.path) || (a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : 0),
  );
  const byText = new Map<string, T>();
  for (const entry of ordered) {
    const first = byText.get(entry.text);
    if (first) first.file.copies.push(entry.file.path);
    else byText.set(entry.text, entry);
  }
  return [...byText.values()];
}
