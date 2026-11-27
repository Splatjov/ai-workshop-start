# `flex-wrap: wrap` moves nothing while the growing item is `flex: 1`: give it a `flex-basis`

The filter row of the web view (`.filter` in `web/style.css`) has a field that is `flex: 1` and a
switch that does not wrap. `flex: 1` means a basis of 0, so with `flex-wrap: wrap` alone the row
still "fits" at 390 px and the field is squeezed to about 140 px. With `flex: 1 1 240px` the
field asks for 240 px, the switch goes to the next line, and the field grows to the whole row.
At 1280 px nothing moves, so no screenshot baseline changes.

A layout at phone width is tested without a screenshot: `page.setViewportSize({ width: 390,
height: 800 })`, then compare `boundingBox()` of the elements (`tests/web/view.spec.ts`, "group
by theme on a phone").

Learned in: PR #25, 2026-11-27.
