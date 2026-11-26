import { findSkills, mergeCopies, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths, source.repository.name);
  // The files are read at the same time: on GitHub, each one is a request.
  const read = await Promise.all(files.map(async (file) => ({ file, bytes: await source.read(file.path) })));
  const missing = read.flatMap(({ file, bytes }) =>
    bytes ? [] : [`${file.path}: listed, but not found at the scanned commit; skipped`],
  );
  const found = read.flatMap(({ file, bytes }) => (bytes ? [{ file, text: new TextDecoder().decode(bytes) }] : []));
  const results = mergeCopies(found).map(({ file, text }) => readSkill(source, file, text));
  return {
    repository: source.repository,
    skills: sortSkills(results.map((result) => result.skill)),
    warnings: [...source.warnings, ...missing, ...results.flatMap((result) => (result.warning ? [result.warning] : []))],
  };
}

function readSkill(source: Source, file: SkillFile, text: string): { skill: Skill; warning?: string } {
  const parsed = parseSkill(text);
  const skill: Skill = {
    id: `${source.repository.id}:${file.path}`,
    repository: source.repository.id,
    path: file.path,
    name: parsed.name ?? file.name,
    description: parsed.description,
    commit: source.repository.commit,
    copies: file.copies,
  };
  return { skill, warning: parsed.warning && `${file.path}: ${parsed.warning}` };
}
