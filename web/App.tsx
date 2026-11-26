// The web view: a field for a repository or an organization link, a token, the skills with a
// filter, and the SKILL.md of the chosen one.
import { AlertTriangle, ExternalLink, FileText, FolderGit2, KeyRound, Search, Sparkles } from '@sketchyicons/react';
import {
  DrawablyAlert,
  DrawablyBadge,
  DrawablyButton,
  DrawablyCard,
  DrawablyHighlight,
  DrawablyInput,
} from 'drawably/react';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import type { RepositoryView, ScanOptions, ScanView, SkillView } from '../src/browser.ts';
import { filterSkills } from '../src/core/model.ts';

export type Backend = { scan(input: string, options?: ScanOptions): Promise<ScanView> };

const INK = '#1f3a8a';

/** Repositories with skills, one click away, for a first look. */
export const EXAMPLES = [
  'anthropics/skills',
  'obra/superpowers',
  'vercel-labs/agent-skills',
  'openai/codex',
  'huggingface/skills',
  'trailofbits/skills',
  'getsentry/skills',
  'JetBrains/kotlin',
  'JetBrains/koog',
] as const;

/** The repository in the page's address, `?repo=<URL>`, so a scan can be shared and reloaded. */
function repoInAddress(): string {
  return new URLSearchParams(window.location.search).get('repo') ?? '';
}

export function App({ backend }: { backend: Backend }) {
  const [input, setInput] = useState(repoInAddress);
  // Kept in the page's memory only: not in the address, not in storage.
  const [token, setToken] = useState('');
  const [filter, setFilter] = useState('');
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useState<ScanView>();
  const [selected, setSelected] = useState<string>();
  // Only the latest scan shows: an earlier one that answers later is dropped.
  const latest = useRef(0);

  async function scan(url: string) {
    if (!url.trim()) return;
    const id = ++latest.current;
    setScanning(true);
    const result = await backend.scan(url, { token });
    if (id !== latest.current) return;
    setView(result);
    setFilter('');
    setSelected(undefined);
    setScanning(false);
  }

  useEffect(() => {
    const url = repoInAddress();
    if (url) void scan(url);
  }, []);

  function scanAndShare(url: string) {
    const address = new URL(window.location.href);
    address.searchParams.set('repo', url.trim());
    window.history.replaceState(null, '', address);
    void scan(url);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    scanAndShare(input);
  }

  function pick(event: MouseEvent, url: string) {
    // Ctrl/Cmd-, Shift-, Alt-click: the browser's own (a new tab, a window, a download).
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setInput(url);
    scanAndShare(url);
  }

  return (
    <main>
      <header>
        <h1>
          <Sparkles size={32} color={INK} /> <DrawablyHighlight>Skill Atlas</DrawablyHighlight>
        </h1>
        <p>Every SKILL.md in a GitHub repository, or in all of an organization's.</p>
      </header>

      <form className="scan" onSubmit={submit} role="search">
        <label htmlFor="repo" className="visually-hidden">
          Repository link
        </label>
        <FolderGit2 size={28} color={INK} />
        <DrawablyInput
          id="repo"
          name="repo"
          type="text"
          inputMode="url"
          placeholder="https://github.com/owner/repo"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <DrawablyButton type="submit" variant="solid" state={scanning ? 'loading' : 'idle'} disabled={scanning}>
          <Search size={18} color="#fff" /> {scanning ? 'Scanning…' : 'Scan'}
        </DrawablyButton>
      </form>

      <div className="token">
        <label htmlFor="token">
          <KeyRound size={18} color={INK} /> GitHub token
        </label>
        <DrawablyInput
          id="token"
          name="token"
          type="password"
          placeholder="optional"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="token-hint"
        />
        <span id="token-hint">
          A higher rate limit: needed for most organizations. Sent to GitHub only, never stored.{' '}
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
            Create one
          </a>
          : read-only, public repositories.
        </span>
      </div>

      <nav className="examples" aria-label="Examples">
        <span>Try:</span>
        <ul>
          {EXAMPLES.map((id) => {
            const url = `https://github.com/${id}`;
            return (
              <li key={id}>
                <a href={`?repo=${encodeURIComponent(url)}`} onClick={(event) => pick(event, url)}>
                  {id}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {view && 'error' in view && (
        <DrawablyAlert role="alert" className="error" stroke="#b42318">
          <span data-tag>error</span> {view.error}
        </DrawablyAlert>
      )}

      {view && !('error' in view) && (
        <Result view={view} filter={filter} onFilter={setFilter} selected={selected} onSelect={setSelected} />
      )}
    </main>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function Result({
  view,
  filter,
  onFilter,
  selected,
  onSelect,
}: {
  view: Exclude<ScanView, { error: string }>;
  filter: string;
  onFilter(filter: string): void;
  selected?: string;
  onSelect(id: string): void;
}) {
  const organization = 'organization' in view ? view.organization : undefined;
  const repositories: RepositoryView[] = 'repositories' in view ? view.repositories : [view];
  const all = repositories.flatMap((repository) => repository.skills);
  // The repositories and the skills the filter leaves.
  const shown = repositories
    .map((repository) => ({ ...repository, skills: filterSkills(repository.skills, filter) }))
    .filter((repository) => repository.skills.length > 0);
  const skills = shown.flatMap((repository) => repository.skills);
  // The chosen skill, or else the first one shown.
  const chosen = skills.find((skill) => skill.id === selected) ?? skills[0];
  const count = skills.length === all.length ? `${all.length}` : `${skills.length} of ${all.length}`;
  return (
    <section aria-label="Scan result">
      <h2 className="repository">
        {'organization' in view ? (
          <a href={view.organization.url} target="_blank" rel="noreferrer">
            {view.organization.id}
          </a>
        ) : (
          <a href={`${view.repository.url}/tree/${view.repository.commit}`} target="_blank" rel="noreferrer">
            {view.repository.id}
          </a>
        )}{' '}
        <DrawablyBadge>
          {count} {all.length === 1 ? 'skill' : 'skills'}
          {organization && ` in ${plural(shown.length, 'repository', 'repositories')}`}
        </DrawablyBadge>
      </h2>

      {view.warnings.map((warning) => (
        <p className="warning" role="note" key={warning}>
          <AlertTriangle size={18} color="#b54708" />
          {warning}
        </p>
      ))}

      {all.length > 0 && (
        <div className="filter">
          <label htmlFor="filter" className="visually-hidden">
            Filter skills
          </label>
          <Search size={20} color={INK} />
          <DrawablyInput
            id="filter"
            name="filter"
            type="search"
            placeholder="Filter by name, description or path"
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      {all.length > 0 && skills.length === 0 && (
        <p className="nothing" role="status">
          No skill matches “{filter.trim()}”.
        </p>
      )}

      {skills.length > 0 && (
        <div className="atlas">
          <nav aria-label="Skills">
            {shown.map(({ repository, skills }) => (
              <section key={repository.id} aria-label={organization && repository.id}>
                {organization && (
                  <h3>
                    <a href={`${repository.url}/tree/${repository.commit}`} target="_blank" rel="noreferrer">
                      {repository.id}
                    </a>
                  </h3>
                )}
                <ul>
                  {skills.map((skill) => (
                    <li key={skill.id}>
                      <button
                        type="button"
                        aria-current={skill.id === chosen?.id ? 'true' : undefined}
                        onClick={() => onSelect(skill.id)}
                      >
                        <strong>{skill.name}</strong>
                        {skill.description && <span>{firstSentence(skill.description)}</span>}
                        <code>{skill.path}</code>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>

          {chosen && <Chosen key={chosen.id} skill={chosen} />}
        </div>
      )}
    </section>
  );
}

function Chosen({ skill }: { skill: SkillView }) {
  return (
    <DrawablyCard className="skill" aria-label={`${skill.name}: SKILL.md`} role="region">
      <h3>
        <FileText size={22} color={INK} /> {skill.name}
      </h3>
      {skill.description && <p>{skill.description}</p>}
      <p className="links">
        <a href={skill.link} target="_blank" rel="noreferrer">
          <ExternalLink size={16} color={INK} /> {skill.path}
        </a>
        {skill.copies.length > 0 && <span>also in {skill.copies.join(', ')}</span>}
      </p>
      <pre aria-label="SKILL.md">{skill.markdown}</pre>
    </DrawablyCard>
  );
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
