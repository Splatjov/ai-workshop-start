// The sky behind the page: the canvas the system of worlds is drawn on, and what is written beside
// them: the worlds' names, how alike two of them are, and the places and lands of the world in view.
// The engine (three.js) is loaded apart from the page, which works without it: no WebGL, no sky.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Chart } from './sky/chart.ts';
import type { Sky as Engine, WorldView } from './sky/engine.ts';

export type Theme = 'day' | 'night';

/** A world's name on the sky, and what is noted under it. */
export type WorldName = { key: string; name: string; note: string; state: WorldView['state']; rings: number };

/** A thread between two worlds, and how alike they are: 0 to 1. */
export type Kin = { a: string; b: string; likeness: number };

type Props = {
  /** Where on the page the eye looks from. */
  slot: RefObject<HTMLDivElement | null>;
  /** Where to write what the middle of the view looks at. */
  aim: RefObject<HTMLElement | null>;
  worlds: WorldView[];
  names: WorldName[];
  kin: Kin[];
  /** How far the plate reaches. */
  rim: number;
  /** The world in view; none, the system. */
  at?: string;
  /** The chart of the world in view. */
  chart?: Chart;
  /** The places of it that are named: those of the skills the filter leaves. None given, all. */
  named?: string[];
  chosen?: string;
  pointed?: string;
  pointedWorld?: string;
  theme: Theme;
  onChoose(id: string): void;
  onPoint(id: string | undefined): void;
  onVisit(key: string | undefined): void;
  onPointWorld(key: string | undefined): void;
};

export function Sky({ slot, aim, worlds, names, kin, rim, at, chart, named, chosen, pointed, pointedWorld, theme, onChoose, onPoint, onVisit, onPointWorld }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const written = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine>();
  const [drawn, setDrawn] = useState<'drawing' | 'drawn' | 'none'>('drawing');
  const events = useRef({ onChoose, onPoint, onVisit, onPointWorld });
  useEffect(() => {
    events.current = { onChoose, onPoint, onVisit, onPointWorld };
  });

  useEffect(() => {
    let sky: Engine | undefined;
    let gone = false;
    import('./sky/engine.ts')
      .then(({ createSky }) => {
        if (gone || !canvas.current || !slot.current) return;
        sky = createSky(canvas.current, slot.current, {
          choose: (id) => events.current.onChoose(id),
          point: (id) => events.current.onPoint(id),
          visit: (key) => events.current.onVisit(key),
          pointWorld: (key) => events.current.onPointWorld(key),
          aim: (of, across, up) => {
            if (aim.current) aim.current.textContent = of === 'world' ? coordinates(across, up) : bearing(across, up);
          },
        });
        setEngine(sky);
        setDrawn('drawn');
      })
      .catch(() => {
        if (!gone) setDrawn('none');
      });
    return () => {
      gone = true;
      sky?.dispose();
      setEngine(undefined);
    };
  }, [slot, aim]);

  // The page says whether there is a sky, so it can draw a still globe where there is none.
  useEffect(() => {
    document.documentElement.dataset.sky = drawn;
  }, [drawn]);

  useLayoutEffect(() => {
    const style = getComputedStyle(document.documentElement);
    engine?.palette({
      ink: style.getPropertyValue('--ink'),
      accent: style.getPropertyValue('--accent'),
      wash: style.getPropertyValue('--marker'),
      chalk: theme === 'night',
    });
  }, [engine, theme]);
  // The worlds first, then where the eye is: it can only go to a world that is there.
  useEffect(() => engine?.system(worlds, kin, rim, written.current), [engine, worlds, kin, rim, names, chart]);
  useEffect(() => engine?.visit(at), [engine, at]);
  useEffect(() => engine?.choose(chosen), [engine, chart, chosen]);
  useEffect(() => engine?.point(pointed), [engine, chart, pointed]);
  useEffect(() => engine?.pointWorld(pointedWorld), [engine, worlds, pointedWorld]);

  return (
    <>
      <canvas className="sky" ref={canvas} aria-hidden="true" />
      <div className="names" ref={written} aria-hidden="true">
        {names.map((world) => (
          <span key={world.key} data-world={world.key} data-state={world.state} data-rings={world.rings} data-pointed={world.key === pointedWorld ? '' : undefined}>
            <i>
              <b>{world.name}</b>
              <small>{world.note}</small>
            </i>
          </span>
        ))}
        {kin.map(({ a, b, likeness }) => (
          <span key={`${a}|${b}`} data-kin={`${a}|${b}`}>
            <i>{percent(likeness)}</i>
          </span>
        ))}
        {chart?.places.map((place) => (
          <span
            key={place.id}
            data-place={place.id}
            data-out={named && !named.includes(place.id) ? '' : undefined}
            data-chosen={place.id === chosen ? '' : undefined}
            data-pointed={place.id === pointed ? '' : undefined}
          >
            <i>{place.name}</i>
          </span>
        ))}
        {chart?.lands.map((land) => (
          <span key={land.name} data-land={land.name}>
            <i>{land.name}</i>
          </span>
        ))}
      </div>
    </>
  );
}

/** `41%`: how alike, as it is written on a thread. */
export function percent(likeness: number): string {
  return `${Math.round(likeness * 100)}%`;
}

const two = (n: number) => String(Math.floor(n)).padStart(2, '0');

/** `λ 048° E  φ 12° N`: the longitude and latitude under the eye, as a map prints them. */
export function coordinates(longitude: number, latitude: number): string {
  const east = Math.abs(longitude);
  const north = Math.abs(latitude);
  return `λ ${String(Math.floor(east)).padStart(3, '0')}° ${two((east % 1) * 60)}′ ${longitude < 0 ? 'W' : 'E'}  φ ${two(north)}° ${two((north % 1) * 60)}′ ${latitude < 0 ? 'S' : 'N'}`;
}

/** `az 123°  alt +34°`: where the eye stands over the plate. */
export function bearing(azimuth: number, altitude: number): string {
  return `az ${String(Math.floor(azimuth)).padStart(3, '0')}° ${two((azimuth % 1) * 60)}′  alt +${two(altitude)}° ${two((altitude % 1) * 60)}′`;
}
