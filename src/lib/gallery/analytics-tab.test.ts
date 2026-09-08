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

test('the overview no longer reports views', () => {
  // Views are still recorded; they are not shown. A page-view count answers
  // nothing the studio acts on, and it dominated the 30-day chart's scale so
  // downloads — the number that does — rounded to nothing beside it.
  assert.ok(!/label: 'Views'/.test(panel), 'no Views stat tile');
  assert.ok(!/<Eye\b/.test(panel), 'and no eye icon left behind');
  assert.match(panel, /const maxDownloads = Math\.max\(1, \.\.\.activity30d\.map\(\(d\) => d\.downloads\)\)/);
  assert.ok(!/maxActivity/.test(panel), 'the old combined scale is gone');
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
  assert.match(panel, /photo\{consensus\.length === 1 \? '' : 's'\} liked by 2\+/);
});
