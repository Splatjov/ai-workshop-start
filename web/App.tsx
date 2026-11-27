// The web view: an atlas of worlds. Every repository scanned is a world in a system, and the more
// alike the skills of two repositories, the closer their worlds stand; an organization's
// repositories are scanned together, each a world. A field for a repository or an organization
// link, and one for a token; the system, with its register of worlds; and, at a world, its skills
// as an index with a filter and as the places of its map, and the SKILL.md of the chosen one, on a
// sheet of its own.
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  FolderGit2,
  KeyRound,
  Moon,
  Orbit,
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
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import type { OrganizationView, RepositoryView, ScanOptions, ScanView, SkillView } from '../src/browser.ts';
import { parseGitHubUrl } from '../src/core/github.ts';
import { filterSkills } from '../src/core/model.ts';
import { EXAMPLES } from './examples.ts';
import { Sky, percent, type Kin, type Theme, type WorldName } from './Sky.tsx';
import { chartOf, type Chart } from './sky/chart.ts';
import type { WorldState, WorldView } from './sky/engine.ts';
import { belt, kinship, layout, radiusOf, reach, ringsOf, type Kinship } from './sky/system.ts';

export type Backend = { scan(input: string, options?: ScanOptions): Promise<ScanView> };

type Scanned = RepositoryView;

/** An organization that was scanned: its repositories are worlds of the system, each on its own. */
type Group = {
  /** `@owner`, in lower case. */
  key: string;
  url: string;
  view: OrganizationView;
};

/** A world of the system: a repository, charted or not yet. */
type World = {
  /**
   * `owner/repo`, in lower case, and `@ref` if a ref was asked for: the same repository, the same
   * world. While an organization is being scanned, `@owner`: its worlds are not yet known.
   */
  key: string;
  /** What to scan. */
  url: string;
  name: string;
  /** One of the examples: it is in the system before it is scanned. */
  example: boolean;
  state: WorldState;
  /** Its scan, once it is charted. */
  scan?: Scanned;
};

/** A world as the register lists it: where it stands, and the world most like it. */
type Charted = World & { scan: Scanned; nearest?: { key: string; name: string; kin: Kinship }; kin: { key: string; name: string; kin: Kinship }[] };

const INK = 'var(--ink)';
/** How large a world is drawn before its skills are counted. */
const UNCHARTED = 0.085;

/** The repositories in the page's address, `?repo=<URL>&repo=<URL>`, so a system can be shared and reloaded. */
function inAddress(): { repos: string[]; system: boolean } {
  const params = new URLSearchParams(window.location.search);
  const repos = params.getAll('repo').map((url) => url.trim()).filter(Boolean);
  return { repos: repos.filter((url, i) => repos.findIndex((other) => keyOf(other) === keyOf(url)) === i), system: params.get('view') === 'system' };
}

/**
 * The world a link is of: `https://github.com/JetBrains/Kotlin/tree/v1` → `jetbrains/kotlin@v1`;
 * or the organization: `github.com/JetBrains` → `@jetbrains`.
 */
function keyOf(url: string): string {
  const parsed = parseGitHubUrl(url);
  if (!parsed) return url.trim();
  if (!parsed.repo) return `@${parsed.owner}`.toLowerCase();
  return `${parsed.owner}/${parsed.repo}`.toLowerCase() + (parsed.ref ? `@${parsed.ref}` : '');
}

/** What a world is called before GitHub has answered: `owner/repo`, or `owner`, as typed. */
function nameOf(url: string): string {
  const parsed = parseGitHubUrl(url);
  if (!parsed) return url.trim();
  if (!parsed.repo) return parsed.owner;
  return `${parsed.owner}/${parsed.repo}` + (parsed.ref ? ` @ ${parsed.ref}` : '');
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The worlds the page opens with: the examples, not yet charted, and what its address asks for, about to be scanned. */
function firstWorlds(): World[] {
  const { repos } = inAddress();
  const examples = EXAMPLES.map((id): World => {
    const asked = repos.find((url) => keyOf(url) === id.toLowerCase());
    return { key: id.toLowerCase(), url: asked ?? `https://github.com/${id}`, name: id, example: true, state: asked ? 'scanning' : 'uncharted' };
  });
  const others = repos
    .filter((url) => !examples.some((world) => world.key === keyOf(url)))
    .map((url): World => ({ key: keyOf(url), url, name: nameOf(url), example: false, state: 'scanning' }));
  return [...examples, ...others];
}

export function App({ backend }: { backend: Backend }) {
  const [input, setInput] = useState(() => inAddress().repos[0] ?? '');
  // Kept in the page's memory only: not in the address, not in storage.
  const [token, setToken] = useState('');
  const [filter, setFilter] = useState('');
  const [worlds, setWorlds] = useState(firstWorlds);
  const [groups, setGroups] = useState<Group[]>([]);
  /** The worlds asked for, in the order they were: the address lists them. */
  const [asked, setAsked] = useState(() => inAddress().repos.map(keyOf));
  /** The world the address opens at; none, the system. */
  const [front, setFront] = useState(() => (inAddress().system ? undefined : inAddress().repos.map(keyOf)[0]));
  /** The world in view, or the organization; none, the system. */
  const [at, setAt] = useState<string>();
  const [selected, setSelected] = useState<Record<string, string | undefined>>({});
  const [pointed, setPointed] = useState<string>();
  const [pointedWorld, setPointedWorld] = useState<string>();
  const [failure, setFailure] = useState<string>();
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
  // Only the latest scan takes the view: an earlier one that answers later is charted where it stands.
  const latest = useRef(0);
  const charts = useRef(new WeakMap<Scanned, Chart>());
  const kinships = useRef(new WeakMap<Scanned, WeakMap<Scanned, Kinship>>());

  const scanning = worlds.some((world) => world.state === 'scanning');
  const here = worlds.find((world) => world.key === at && world.scan);
  const over = here ? undefined : groups.find((group) => group.key === at);
  const view = here ? 'world' : over ? 'organization' : worlds.some((world) => world.scan) ? 'system' : 'cover';

  /**
   * Scans a repository: its world is charted where it stands, and, unless told not to, the view
   * goes to it. An organization: each of its repositories that has skills is charted.
   */
  function chartIt(url: string, follow = true) {
    const asking = url.trim();
    if (!asking) return;
    const key = keyOf(asking);
    const turn = follow ? ++latest.current : 0;
    setWorlds((worlds) => {
      // What could not be scanned before is wiped: an example goes back to its place, anything else goes.
      const kept = worlds
        .filter((world) => world.key === key || world.state !== 'lost' || world.example)
        .map((world) => (world.state === 'lost' && world.key !== key ? { ...world, state: 'uncharted' as const } : world));
      const known = kept.find((world) => world.key === key);
      if (known) return kept.map((world) => (world === known ? { ...world, url: asking, state: 'scanning' as const } : world));
      return [...kept, { key, url: asking, name: nameOf(asking), example: false, state: 'scanning' as const }];
    });
    setAsked((asked) => [...asked.filter((other) => other !== key), key]);
    if (follow) {
      setFailure(undefined);
      setFront(key);
      setAt(undefined);
      setPointed(undefined);
      setFilter('');
    }
    void backend.scan(asking, { token }).then((result) => {
      const charted = !('error' in result);
      if ('repositories' in result) {
        // An organization: the world that stood for it gives way to its repositories', each charted.
        setWorlds((worlds) => {
          const others = worlds.filter((world) => world.key !== key);
          const scanned = new Map(result.repositories.map((repository) => [repository.repository.id.toLowerCase(), repository]));
          const known = others.map((world) => {
            const scan = scanned.get(world.key);
            scanned.delete(world.key);
            return scan ? { ...world, state: 'charted' as const, scan, name: scan.repository.id } : world;
          });
          const fresh = [...scanned].map(([key, scan]): World => ({ key, url: scan.repository.url, name: scan.repository.id, example: false, state: 'charted', scan }));
          return [...known, ...fresh];
        });
        setGroups((groups) => [...groups.filter((group) => group.key !== key), { key, url: asking, view: result }]);
        setSelected((selected) => ({
          ...selected,
          [key]: undefined,
          ...Object.fromEntries(result.repositories.map((repository) => [repository.repository.id.toLowerCase(), repository.skills[0]?.id])),
        }));
      } else {
        setWorlds((worlds) =>
          worlds.map((world) => {
            if (world.key !== key) return world;
            if ('error' in result) return { ...world, state: 'lost' as const, scan: undefined };
            const ref = parseGitHubUrl(asking)?.ref;
            return { ...world, state: 'charted' as const, scan: result, name: result.repository.id + (ref ? ` @ ${ref}` : '') };
          }),
        );
        if ('skills' in result) setSelected((selected) => ({ ...selected, [key]: result.skills[0]?.id }));
      }
      if (follow && turn !== latest.current) return;
      if (charted && follow) setAt(key);
      if ('error' in result) setFailure(result.error);
    });
  }

  // What the address asks for is scanned at once, and once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const { repos, system } = inAddress();
    repos.forEach((url, i) => chartIt(url, i === 0 && !system));
  }, []);

  // The address lists what was asked for, the world in view first: opening it charts the same system.
  useEffect(() => {
    const address = new URL(window.location.href);
    address.searchParams.delete('repo');
    address.searchParams.delete('view');
    // What was asked for and then wiped (it could not be scanned) is not asked for again.
    const urlOf = (key: string) => groups.find((group) => group.key === key)?.url ?? worlds.find((world) => world.key === key && world.state !== 'uncharted')?.url;
    const urls = [...(front ? [front] : []), ...asked.filter((key) => key !== front)].flatMap((key) => urlOf(key) ?? []);
    for (const url of urls) address.searchParams.append('repo', url);
    if (!front && urls.length > 0) address.searchParams.set('view', 'system');
    if (address.href !== window.location.href) window.history.replaceState(null, '', address);
  }, [asked, front, worlds, groups]);

  /**
   * Goes to a world: one that is charted is shown; one that is not is scanned first. Or to an
   * organization that was scanned: its skills, over the system. With no key, back to the system.
   */
  function visit(key: string | undefined) {
    const world = worlds.find((world) => world.key === key);
    const group = groups.find((group) => group.key === key);
    setPointed(undefined);
    setPointedWorld(undefined);
    setFilter('');
    // Going somewhere is the latest move: a scan still running is charted where it stands, and does not take the view.
    if (group) {
      latest.current++;
      setAt(group.key);
      setFront(group.key);
      setInput(group.url);
    } else if (!world) {
      latest.current++;
      setAt(undefined);
      if (asked.length > 0) setFront(undefined);
    } else if (world.state === 'scanning') {
      return;
    } else if (world.scan) {
      latest.current++;
      setAt(world.key);
      setFront(world.key);
      setInput(world.url);
      if (!asked.includes(world.key)) setAsked([...asked, world.key]);
    } else {
      setInput(world.url);
      chartIt(world.url);
    }
  }

  // Escape leaves a world, or an organization's skills, for the system.
  useEffect(() => {
    if (!here && !over) return;
    const leave = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) visit(undefined);
    };
    window.addEventListener('keydown', leave);
    return () => window.removeEventListener('keydown', leave);
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    chartIt(input);
  }

  function pick(event: MouseEvent, url: string) {
    // Ctrl/Cmd-, Shift-, Alt-click: the browser's own (a new tab, a window, a download).
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setInput(url);
    chartIt(url);
  }

  /** Scans every example not yet charted; the view stays over the system, to watch them come. */
  function chartAll() {
    setFailure(undefined);
    setFront(undefined);
    for (const world of worlds) if (world.example && !world.scan && world.state !== 'scanning') chartIt(world.url, false);
  }

  // ---- the system: where every world stands -------------------------------------------------------

  const system = useMemo(() => {
    const charted = worlds.filter((world): world is World & { scan: Scanned } => Boolean(world.scan)).sort((a, b) => (a.key < b.key ? -1 : 1));
    const between = (a: Scanned, b: Scanned): Kinship => {
      const [first, second] = a.repository.id < b.repository.id ? [a, b] : [b, a];
      if (!kinships.current.has(first)) kinships.current.set(first, new WeakMap());
      const known = kinships.current.get(first)!;
      if (!known.has(second)) known.set(second, kinship(first.skills, second.skills));
      return known.get(second)!;
    };
    const likeness = charted.map((a) => charted.map((b) => (a === b ? 1 : between(a.scan, b.scan).likeness)));
    const radii = charted.map((world) => radiusOf(world.scan.skills.length));
    const spots = layout(likeness, radii);
    // The rim of the plate lies just outside the charted worlds; those not yet charted wait on it.
    const waiting = worlds.some((world) => !world.scan);
    const rim = Math.max(waiting ? 0.66 : 0.3, reach(spots, radii) + (waiting ? 0.2 : 0.14));

    const register = charted.map((world, i): Charted => {
      const kin = charted
        .flatMap((other, j) => (j === i ? [] : [{ key: other.key, name: other.name, kin: between(world.scan, other.scan) }]))
        .sort((a, b) => b.kin.likeness - a.kin.likeness || (a.key < b.key ? -1 : 1));
      return { ...world, kin, nearest: kin[0] };
    });

    // A world not yet charted waits on the rim of the plate: the examples each in their own place.
    const extras = worlds.filter((world) => !world.scan && !world.example);
    const slots = EXAMPLES.length + extras.length;
    const views = worlds.map((world): WorldView => {
      const index = charted.findIndex((other) => other.key === world.key);
      if (index >= 0) {
        const scan = charted[index].scan;
        if (!charts.current.has(scan)) charts.current.set(scan, chartOf(scan));
        return { key: world.key, state: world.state, at: spots[index], radius: radii[index], rings: ringsOf(scan.skills).length, chart: charts.current.get(scan) };
      }
      const slot = world.example ? EXAMPLES.findIndex((id) => id.toLowerCase() === world.key) : EXAMPLES.length + extras.indexOf(world);
      return { key: world.key, state: world.state, at: belt(slot, slots, rim), radius: UNCHARTED, rings: 0 };
    });

    const names = worlds.map((world): WorldName => {
      const count = world.scan?.skills.length ?? 0;
      const note = world.state === 'scanning' ? 'scanning…' : world.state === 'lost' ? 'not scanned' : world.scan ? `${count} ${count === 1 ? 'skill' : 'skills'}` : 'uncharted';
      return { key: world.key, name: world.name, note, state: world.state, rings: world.scan ? ringsOf(world.scan.skills).length : 0 };
    });
    return { views, names, rim, register };
  }, [worlds]);

  // What is in view: a world's repository, or an organization's repositories; and what the filter
  // leaves of their skills. The chosen skill, or else the first one left.
  const result = here ? here.scan! : over?.view;
  const repositories: RepositoryView[] = !result ? [] : 'repositories' in result ? result.repositories : [result];
  const shown = repositories.map((repository) => ({ ...repository, skills: filterSkills(repository.skills, filter) })).filter(({ skills }) => skills.length > 0);
  const skills = shown.flatMap((repository) => repository.skills);
  const chosen = skills.find((skill) => skill.id === selected[at ?? '']) ?? skills[0];
  // Over an organization, the world of the skill pointed at, or else of the chosen one, is marked.
  const worldOf = (id: string | undefined) => (over && id ? worlds.find((world) => world.scan?.skills.some((skill) => skill.id === id))?.key : undefined);
  const marked = pointedWorld ?? worldOf(pointed) ?? worldOf(chosen?.id);

  // A thread from each world to the one most like it; and from the world pointed at, to every other.
  const kin = useMemo(() => {
    const threads = new Map<string, Kin>();
    const thread = (a: string, b: string, likeness: number) => {
      const [first, second] = a < b ? [a, b] : [b, a];
      threads.set(`${first}|${second}`, { a: first, b: second, likeness });
    };
    for (const world of system.register) {
      if (world.nearest) thread(world.key, world.nearest.key, world.nearest.kin.likeness);
      if (world.key === marked) for (const other of world.kin) thread(world.key, other.key, other.kin.likeness);
    }
    return [...threads.values()].sort((a, b) => (a.a + a.b < b.a + b.b ? -1 : 1));
  }, [system, marked]);

  const chart = here && charts.current.get(here.scan!);
  const charted = system.register;
  const uncharted = worlds.filter((world) => world.example && !world.scan && world.state !== 'scanning').length;

  return (
    <div className="plate" data-view={view} data-scanning={scanning ? '' : undefined}>
      <Sky
        slot={slot}
        aim={aim}
        worlds={system.views}
        names={system.names}
        kin={kin}
        rim={system.rim}
        at={here?.key}
        chart={chart}
        named={here ? skills.map((skill) => skill.id) : undefined}
        chosen={here ? chosen?.id : undefined}
        pointed={pointed}
        pointedWorld={marked}
        theme={theme}
        onChoose={(id) => here && setSelected((selected) => ({ ...selected, [here.key]: id }))}
        onPoint={setPointed}
        onVisit={visit}
        onPointWorld={setPointedWorld}
      />

      <DrawablyCard className="neatline" aria-hidden="true" roughness={0.8} />
      <div className="margin" aria-hidden="true">
        <span className="plate-name">Atlas of worlds · every SKILL.md, charted by hand</span>
        <span className="aim" ref={aim}>
          az 000° 00′  alt +00° 00′
        </span>
        <span className="epoch">
          {here ? `epoch ${here.scan!.repository.commit.slice(0, 7) || 'local'}` : charted.length > 0 ? `plate II · ${charted.length} ${charted.length === 1 ? 'world' : 'worlds'}` : 'plate I'}
        </span>
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
            <Telescope size={16} color={INK} /> An atlas of agent skills, one world a repository
          </p>
          <h1>
            <span className="word">Skill</span>{' '}
            <span className="word">
              <DrawablyHighlight fill="var(--marker)">Atlas</DrawablyHighlight>
            </span>
            <Sparkles className="spark" size={44} color="var(--accent)" />
          </h1>
          <p className="tagline">Every SKILL.md in a GitHub repository, or in all of an organization's.</p>

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

          <div className="token">
            <label htmlFor="token">
              <KeyRound size={16} color={INK} /> GitHub token
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

          {failure && (
            <DrawablyAlert role="alert" className="error" stroke="var(--accent)">
              <span data-tag>error</span> {failure}
            </DrawablyAlert>
          )}
        </header>

        {!here && !over && (
          <aside className="register">
            {charted.length > 0 && (
              <section aria-label="The system">
                <h2 className="system">
                  The system{' '}
                  <DrawablyBadge>
                    {charted.length} {charted.length === 1 ? 'world' : 'worlds'}
                  </DrawablyBadge>
                </h2>
                <p className="law">The closer two worlds stand, the more alike their skills.</p>
                {groups.length > 0 && (
                  <nav className="organizations" aria-label="Organizations">
                    {groups.map((group) => (
                      <button type="button" key={group.key} onClick={() => visit(group.key)}>
                        <b>{group.view.organization.id}</b>{' '}
                        {plural(group.view.repositories.reduce((sum, repository) => sum + repository.skills.length, 0), 'skill', 'skills')} in{' '}
                        {plural(group.view.repositories.length, 'repository', 'repositories')}
                      </button>
                    ))}
                  </nav>
                )}
                <nav className="index" aria-label="Worlds">
                  <ul>
                    {charted.map((world, index) => (
                      <li key={world.key} style={{ '--i': Math.min(index, 14) } as CSSProperties}>
                        <button
                          type="button"
                          data-pointed={world.key === marked ? '' : undefined}
                          onClick={() => visit(world.key)}
                          onPointerEnter={() => setPointedWorld(world.key)}
                          onPointerLeave={() => setPointedWorld(undefined)}
                          onFocus={() => setPointedWorld(world.key)}
                          onBlur={() => setPointedWorld(undefined)}
                        >
                          <strong>{world.name}</strong>
                          <span>
                            {world.scan.skills.length} {world.scan.skills.length === 1 ? 'skill' : 'skills'}
                            {world.nearest && (
                              <>
                                {' · nearest '}
                                {world.nearest.name}, {percent(world.nearest.kin.likeness)} alike
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              </section>
            )}

            <nav className="examples" aria-label="Examples">
              <span>{charted.length > 0 ? 'chart another' : 'or chart one of these'}</span>
              <ul>
                {EXAMPLES.map((id) => {
                  const url = `https://github.com/${id}`;
                  const world = worlds.find((other) => other.key === id.toLowerCase());
                  return (
                    <li key={id}>
                      <a
                        href={`?repo=${encodeURIComponent(url)}`}
                        data-state={world?.state}
                        onClick={(event) => pick(event, url)}
                        onPointerEnter={() => setPointedWorld(id.toLowerCase())}
                        onPointerLeave={() => setPointedWorld(undefined)}
                      >
                        {id}
                      </a>
                    </li>
                  );
                })}
              </ul>
              {uncharted > 1 && (
                <button type="button" className="all" disabled={scanning} onClick={chartAll}>
                  chart all {uncharted === EXAMPLES.length ? 'nine' : uncharted}
                </button>
              )}
            </nav>
          </aside>
        )}

        <div className="globe" ref={slot} aria-hidden="true">
          <StillGlobe />
          {view === 'cover' && (
            <>
              <p className="note" ref={note}>
                every world
                <br />
                is a repository
              </p>
              <span className="note-target" ref={noteTarget} />
              <p className="law-note">
                the closer two worlds stand,
                <br />
                the more alike their skills
              </p>
              <DrawablyArrow key={String(settled)} from={note} to={noteTarget} stroke="var(--accent)" width={1.6} />
            </>
          )}
          {here && skills.length > 0 ? (
            <p className="legend">
              <i className="mark place" /> a skill <i className="mark copy" /> its copy
              <span>the higher it stands, the longer its SKILL.md</span>
              <span className="turn">
                <Rotate3d size={13} color="var(--pencil)" /> drag to turn
              </span>
            </p>
          ) : (
            <p className="hint">
              <Rotate3d size={18} color="var(--pencil)" />{' '}
              {here ? 'drag to turn it' : view === 'cover' ? 'drag to turn the plate' : 'drag to turn the plate, scroll to go nearer'}
            </p>
          )}
        </div>

        {result && at && (
          <Result
            view={result}
            shown={shown}
            selected={chosen}
            filter={filter}
            pointed={pointed}
            kin={here ? (charted.find((world) => world.key === here.key)?.kin ?? []) : []}
            worlds={charted.length}
            onFilter={setFilter}
            onSelect={(id) => setSelected((selected) => ({ ...selected, [at]: id }))}
            onPoint={setPointed}
            onVisit={visit}
          />
        )}
      </main>
    </div>
  );
}

function Result({
  view,
  shown,
  selected,
  filter,
  pointed,
  kin,
  worlds,
  onFilter,
  onSelect,
  onPoint,
  onVisit,
}: {
  /** A world's repository, or an organization and its repositories. */
  view: RepositoryView | OrganizationView;
  /** The repositories and the skills the filter leaves. */
  shown: RepositoryView[];
  selected?: SkillView;
  filter: string;
  pointed?: string;
  /** The other worlds of the system, the most alike first. */
  kin: { key: string; name: string; kin: Kinship }[];
  /** How many worlds the system has. */
  worlds: number;
  onFilter(filter: string): void;
  onSelect(id: string): void;
  onPoint(id: string | undefined): void;
  onVisit(key: string | undefined): void;
}) {
  const organization = 'organization' in view ? view.organization : undefined;
  const repositories = 'repositories' in view ? view.repositories : [view];
  const all = repositories.reduce((sum, repository) => sum + repository.skills.length, 0);
  const skills = shown.flatMap((repository) => repository.skills);
  const count = skills.length === all ? `${all}` : `${skills.length} of ${all}`;
  const index = useRef<HTMLDivElement>(null);

  // The chosen skill comes into view in the index, however it was chosen: by a click, a key or its
  // place on the world. The index scrolls; the page itself does not move.
  useEffect(() => {
    const list = index.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !current || list.scrollHeight <= list.clientHeight) return;
    const [frame, box] = [list.getBoundingClientRect(), current.getBoundingClientRect()];
    if (box.top < frame.top + 12) list.scrollTop += box.top - frame.top - 12;
    else if (box.bottom > frame.bottom - 26) list.scrollTop += box.bottom - frame.bottom + 26;
  }, [selected?.id]);

  /** Down and up choose the next and the previous skill, and the world turns to its place. */
  function step(event: KeyboardEvent<HTMLDivElement>) {
    const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    const buttons = [...(index.current?.querySelectorAll('button') ?? [])];
    const next = buttons.indexOf(document.activeElement as HTMLButtonElement) + by;
    if (!by || !skills[next] || !buttons.includes(document.activeElement as HTMLButtonElement)) return;
    event.preventDefault();
    onSelect(skills[next].id);
    buttons[next].focus();
  }

  let entry = 0;
  return (
    <section aria-label="Scan result" className="result">
      <div className="ledger">
        <button type="button" className="back" onClick={() => onVisit(undefined)}>
          <Orbit size={15} color="var(--pencil)" /> the system · {worlds} {worlds === 1 ? 'world' : 'worlds'}
        </button>
        <h2 className="repository">
          {'organization' in view ? (
            <a href={view.organization.url} target="_blank" rel="noreferrer" style={{ '--fit': Math.min(1, 11 / view.organization.id.length) } as CSSProperties}>
              <span className="name">{view.organization.id}</span>
            </a>
          ) : (
            <a
              href={`${view.repository.url}/tree/${view.repository.commit}`}
              target="_blank"
              rel="noreferrer"
              style={{ '--fit': Math.min(1, 11 / view.repository.name.length) } as CSSProperties}
            >
              <span className="owner">{view.repository.organization}/</span>
              <span className="name">{view.repository.name}</span>
            </a>
          )}{' '}
          <DrawablyBadge>
            {count} {all === 1 ? 'skill' : 'skills'}
            {organization && ` in ${plural(shown.length, 'repository', 'repositories')}`}
          </DrawablyBadge>
        </h2>

        {view.warnings.length > 0 && (
          <div className="warnings">
            {view.warnings.map((warning) => (
              <p className="warning" role="note" key={warning}>
                <AlertTriangle size={18} color="var(--warn)" />
                {warning}
              </p>
            ))}
          </div>
        )}

        {kin.length > 0 && (
          <nav className="kin" aria-label="Kin">
            <span>most alike</span>
            {kin.slice(0, 3).map((other) => (
              <button
                type="button"
                key={other.key}
                title={other.kin.twins.length > 0 ? `both have: ${other.kin.twins.slice(0, 4).map((twin) => (twin.a === twin.b ? twin.a : `${twin.a} ≈ ${twin.b}`)).join(', ')}` : undefined}
                onClick={() => onVisit(other.key)}
              >
                {other.name} <b>{percent(other.kin.likeness)}</b>
              </button>
            ))}
          </nav>
        )}

        {all === 0 && (
          <p className="void">
            {organization ? 'No repository of this organization has a SKILL.md.' : 'A bare world, all sea: there is no SKILL.md in this repository.'}
          </p>
        )}

        {all > 0 && (
          <div className="filter">
            <label htmlFor="filter" className="visually-hidden">
              Filter skills
            </label>
            <Search size={18} color={INK} />
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

        {all > 0 && skills.length === 0 && (
          <p className="void" role="status">
            No skill matches “{filter.trim()}”.
          </p>
        )}

        {skills.length > 0 && (
          <nav className="index" aria-label="Skills">
            <div className="entries" ref={index} onKeyDown={step}>
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
                      <li key={skill.id} style={{ '--i': Math.min(entry++, 14) } as CSSProperties}>
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
                </section>
              ))}
            </div>
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

/** Where there is no WebGL, a world is still: a sketch in drawably's own strokes. */
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
