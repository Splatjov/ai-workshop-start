# A new drawably control changes every later screenshot of the walkthrough, not just its own

The walkthrough seeds `Math.random` once per test (`tests/web/walkthrough.spec.ts`), and every
drawably sketch draws from that one sequence in mount order. Adding one hand-drawn control (here a
`DrawablyToggle` next to the filter) shifts the strokes of everything mounted after it: `error.png`
changed too, though the error page shows no toggle. The diff images show it: whole outlines in
red/yellow, the layout and text unchanged. That is not a regression; look at each new baseline
for layout and text, then `npm run test:screenshots -- --update-snapshots`.

Learned in: issue #20 (group by theme), 2026-11-27.
