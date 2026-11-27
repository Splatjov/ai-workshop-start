# Screenshots of the WebGL sky are stable only at rest and with one random sequence per caller

The walkthrough's screenshots of the atlas of worlds differed between runs in CI's container,
always by the same pixel counts (2060, 5293): two discrete states, not noise. Two causes:
the screenshot came before the sky had settled (wait for `canvas.sky[data-rest]`), and how many
`Math.random` calls drawably made before the sky seeded its pen depended on timing. A seeded
`Math.random` keyed by the caller (`new Error().stack.split('\n')[2]`) fixes it: 10 of 10 runs
equal (`npm run test:screenshots -- walkthrough --repeat-each 5`).

Learned in: issue #19, 2026-11-27.
