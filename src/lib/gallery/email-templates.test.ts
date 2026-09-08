import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGalleryShareEmailHtml,
  buildGalleryShareEmailText,
  escapeHtml,
  formatExpiryDate,
  GALLERY_EMAIL_DEFAULTS,
  sanitizeUrl,
} from './email-templates.ts';

const GALLERY = {
  galleryName: 'Marchetti — Editorial Session',
  url: 'https://method26.example/gallery/abc123',
};

test('escapes every character that could close an attribute or open a tag', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')">&`),
    '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;'
  );
});

test('a gallery name carrying markup cannot reach the rendered document', () => {
  const html = buildGalleryShareEmailHtml({
    ...GALLERY,
    galleryName: '<script>steal()</script>',
    message: '</td></tr></table><h1>injected</h1>',
  });
  assert.ok(!html.includes('<script>steal()</script>'), 'script tag must be escaped');
  assert.ok(!html.includes('<h1>injected</h1>'), 'message markup must be escaped');
  assert.ok(html.includes('&lt;script&gt;steal()&lt;/script&gt;'), 'and must still be readable');
});

test('only http(s) survives sanitizeUrl', () => {
  assert.equal(sanitizeUrl('https://method26.example/g/x'), 'https://method26.example/g/x');
  assert.equal(sanitizeUrl('  http://method26.example/g/x  '), 'http://method26.example/g/x');
  assert.equal(sanitizeUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(sanitizeUrl('//method26.example/g/x'), '');
});

test('a javascript: gallery url never becomes an href', () => {
  const html = buildGalleryShareEmailHtml({ ...GALLERY, url: 'javascript:alert(1)' });
  assert.ok(!html.includes('javascript:'), 'no javascript: URL may reach the document');
});

test('the expiry date is rendered in the studio\'s timezone, not the host\'s', () => {
  // Midnight UTC on the 25th is still the 24th in Los Angeles. The studio
  // sets expiry in its own day, so the studio's day is what the client reads.
  assert.equal(formatExpiryDate('2026-12-25T08:00:00.000Z'), 'December 25, 2026');
  assert.equal(formatExpiryDate('2026-12-25T00:00:00.000Z'), 'December 24, 2026');
});

test('an unparseable expiry drops the sentence instead of printing "Invalid Date"', () => {
  assert.equal(formatExpiryDate('not a date'), null);
  const html = buildGalleryShareEmailHtml({ ...GALLERY, expiresAt: 'not a date' });
  const text = buildGalleryShareEmailText({ ...GALLERY, expiresAt: 'not a date' });
  for (const part of [html, text]) {
    assert.ok(!part.includes('Invalid Date'), 'must not print Invalid Date');
    assert.ok(!/available until/i.test(part), 'must not print a bare expiry line');
  }
});

test('both parts carry the same expiry wording', () => {
  const input = { ...GALLERY, expiresAt: '2026-12-25T08:00:00.000Z' };
  assert.ok(buildGalleryShareEmailHtml(input).includes('Available until December 25, 2026.'));
  assert.ok(buildGalleryShareEmailText(input).includes('Available until December 25, 2026.'));
});

test('the finals variant asks the client to download, proofing asks them to view', () => {
  const finals = buildGalleryShareEmailHtml({ ...GALLERY, variant: 'finals' });
  const proofing = buildGalleryShareEmailHtml({ ...GALLERY, variant: 'proofing' });
  assert.ok(finals.includes(GALLERY_EMAIL_DEFAULTS.finals.cta));
  assert.ok(proofing.includes(GALLERY_EMAIL_DEFAULTS.proofing.cta));
  assert.ok(!proofing.includes(GALLERY_EMAIL_DEFAULTS.finals.cta));
});

test('the header carries the lockup, not the word repeated beneath it', () => {
  const html = buildGalleryShareEmailHtml(GALLERY);
  assert.match(html, /email-logo\.png/, 'the lockup PNG — Gmail and Outlook render no SVG');
  assert.match(html, /alt="method26"/, 'alt does the work when images are blocked');
  // The lockup already reads "method26"; setting it again as text beneath is
  // the thing being removed here.
  // Sliced to the first heading: the hero comment only exists when the
  // gallery has a cover, and this fixture has none.
  const header = html.slice(html.indexOf('<!-- Header -->'), html.indexOf('<h1'));
  assert.ok(
    !/>\s*method26\s*</.test(header),
    'the wordmark must not be repeated as text under the logo'
  );
});

test('the message block is omitted entirely when there is no message', () => {
  const withNone = buildGalleryShareEmailText(GALLERY);
  const withBlank = buildGalleryShareEmailText({ ...GALLERY, message: '   ' });
  const withOne = buildGalleryShareEmailText({ ...GALLERY, message: 'See you Tuesday.' });
  assert.ok(!withNone.includes('\n\n\n'), 'no empty gap where the message would be');
  assert.equal(withBlank, withNone, 'whitespace is not a message');
  assert.ok(withOne.includes('See you Tuesday.'));
});

test('the mail loads no asset from anyone but the studio', () => {
  const html = buildGalleryShareEmailHtml({
    ...GALLERY,
    coverImageUrl: 'https://images.method26.example/cover.jpg',
  });
  const remote = [...html.matchAll(/(?:src|background)=["']?(https?:\/\/[^"'\s>]+)/gi)].map((m) => m[1]);
  assert.ok(remote.length > 0, 'the logo at least should be here');
  for (const url of remote) {
    const host = new URL(url).hostname;
    assert.ok(
      /method26/.test(host),
      `mail carries a credential: no asset may be fetched from ${host} on open`
    );
  }
  // A stylesheet <link> is inert in Gmail but is still a third-party request
  // in clients that honour it, and it fingerprints the read.
  assert.ok(!/<link[^>]+fonts\.googleapis/i.test(html), 'no remote font stylesheet');
});

test('the text part carries no markup', () => {
  const text = buildGalleryShareEmailText({
    ...GALLERY,
    message: 'Two <of> these are yours',
    expiresAt: '2026-12-25T08:00:00.000Z',
  });
  assert.ok(!/<(?:table|div|p|a|img|html)\b/i.test(text), 'no tags in the plain-text alternative');
  assert.ok(!text.includes('&amp;'), 'no HTML entities in the plain-text alternative');
  assert.ok(text.includes(GALLERY.url), 'the link must be readable as a bare URL');
});

// Every colour that may carry text in this mail, and the reason it is legal.
// An email has no stylesheet to audit and no browser to measure in, so this
// allowlist is the audit: adding a text colour means adding it here with its
// measured ratio, which is where the brand grey #727A80 fails to qualify
// (4.03:1 on paper, 4.18:1 on ink — both under the 4.5:1 small-text floor,
// and every line in this template is small text).
const TEXT_COLOURS: Record<string, string> = {
  '#141518': 'ink on paper/card, 16.87:1',
  '#E8E9E6': 'stone on ink, 14.6:1',
  '#FFFFFF': 'white on the ink button, 17.9:1',
  '#F6F6F4': 'paper on ink, 16.1:1',
};

test('no text is set in a colour that has not been measured', () => {
  for (const variant of ['proofing', 'finals'] as const) {
    const html = buildGalleryShareEmailHtml({
      ...GALLERY,
      variant,
      message: 'A note.',
      expiresAt: '2026-12-25T08:00:00.000Z',
      coverImageUrl: 'https://images.method26.example/cover.jpg',
    });
    const used = new Set(
      [...html.matchAll(/color:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase())
    );
    assert.ok(used.size > 0, 'the template should set colours explicitly');
    for (const hex of used) {
      assert.ok(
        hex in TEXT_COLOURS,
        `${variant}: ${hex} carries text but has no measured contrast in TEXT_COLOURS`
      );
    }
  }
});

test('the brand grey never carries text', () => {
  // #727A80 is a rule-and-mark colour on the site for exactly this reason.
  const html = buildGalleryShareEmailHtml({ ...GALLERY, expiresAt: '2026-12-25T08:00:00.000Z' });
  assert.ok(!/color:\s*#727A80/i.test(html), 'brand grey must not be a text colour');
});
