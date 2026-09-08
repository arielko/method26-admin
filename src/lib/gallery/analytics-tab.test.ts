import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAnalyticsTab } from './analytics-tab.ts';

test('accepts exactly the six known analytics tabs', () => {
  for (const tab of ['overview', 'favorites', 'consensus', 'visitors', 'downloads', 'emails']) {
    assert.equal(isAnalyticsTab(tab), true, `expected "${tab}" to be accepted`);
  }
});

test('rejects an unknown tab', () => {
  assert.equal(isAnalyticsTab('activity'), false);
  assert.equal(isAnalyticsTab('archived'), false);
});

test('rejects a missing or empty tab', () => {
  assert.equal(isAnalyticsTab(null), false);
  assert.equal(isAnalyticsTab(undefined), false);
  assert.equal(isAnalyticsTab(''), false);
});

test('rejects case-varied and near-miss values', () => {
  for (const bogus of ['Overview', 'FAVORITES', 'consensus ', ' visitors']) {
    assert.equal(isAnalyticsTab(bogus), false, `expected "${bogus}" to be rejected`);
  }
});

// --- What the analytics surfaces show -------------------------------------

import { readFileSync as readAnalyticsSource } from 'node:fs';

const panel = readAnalyticsSource('src/components/gallery/AnalyticsPanel.tsx', 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\/.*$/gm, '');

test('the overview is stat tiles, with no activity chart', () => {
  // Views are still recorded; they are not shown. A page-view count answers
  // nothing the studio acts on. The 30-day chart went with it — with views
  // removed it was a single series of mostly-zero bars.
  assert.ok(!/label: 'Views'/.test(panel), 'no Views stat tile');
  assert.ok(!/<Eye\b/.test(panel), 'and no eye icon left behind');
  assert.ok(!/Last 30 Days/.test(panel), 'no activity chart');
  // Its state and its type import go too — a chart nobody renders that still
  // fetches its data is the kind of thing that survives for years.
  assert.ok(!/activity30d/.test(panel), 'and none of the state behind it');
  assert.ok(!/maxActivity|maxDownloads/.test(panel), 'nor the scale it needed');
});

test('favorites are grouped per person, with their count and the filenames', () => {
  assert.match(panel, /\{group\.photos\.length\} favorite/, 'each block states how many they picked');
  assert.match(panel, /\(\{group\.visitor\.email\}\)/, 'the address identifies the person');
  assert.match(panel, /title=\{photo\.filename\}/, 'and every frame names itself');
  // Headshots: a square crop cuts the top of the frame off the thumbnail.
  assert.ok(!/aspect-square/.test(panel), 'no square crops in these grids');
});

test('consensus shows the vote count on the frame itself', () => {
  assert.match(panel, /\{frame\.likeCount\}/);
  assert.match(panel, /absolute right-2 top-2/, 'as a badge, readable at a glance across the grid');
  // Amber is 2.84:1 and cannot carry text — it is the badge's ground, with
  // ink on top.
  assert.match(panel, /bg-amber px-1\.5 py-0\.5 font-mono text-\[11px\] text-ink/);
  // JSX interpolation is `{...}`, not `${...}` — this is markup, not a
  // template literal.
  // Counts what is on screen, not what was fetched — with a filter applied
  // the header must agree with the grid under it.
  assert.match(panel, /photo\{visibleConsensus\.length === 1 \? '' : 's'\} liked by 2\+/);
});

test('consensus can be searched by filename or frame number', () => {
  // Frame numbers live in the filename — "1005", "DSC4746" — so one
  // case-insensitive substring filter over it is what "find frame 1005"
  // actually needs.
  assert.match(panel, /const \[consensusQuery, setConsensusQuery\] = useState\(''\)/);
  assert.match(panel, /frame\.filename\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(panel, /placeholder="Search by filename or number…"/);
  // The grid renders the filtered set, not the full one.
  assert.match(panel, /\{visibleConsensus\.map\(\(frame\) =>/);
  // And says so when a search matches nothing, rather than showing an empty
  // grid that reads as "no consensus yet".
  assert.match(panel, /Nothing matches/);
});

test('photograph grids are sized by tile, not by column count', () => {
  // Six fixed columns inside a 1152px cap made every frame about half the
  // size of the reference's on the same monitor. A minimum tile width holds
  // the frame size steady and lets the column count follow the window.
  const grids = panel.match(/grid-template-columns:repeat\(auto-fill,minmax\(220px,1fr\)\)/g) ?? [];
  assert.equal(grids.length, 2, 'favorites and consensus both');
  assert.ok(!/lg:grid-cols-6/.test(panel), 'no fixed six-column grids left');
});
