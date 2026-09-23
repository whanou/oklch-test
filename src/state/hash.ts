import type { AppState } from './store';
import { makeOklch, toCss, parseColor } from '../color/oklch';
import type { Role, Verbosity } from '../color/contrast';

/**
 * URL-hash state.
 *
 * The whole point, and it is load-bearing for the tool's purpose: a student hands the link
 * to a sighted reviewer. That act IS the defence the tool exists to support, so what the
 * hash carries has to be everything needed to reproduce the judgement -- the colour, the
 * role it was judged in, and the references it was judged against. A colour alone would
 * share a value without sharing the reasoning.
 *
 * Verbosity is a personal preference, not part of the judgement, so it is NOT shared. It
 * lives in localStorage instead.
 */
const VERBOSITY_KEY = 'oklch-test.verbosity';

export const encodeHash = (s: AppState): string => {
  const params = new URLSearchParams();
  params.set('c', toCss(s.active));
  params.set('role', s.role);
  if (s.activeLabel !== undefined) params.set('label', s.activeLabel);
  const refs = s.references
    .filter((r) => !r.isDefault)
    .map(
      (r) =>
        `${r.label}|${toCss(r.value)}|${r.asForeground ? 'f' : ''}${r.asCvdComparand ? 'c' : ''}`,
    );
  if (refs.length > 0) params.set('refs', refs.join('~'));
  return params.toString();
};

export const decodeHash = (hash: string, base: AppState): AppState => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const parsed = parseColor(params.get('c') ?? '');
  const role = params.get('role');
  const label = params.get('label');

  const extra = (params.get('refs') ?? '')
    .split('~')
    .filter((s) => s !== '')
    .flatMap((chunk, i) => {
      const [refLabel, css, flags] = chunk.split('|');
      const v = parseColor(css ?? '');
      if (v === undefined || refLabel === undefined) return [];
      return [
        {
          id: `url-${String(i)}`,
          label: refLabel,
          value: v.value,
          isDefault: false,
          asForeground: (flags ?? '').includes('f'),
          asCvdComparand: (flags ?? '').includes('c'),
        },
      ];
    });

  return {
    ...base,
    active: parsed?.value ?? base.active,
    activeLabel: label ?? base.activeLabel,
    role: role === 'text' || role === 'background' ? (role as Role) : base.role,
    references: [...base.references, ...extra],
  };
};

export const loadVerbosity = (): Verbosity | undefined => {
  try {
    const v = localStorage.getItem(VERBOSITY_KEY);
    return v === 'terse' || v === 'normal' || v === 'verbose' ? v : undefined;
  } catch {
    return undefined;
  }
};

export const saveVerbosity = (v: Verbosity): void => {
  try {
    localStorage.setItem(VERBOSITY_KEY, v);
  } catch {
    /* private mode; the preference simply does not persist */
  }
};

export { makeOklch };
