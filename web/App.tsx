// The web view: a field for a repository link, its skills, and the SKILL.md of the chosen one.
import { AlertTriangle, ExternalLink, FileText, FolderGit2, Search, Sparkles } from '@sketchyicons/react-native';
import {
  DrawablyAlert,
  DrawablyBadge,
  DrawablyButton,
  DrawablyCard,
  DrawablyHighlight,
  DrawablyInput,
} from 'drawably/react';
import { useEffect, useState, type FormEvent } from 'react';
import type { ScanView, SkillView } from '../src/browser.ts';

export type Backend = { scan(input: string): Promise<ScanView> };

const INK = '#1f3a8a';

/** The repository in the page's address, `?repo=<URL>`, so a scan can be shared and reloaded. */
function repoInAddress(): string {
  return new URLSearchParams(window.location.search).get('repo') ?? '';
}

export function App({ backend }: { backend: Backend }) {
  const [input, setInput] = useState(repoInAddress);
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useState<ScanView>();
  const [selected, setSelected] = useState<string>();

  async function scan(url: string) {
    if (!url.trim()) return;
    setScanning(true);
    const result = await backend.scan(url);
    setView(result);
    setSelected('skills' in result ? result.skills[0]?.id : undefined);
    setScanning(false);
  }

  useEffect(() => {
    const url = repoInAddress();
    if (url) void scan(url);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const address = new URL(window.location.href);
    address.searchParams.set('repo', input.trim());
    window.history.replaceState(null, '', address);
    void scan(input);
  }

  return (
    <main>
      <header>
        <h1>
          <Sparkles size={32} color={INK} /> <DrawablyHighlight>Skill Atlas</DrawablyHighlight>
        </h1>
        <p>Every SKILL.md in a GitHub repository.</p>
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

      {view && 'error' in view && (
        <DrawablyAlert role="alert" className="error" stroke="#b42318">
          <span data-tag>error</span> {view.error}
        </DrawablyAlert>
      )}

      {view && 'skills' in view && (
        <Result
          view={view}
          selected={view.skills.find((skill) => skill.id === selected)}
          onSelect={setSelected}
        />
      )}
    </main>
  );
}

function Result({
  view,
  selected,
  onSelect,
}: {
  view: Extract<ScanView, { skills: unknown }>;
  selected?: SkillView;
  onSelect(id: string): void;
}) {
  const { repository, skills, warnings } = view;
  return (
    <section aria-label="Scan result">
      <h2 className="repository">
        <a href={`${repository.url}/tree/${repository.commit}`} target="_blank" rel="noreferrer">
          {repository.id}
        </a>{' '}
        <DrawablyBadge>
          {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
        </DrawablyBadge>
      </h2>

      {warnings.map((warning) => (
        <p className="warning" role="note" key={warning}>
          <AlertTriangle size={18} color="#b54708" /> {warning}
        </p>
      ))}

      {skills.length > 0 && (
        <div className="atlas">
          <nav aria-label="Skills">
            <ul>
              {skills.map((skill) => (
                <li key={skill.id}>
                  <button
                    type="button"
                    aria-current={skill.id === selected?.id ? 'true' : undefined}
                    onClick={() => onSelect(skill.id)}
                  >
                    <strong>{skill.name}</strong>
                    {skill.description && <span>{firstSentence(skill.description)}</span>}
                    <code>{skill.path}</code>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {selected && (
            <DrawablyCard key={selected.id} className="skill" aria-label={`${selected.name}: SKILL.md`} role="region">
              <h3>
                <FileText size={22} color={INK} /> {selected.name}
              </h3>
              {selected.description && <p>{selected.description}</p>}
              <p className="links">
                <a href={selected.link} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} color={INK} /> {selected.path}
                </a>
                {selected.copies.length > 0 && <span>also in {selected.copies.join(', ')}</span>}
              </p>
              <pre aria-label="SKILL.md">{selected.markdown}</pre>
            </DrawablyCard>
          )}
        </div>
      )}
    </section>
  );
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
