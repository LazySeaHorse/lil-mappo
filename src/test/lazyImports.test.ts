import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Folders and files vite.config.ts leaves out of the production obfuscator. Anywhere else, string-array
// encoding hides an import() specifier from Rollup, so the chunk is never built and fails to load.
const UNOBFUSCATED = [
  'src/lib/analytics/',
  'src/lib/lazyModules.ts',
  'src/engine/',
  'src/components/MapViewport/runtime/',
  'src/annotations/',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('dynamic imports in the production build', () => {
  it('only appear where the obfuscator cannot hide them from Rollup', () => {
    const offenders = sourceFiles('src')
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => !UNOBFUSCATED.some((prefix) => file.startsWith(prefix)))
      .filter((file) => /\bimport\(\s*['"`]/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
