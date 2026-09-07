import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAnalyticsTab } from './analytics-tab.ts';

test('accepts exactly the five known analytics tabs', () => {
  for (const tab of ['overview', 'favorites', 'consensus', 'visitors', 'downloads']) {
    assert.equal(isAnalyticsTab(tab), true, `expected "${tab}" to be accepted`);
  }
});

test('rejects an unknown tab', () => {
  assert.equal(isAnalyticsTab('emails'), false);
  assert.equal(isAnalyticsTab('activity'), false);
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
