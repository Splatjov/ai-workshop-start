# Pointing at a world does not take the sky out of rest: poll the names instead

In a web test, hovering a register entry (or a world) adds threads and moves names, but nothing
on the sky moves, so `canvas.sky[data-rest]` stays set the whole time: waiting for it after a
hover waits for nothing, and the names are read a frame too early (a new `[data-kin]` starts at
opacity 0). Wait for `.names [data-world][data-pointed]` (it names the world pointed at), then
`expect.poll` what the names should be. Also: a register entry's text holds its nearest world's
name too, so `worldButtons(page).filter({ hasText: 'anthropics/skills' })` matches most entries;
use `.nth(i)`.

Learned in: PR #22, 2026-11-27.
