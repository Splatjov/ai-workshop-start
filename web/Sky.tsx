// The sky behind the page: the canvas the globe is drawn on, and the names written beside its stars.
// The engine (three.js) is loaded apart from the page, which works without it: no WebGL, no sky.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Chart } from './sky/chart.ts';
import type { Sky as Engine } from './sky/engine.ts';

export type Theme = 'day' | 'night';

type Props = {
  /** Where on the page the globe sits. */
  slot: RefObject<HTMLDivElement | null>;
  /** Where to write what the middle of the view looks at. */
  aim: RefObject<HTMLElement | null>;
  chart?: Chart;
  chosen?: string;
  pointed?: string;
  scanning: boolean;
  lost: boolean;
  theme: Theme;
  onChoose(id: string): void;
  onPoint(id: string | undefined): void;
};

export function Sky({ slot, aim, chart, chosen, pointed, scanning, lost, theme, onChoose, onPoint }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const names = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine>();
  const [drawn, setDrawn] = useState<'drawing' | 'drawn' | 'none'>('drawing');
  const events = useRef({ onChoose, onPoint });
  useEffect(() => {
    events.current = { onChoose, onPoint };
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
          aim: (ra, dec) => {
            if (aim.current) aim.current.textContent = coordinates(ra, dec);
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
    engine?.palette({ ink: style.getPropertyValue('--ink'), accent: style.getPropertyValue('--accent'), chalk: theme === 'night' });
  }, [engine, theme]);
  useEffect(() => engine?.chart(chart, names.current), [engine, chart]);
  useEffect(() => engine?.choose(chosen), [engine, chart, chosen]);
  useEffect(() => engine?.point(pointed), [engine, chart, pointed]);
  useEffect(() => engine?.scanning(scanning), [engine, scanning]);
  useEffect(() => engine?.lost(lost), [engine, lost]);

  return (
    <>
      <canvas className="sky" ref={canvas} aria-hidden="true" />
      <div className="names" ref={names} aria-hidden="true">
        {chart?.stars.map((star) => (
          <span
            key={star.id}
            data-star={star.id}
            data-chosen={star.id === chosen ? '' : undefined}
            data-pointed={star.id === pointed ? '' : undefined}
          >
            <i>{star.name}</i>
          </span>
        ))}
        {chart?.constellations.map((constellation) => (
          <span key={constellation.name} data-constellation={constellation.name}>
            <i>{constellation.name}</i>
          </span>
        ))}
      </div>
    </>
  );
}

/** `α 05h 14m  δ −08° 12′`: right ascension in hours, declination in degrees, as an atlas prints them. */
export function coordinates(ra: number, dec: number): string {
  const two = (n: number) => String(Math.floor(n)).padStart(2, '0');
  const south = dec < 0;
  const degrees = Math.abs(dec);
  return `α ${two(ra)}h ${two((ra % 1) * 60)}m  δ ${south ? '−' : '+'}${two(degrees)}° ${two((degrees % 1) * 60)}′`;
}
