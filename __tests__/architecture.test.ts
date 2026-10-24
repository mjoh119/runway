import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..');

function collect(path: string): string[] {
  const full = join(root, path);
  if (statSync(full).isDirectory()) {
    return readdirSync(full).flatMap((name) => collect(join(path, name)));
  }
  return /\.tsx?$/.test(path) ? [full] : [];
}

const pureEntryServiceFiles = [
  'errors',
  'balance-delta',
  'plan-post',
  'plan-one-off',
  'validate',
  'occurrence',
].map((n) => `src/lib/entry-service/${n}.ts`);

const pureFiles = [
  ...collect('src/lib/projection'),
  ...collect('src/lib/envelopes'),
  ...collect('src/lib/money.ts'),
  ...pureEntryServiceFiles.flatMap(collect),
];

const forbiddenImports = ['@/lib/db', '@prisma/client', '@/sources'];

/** Remove comments so mentions in prose do not trip the checks. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('architecture: pure modules', () => {
  it('finds the expected pure files', () => {
    expect(pureFiles.length).toBeGreaterThan(pureEntryServiceFiles.length);
  });

  for (const file of pureFiles) {
    const name = relative(root, file).replace(/\\/g, '/');
    it(`${name} has no db, Prisma, sources, or fetch dependency`, () => {
      const src = stripComments(readFileSync(file, 'utf8'));
      const specifiers = [
        ...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g),
        ...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g),
      ].map((m) => m[1]);
      for (const bad of forbiddenImports) {
        expect(
          specifiers.filter((s) => s === bad || s.startsWith(`${bad}/`)),
          `imports ${bad}`,
        ).toEqual([]);
      }
      expect(/\bfetch\s*\(/.test(src), 'calls fetch').toBe(false);
    });
  }
});
