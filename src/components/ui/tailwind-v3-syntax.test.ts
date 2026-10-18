import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * shadcn now generates components for Tailwind v4. This app runs Tailwind 3, which silently drops
 * v4-only classes, so a freshly added primitive can lose its max-height, transform origin or shadow
 * without any error.
 */
const V4_ONLY: [RegExp, string][] = [
  [/[a-z]-\(--[a-z-]+\)/, 'v4 CSS-variable shorthand like origin-(--x); use origin-[var(--x)]'],
  [/(^|[\s"'`])\*\*:/, 'v4 descendant variant **:; use [&_selector]:'],
  [/(^|[\s"'`])\*:\[/, 'v4 child element variant *:[span]; use [&>span]:'],
  [/\bfield-sizing-/, 'v4 field-sizing utility; use [field-sizing:content]'],
  [/\bshadow-xs\b/, 'v4 shadow-xs; v3 calls it shadow-sm'],
  [/\bring-offset-1\.5\b/, 'ring-offset-1.5 is not in the v3 scale'],
  [/var\(--spacing\)/, 'v4 --spacing variable'],
  [/\bhas-(disabled|data-)/, 'v4 has-* shorthand; use has-[:disabled] or has-[[data-x]]'],
];

const dir = __dirname;
const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'));

describe('ui primitives', () => {
  it.each(files)('%s uses only Tailwind 3 class syntax', (file) => {
    const source = readFileSync(join(dir, file), 'utf8');
    const problems = V4_ONLY.filter(([re]) => re.test(source)).map(([, why]) => why);
    expect(problems).toEqual([]);
  });
});
