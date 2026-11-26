// The web view: a celestial atlas. A field for a repository link; its skills, as an index and as the
// stars of a hand-drawn globe; and the SKILL.md of the chosen one, on a sheet of its own.
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  FolderGit2,
  Moon,
  Rotate3d,
  Search,
  Sparkles,
  Sun,
  Telescope,
} from '@sketchyicons/react';
import { roughEllipse } from 'drawably';
import {
  DrawablyAlert,
  DrawablyArrow,
  DrawablyBadge,
  DrawablyButton,
  DrawablyCard,
  DrawablyCircle,
  DrawablyHighlight,
  DrawablyInput,
  DrawablyToggle,
} from 'drawably/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import type { ScanView, SkillView } from '../src/browser.ts';
import { EXAMPLES } from './examples.ts';
import { Sky, type Theme } from './Sky.tsx';
import { chartOf } from './sky/chart.ts';

export type Backend = { scan(input: string): Promise<ScanView> };

const INK = 'var(--ink)';

/** The repository in the page's address, `?repo=<URL>`, so a scan can be shared and reloaded. */
function repoInAddress(): string {
  return new URLSearchParams(window.location.search).get('repo') ?? '';
}

export function App({ backend }: { backend: Backend }) {
  const [input, setInput] = useState(repoInAddress);
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useState<ScanView>();
  const [selected, setSelected] = useState<string>();
  const [pointed, setPointed] = useState<string>();
  const [theme, expose] = useTheme();
  const slot = useRef<HTMLDivElement>(null);
  const aim = useRef<HTMLSpanElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const noteTarget = useRef<HTMLSpanElement>(null);
  // The note's arrow is drawn again once the type has loaded: the page has settled by then.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    void document.fonts.ready.then(() => setSettled(true));
  }, []);

  const scanned = view && 'skills' in view ? view : undefined;
  const chart = useMemo(() => scanned && chartOf(scanned), [scanned]);

  async function scan(url: string) {
    if (!url.trim()) return;
    setScanning(true);
    const result = await backend.scan(url);
    setView(result);
    setSelected('skills' in result ? result.skills[0]?.id : undefined);
    setPointed(undefined);
    setScanning(false);
  }

  useEffect(() => {
    const url = repoInAddress();
    if (url) void scan(url);
  }, []);

  /** Scans, and writes the repository to the page's address. */
  function chartIt(url: string) {
    const address = new URL(window.location.href);
    address.searchParams.set('repo', url.trim());
    window.history.replaceState(null, '', address);
    void scan(url);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    chartIt(input);
  }

  return (
    <div className="plate" data-view={scanned ? 'chart' : 'cover'} data-scanning={scanning ? '' : undefined}>
      <Sky
        slot={slot}
        aim={aim}
        chart={chart}
        chosen={selected}
        pointed={pointed}
        scanning={scanning}
        lost={Boolean(view && 'error' in view)}
        theme={theme}
        onChoose={setSelected}
        onPoint={setPointed}
      />

      <DrawablyCard className="neatline" aria-hidden="true" roughness={0.8} />
      <div className="margin" aria-hidden="true">
        <span className="plate-name">Atlas Coelestis · every SKILL.md, charted by hand</span>
        <span className="aim" ref={aim}>
          α 00h 00m  δ +00° 00′
        </span>
        <span className="epoch">{scanned ? `epoch ${scanned.repository.commit.slice(0, 7) || 'local'}` : 'plate I'}</span>
      </div>

      <label className="exposure">
        <Sun size={18} color={INK} />
        <DrawablyToggle
          aria-label="Night sky"
          defaultChecked={theme === 'night'}
          onChange={(event) => expose(event.target.checked ? 'night' : 'day', event.target)}
        />
        <Moon size={18} color={INK} />
      </label>

      <main>
        <header className="masthead">
          <p className="eyebrow">
            <Telescope size={16} color={INK} /> A celestial atlas of agent skills
          </p>
          <h1>
            <span className="word">Skill</span>{' '}
            <span className="word">
              <DrawablyHighlight fill="var(--marker)">Atlas</DrawablyHighlight>
            </span>
            <Sparkles className="spark" size={44} color="var(--accent)" />
          </h1>
          <p className="tagline">Every SKILL.md in a GitHub repository.</p>

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
              <Search size={18} color="var(--paper)" /> {scanning ? 'Scanning…' : 'Scan'}
            </DrawablyButton>
          </form>

          {!scanned && (
            <p className="examples">
              <span>or chart one of these</span>
              {EXAMPLES.map((repository) => (
                <DrawablyButton
                  key={repository}
                  type="button"
                  disabled={scanning}
                  onClick={() => {
                    const url = `https://github.com/${repository}`;
                    setInput(url);
                    chartIt(url);
                  }}
                >
                  {repository}
                </DrawablyButton>
              ))}
            </p>
          )}

          {view && 'error' in view && (
            <DrawablyAlert role="alert" className="error" stroke="var(--accent)">
              <span data-tag>error</span> {view.error}
            </DrawablyAlert>
          )}
        </header>

        <div className="globe" ref={slot} aria-hidden="true">
          <StillGlobe />
          {!scanned && (
            <>
              <p className="note" ref={note}>
                every star
                <br />
                is a SKILL.md
              </p>
              <span className="note-target" ref={noteTarget} />
              <DrawablyArrow key={String(settled)} from={note} to={noteTarget} stroke="var(--accent)" width={1.6} />
            </>
          )}
          {scanned && scanned.skills.length > 0 ? (
            <p className="legend">
              <i className="mark star" /> a skill <i className="mark copy" /> its copy
              <span>the brighter, the longer its SKILL.md</span>
              <span className="turn">
                <Rotate3d size={13} color="var(--pencil)" /> drag to turn
              </span>
            </p>
          ) : (
            <p className="hint">
              <Rotate3d size={18} color="var(--pencil)" /> drag to turn the sky
            </p>
          )}
        </div>

        {scanned && (
          <Result
            view={scanned}
            selected={scanned.skills.find((skill) => skill.id === selected)}
            pointed={pointed}
            onSelect={setSelected}
            onPoint={setPointed}
          />
        )}
      </main>
    </div>
  );
}

function Result({
  view,
  selected,
  pointed,
  onSelect,
  onPoint,
}: {
  view: Extract<ScanView, { skills: unknown }>;
  selected?: SkillView;
  pointed?: string;
  onSelect(id: string): void;
  onPoint(id: string | undefined): void;
}) {
  const { repository, skills, warnings } = view;
  const list = useRef<HTMLUListElement>(null);

  // The chosen skill comes into view in the index, however it was chosen: by a click, a key or its
  // star on the globe. The index scrolls; the page itself does not move.
  useEffect(() => {
    const index = list.current;
    const current = index?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!index || !current || index.scrollHeight <= index.clientHeight) return;
    const [frame, box] = [index.getBoundingClientRect(), current.getBoundingClientRect()];
    if (box.top < frame.top + 12) index.scrollTop += box.top - frame.top - 12;
    else if (box.bottom > frame.bottom - 26) index.scrollTop += box.bottom - frame.bottom + 26;
  }, [selected?.id]);

  /** Down and up choose the next and the previous skill, and the globe turns to its star. */
  function step(event: KeyboardEvent<HTMLUListElement>) {
    const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    const buttons = [...(list.current?.querySelectorAll('button') ?? [])];
    const next = buttons.indexOf(document.activeElement as HTMLButtonElement) + by;
    if (!by || !skills[next] || !buttons.includes(document.activeElement as HTMLButtonElement)) return;
    event.preventDefault();
    onSelect(skills[next].id);
    buttons[next].focus();
  }

  return (
    <section aria-label="Scan result" className="result">
      <div className="ledger">
        <h2 className="repository">
          <a href={`${repository.url}/tree/${repository.commit}`} target="_blank" rel="noreferrer">
            {repository.id}
          </a>{' '}
          <DrawablyBadge>
            {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
          </DrawablyBadge>
        </h2>

        {warnings.length > 0 && (
          <div className="warnings">
            {warnings.map((warning) => (
              <p className="warning" role="note" key={warning}>
                <AlertTriangle size={18} color="var(--warn)" />
                {warning}
              </p>
            ))}
          </div>
        )}

        {skills.length === 0 && <p className="void">A dark sky: there is no SKILL.md in this repository.</p>}

        {skills.length > 0 && (
          <nav aria-label="Skills">
            <ul ref={list} onKeyDown={step}>
              {skills.map((skill, index) => (
                <li key={skill.id} style={{ '--i': Math.min(index, 14) } as CSSProperties}>
                  <button
                    type="button"
                    aria-current={skill.id === selected?.id ? 'true' : undefined}
                    data-pointed={skill.id === pointed ? '' : undefined}
                    onClick={() => onSelect(skill.id)}
                    onPointerEnter={() => onPoint(skill.id)}
                    onPointerLeave={() => onPoint(undefined)}
                    onFocus={() => onPoint(skill.id)}
                    onBlur={() => onPoint(undefined)}
                  >
                    <strong>
                      {skill.id === selected?.id ? (
                        <DrawablyCircle stroke="var(--accent)" width={1.8}>
                          {skill.name}
                        </DrawablyCircle>
                      ) : (
                        skill.name
                      )}
                    </strong>
                    {skill.description && <span>{firstSentence(skill.description)}</span>}
                    <code>{skill.path}</code>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {selected && (
        <DrawablyCard key={selected.id} className="skill" aria-label={`${selected.name}: SKILL.md`} role="region">
          <p className="size">{size(selected.markdown)}</p>
          <h3 style={{ '--fit': Math.min(1, 15 / selected.name.length) } as CSSProperties}>
            <FileText size={26} color={INK} /> {selected.name}
          </h3>
          {selected.description && <p className="description">{selected.description}</p>}
          <p className="links">
            <a href={selected.link} target="_blank" rel="noreferrer">
              <ExternalLink size={16} color={INK} /> {selected.path}
            </a>
            {selected.copies.length > 0 && <span>also in {selected.copies.join(', ')}</span>}
          </p>
          <pre aria-label="SKILL.md" tabIndex={0}>
            <Markdown text={selected.markdown} />
          </pre>
        </DrawablyCard>
      )}
    </section>
  );
}

/**
 * The SKILL.md as scanned, as text: every character as it is. Only the pen changes: the front matter
 * is washed with the marker, headings are inked, and the lines are numbered in the margin.
 */
function Markdown({ text }: { text: string }) {
  let matter = text.startsWith('---');
  let fenced = false;
  return lines(text).map((line, index) => {
    const bare = line.trimEnd();
    let kind = '';
    if (matter) {
      kind = 'matter';
      if (index > 0 && bare === '---') matter = false;
    } else if (/^\s*(```|~~~)/.test(bare)) {
      kind = 'fence';
      fenced = !fenced;
    } else if (fenced) {
      kind = 'fence';
    } else if (/^#{1,6}\s/.test(bare)) {
      kind = 'heading';
    }
    const key = kind === 'matter' ? /^([A-Za-z0-9_-]+)(:)/.exec(line) : null;
    return (
      <span className={`line ${kind}`} key={index}>
        {key ? (
          <>
            <b>{key[1]}</b>
            {line.slice(key[1].length)}
          </>
        ) : (
          line
        )}
      </span>
    );
  });
}

/** The text's lines, each with its line break: joined, they are the text again. */
function lines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** `7 lines · 144 B`; from a thousand bytes, `1.4 kB`. */
function size(text: string): string {
  const count = lines(text).length;
  const bytes = new TextEncoder().encode(text).length;
  return `${count} ${count === 1 ? 'line' : 'lines'} · ${bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(1)} kB`}`;
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}

/** Where there is no WebGL, the globe is still: a sketch in drawably's own strokes. */
function StillGlobe() {
  const o = { seed: 7, roughness: 0.9 };
  return (
    <svg className="still" viewBox="0 0 200 200" aria-hidden="true">
      <path d={roughEllipse(100, 100, 70, 70, o)} />
      <path d={roughEllipse(100, 100, 70, 22, { ...o, seed: 8 })} />
      <path d={roughEllipse(100, 100, 30, 70, { ...o, seed: 9 })} />
      <path d={roughEllipse(100, 100, 92, 30, { ...o, seed: 10 })} transform="rotate(-24 100 100)" />
    </svg>
  );
}

/**
 * Day, ink on paper, or night, chalk on cyanotype: the system's choice at first, then the switch's.
 * The night spreads from the switch. Nothing is stored.
 */
function useTheme(): [Theme, (next: Theme, from?: Element) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const first = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
    document.documentElement.dataset.theme = first;
    return first;
  });

  function expose(next: Theme, from?: Element) {
    const apply = () => {
      document.documentElement.dataset.theme = next;
      flushSync(() => setTheme(next));
    };
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || !from || !('startViewTransition' in document)) return apply();
    const box = from.getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    const reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
          { duration: 750, easing: 'cubic-bezier(0.65, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => {});
    transition.finished.catch(() => {});
  }

  return [theme, expose];
}
