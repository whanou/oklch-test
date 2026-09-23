import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Enforces the isolation requirement mechanically rather than by intention.
 *
 * This package must be copy-outable: buildable and deployable after being lifted out of
 * this monorepo. Two things would break that silently -- a workspace import, and a pnpm
 * `catalog:` version alias, which only resolves inside this workspace. Both are cheap to
 * add by habit and invisible until someone tries to extract the package.
 */
const here = join(import.meta.dirname, '..');

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return full.endsWith('.ts') ? [full] : [];
  });

describe('the package is fully isolated', () => {
  const files = sources(join(here, 'src'));

  it('finds its own sources, so the scans below are not vacuous', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('imports nothing from another workspace package', () => {
    const offenders = files.filter((f) =>
      /from\s+['"]@whanou\//.test(readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => f.replace(here, ''))).toEqual([]);
  });

  it('reaches outside the package directory in no import', () => {
    const offenders = files.filter((f) =>
      /from\s+['"]\.\.\/\.\.\/\.\./.test(readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => f.replace(here, ''))).toEqual([]);
  });

  it('pins every dependency explicitly, with no pnpm catalog: alias', () => {
    // `catalog:` resolves only inside this workspace; it would break an extracted copy.
    const pkg = JSON.parse(
      readFileSync(join(here, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(
      Object.entries(all).filter(([, v]) => v.startsWith('catalog:')),
    ).toEqual([]);
    expect(
      Object.entries(all).filter(([, v]) => v.startsWith('workspace:')),
    ).toEqual([]);
  });
});
