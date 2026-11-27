// Skills grouped by theme, from the words their names and descriptions share (spec/analysis.md,
// "Themes"). Offline and deterministic: the same skills give the same groups on every run.
import { sortSkills, type Skill } from './model.ts';

/** A group of skills; `Other` holds the skills no theme word took. */
export type Theme<T> = { title: string; skills: T[] };

export const OTHER = 'Other';

/** Common words: no theme. Compared before and after the final `s` is dropped. */
const COMMON = new Set(
  `about above across after again against all along also always among and any are aren around
  because been before behind being below between beyond both but can cannot could did does doing
  done down during each either else etc
  every few for from further had has have having here how into its itself just let like make
  makes many may more most much must need needs not now off once one only other others our out
  over own per same should since some such than that the their them then there these they this
  those through too toward towards under unless until upon very via was way were what when
  whenever where whether which while who whom why will with within without would yes yet you your
  agent agents ask asks asked claude request requests skill skills task tasks use used uses using
  user users want wants`.split(/\s+/),
);

/**
 * A skill's words: of its name and description, without short, numeric and common ones; no final
 * s, and not what is then short or common (`PRs` goes as `PR` does).
 */
export function words(skill: Pick<Skill, 'name' | 'description'>): Set<string> {
  const found = new Set<string>();
  for (let word of `${skill.name} ${skill.description}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 3 || /^\p{N}+$/u.test(word) || COMMON.has(word)) continue;
    if (/[^siu]s$/.test(word)) word = word.slice(0, -1);
    if (word.length >= 3 && !COMMON.has(word)) found.add(word);
  }
  return found;
}

const alphabetically = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The skills by theme: the groups as they were made, then `Other`; in each, by name. */
export function groupByTheme<T extends Skill>(skills: T[]): Theme<T>[] {
  const of = new Map(skills.map((skill) => [skill, words(skill)]));
  const count = new Map<string, number>();
  for (const found of of.values()) for (const word of found) count.set(word, (count.get(word) ?? 0) + 1);
  // A word nearly every skill has is no theme: at most half of them, or 2.
  const most = Math.max(2, Math.floor(skills.length / 2));
  const themeWords = [...count].filter(([, n]) => n >= 2 && n <= most).map(([word]) => word).sort(alphabetically);

  const groups: Theme<T>[] = [];
  let left = sortSkills(skills);
  for (;;) {
    let best: { word: string; skills: T[] } | undefined;
    for (const word of themeWords) {
      const having = left.filter((skill) => of.get(skill)!.has(word));
      if (having.length >= 2 && having.length > (best?.skills.length ?? 0)) best = { word, skills: having };
    }
    if (!best) break;
    const { word, skills: taken } = best;
    const shared = themeWords.filter((other) => other !== word && taken.every((skill) => of.get(skill)!.has(other)));
    groups.push({ title: [word, ...shared.slice(0, 2)].join(' · '), skills: taken });
    left = left.filter((skill) => !taken.includes(skill));
  }
  if (left.length > 0) groups.push({ title: OTHER, skills: left });
  return groups;
}
