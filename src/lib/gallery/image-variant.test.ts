import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isImageVariant, variantKeyField } from './image-variant.ts';

test('accepts exactly "thumb" and "preview"', () => {
  assert.equal(isImageVariant('thumb'), true);
  assert.equal(isImageVariant('preview'), true);
});

test('rejects "original" — there is no admin route to full-resolution bytes', () => {
  assert.equal(isImageVariant('original'), false);
});

test('rejects an empty variant', () => {
  assert.equal(isImageVariant(''), false);
});

test('rejects a missing variant', () => {
  assert.equal(isImageVariant(null), false);
  assert.equal(isImageVariant(undefined), false);
});

test('rejects near-miss and case-varied values', () => {
  for (const bogus of ['Thumb', 'PREVIEW', 'thumbnail', 'thumb ', ' preview', 'thumb,original']) {
    assert.equal(isImageVariant(bogus), false, `expected "${bogus}" to be rejected`);
  }
});

test('the allowlist maps each variant to its own key field only', () => {
  assert.equal(variantKeyField('thumb'), 'thumbnail_key');
  assert.equal(variantKeyField('preview'), 'preview_key');
});
