import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync('src/app/globals.css', 'utf8');

// Strip CSS comments before asserting. The comments in globals.css quote the
// exact declarations these tests forbid, in order to explain why they were
// removed — an explanation worth keeping, and one a naive substring check
// would trip over.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

// Two specific defects made every panel in this admin render black with black
// text, while the markup read as correct in every review. Both are invisible
// to any test that inspects class names, so they are pinned here at the CSS.

test('the primitives are never inverted', () => {
  // The fork shipped `html:not(.dark) { --color-white: #0a0a0a; --color-black:
  // #ffffff; }` — a light-mode hack that let dark-theme markup work unchanged.
  // Removing the `dark` class from <html> turned it on for every page, so
  // `bg-white` painted near-black. method26's palette is light by design and
  // needs no inversion.
  assert.doesNotMatch(css, /--color-white:\s*#0a0a0a/i, 'white must not be redefined as near-black');
  assert.doesNotMatch(css, /--color-black:\s*#f{3,6}/i, 'black must not be redefined as white');
  assert.doesNotMatch(css, /html:not\(\.dark\)/, 'the light-mode inversion block must not return');
});

test('base element resets stay inside @layer base', () => {
  // Tailwind v4 puts utilities in a layer, and UNLAYERED css beats layered css
  // regardless of specificity. A bare `a { color: inherit }` therefore
  // overrode every text-* utility on a link — which is why the sidebar's
  // active item rendered ink-on-ink while its class list plainly read
  // `bg-ink text-paper`.
  const bareAnchorRule = /(^|\n)\s*a\s*\{[^}]*color\s*:/;
  const layered = css.split('@layer base');
  assert.doesNotMatch(layered[0], bareAnchorRule, 'a bare `a { color }` outside @layer base will silently beat every text utility');
});
