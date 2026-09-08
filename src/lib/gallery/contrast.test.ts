import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

// The exact bug this guards against: a blunt find-and-replace once turned
// `bg-white` into `bg-[var(--color-ink)]` (or the shorthand `bg-ink`) and
// `text-white` into `text-[var(--color-ink)]` (`text-ink`) across every
// component, applied mechanically wherever the strings matched. That
// inverted panels — a black sidebar row, a black dropdown, a black stat
// card — without inverting the text sitting on them, leaving dark text on
// a dark (or literally black) background: the sidebar's active nav item,
// collection cards' caption bar, the SORT dropdown, the Published
// Galleries row, the Create Gallery form and every Analytics stat card
// were all unreadable this way at once. See the palette rules in
// globals.css: an ink surface is legitimate for an active/selected state,
// but it must always carry paper (light) text — there is no exception.
//
// This test does not understand JSX conditionals or React state; it can
// only see the source text. So it doesn't ask "is this element ever dark
// text on a dark background" (a ternary like
// `isActive ? 'bg-ink text-paper' : 'text-ink hover:bg-stone'` is fine —
// each branch is legible on its own) — it asks the narrower, mechanical
// question the shipped bug actually matches: does any SINGLE static class
// string (one quoted literal, i.e. one branch, one unconditional
// className) name a dark background utility and a dark text utility at
// the same time, with no light override. That is exactly what a blind
// bg-white→bg-ink / text-white→text-ink replace produces, and exactly
// what this test would have failed on before the fix.

const SCAN_ROOTS = ['src/components', 'src/app'];
const DARK_BG = /\bbg-(?:ink|black)(?:\/\d{1,3})?\b|bg-\[var\(--color-ink\)\]/;
const DARK_TEXT = /\btext-(?:ink|black)(?:\/\d{1,3})?\b|text-\[var\(--color-ink\)\]/;
// A literal that also carries a light (paper/white) text utility is not the
// bug — e.g. defensive markup some linter or codemod might produce as
// `text-ink text-paper` mid-edit. None of the real components do this, but
// excluding it keeps the assertion about exactly the failure mode described
// above rather than merely "the substrings co-occur".
const LIGHT_TEXT = /\btext-(?:paper|white)(?:\/\d{1,3})?\b|text-\[var\(--color-paper\)\]/;

function collectFiles(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectFiles(full, out);
      continue;
    }
    if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

// Every single- or double-quoted string literal in the file, each treated
// as one independent static class list — the same granularity a ternary's
// two branches, or one unconditional className="...", actually have at
// runtime. Comment-only lines are stripped first so prose describing the
// old bug (this file's own header, or the explanatory comments left in
// sidebar.tsx and layout.tsx) can't itself trip the check.
function quotedLiterals(source: string): { text: string; line: number }[] {
  const code = source
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line))
    .join('\n');
  const literals: { text: string; line: number }[] = [];
  const re = /'([^'\\]|\\.)*'|"([^"\\]|\\.)*"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const line = code.slice(0, match.index).split('\n').length;
    literals.push({ text: match[0], line });
  }
  return literals;
}

test('no component pairs a dark (ink/black) background with dark (ink/black) text on the same element', () => {
  const files = SCAN_ROOTS.filter((root) => {
    try {
      return statSync(root).isDirectory();
    } catch {
      return false;
    }
  }).flatMap((root) => collectFiles(root, []));

  const violations: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { text, line } of quotedLiterals(source)) {
      if (DARK_BG.test(text) && DARK_TEXT.test(text) && !LIGHT_TEXT.test(text)) {
        violations.push(`${file}:${line}: ${text}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `dark-on-dark class pairing found (a single static class list naming both a dark background and dark text):\n${violations.join('\n')}`
  );
});
