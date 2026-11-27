# The atlas' index beside a world's map is narrower than a phone

At 1280×800 the ledger (the index of a world, with its filter) is a 270px column; at 1600, 336px.
On a 390px phone it has the page's width: 334px. From 700 to 1100px it is 440px and more. So a
rule "beside on a wide screen, under on a phone" cannot be made with `flex-wrap` alone, and a test
that checks "wide" at 1280 measures the narrowest index of all. A control added to the filter's
row wraps under it at 1280 (27px of icon + a 190px field + 149px of switch do not fit in 270px);
check "beside" at about 1000px, and "under" at both 390 and 1280.

A second trap of the same merge: the atlas stored a scan's first skill as the chosen one, so
"else the first one listed is chosen" (by theme: not the first by name) never applied. Leave the
choice empty at a scan; `chosen` falls back to the first one listed.

Learned in: PR #22 (merging main's "Group by theme" into the atlas), 2026-11-27.
