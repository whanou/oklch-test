import Color from 'colorjs.io';

/**
 * Colour conversion, gamut and parsing.
 *
 * Color.js is used rather than hand-rolled maths because correctness here is a teaching
 * requirement: a student defending a value in review needs the number to be right, and
 * CSS Color 4 gamut mapping is not something to approximate.
 */

export type Gamut = 'srgb' | 'p3';

export interface Oklch {
  /** 0..1 */
  readonly l: number;
  /** 0..~0.4 */
  readonly c: number;
  /** degrees, 0..360 */
  readonly h: number;
}

export interface GamutStatus {
  readonly inSrgb: boolean;
  readonly inP3: boolean;
}

const clampHue = (h: number): number => ((h % 360) + 360) % 360;

export const makeOklch = (l: number, c: number, h: number): Oklch => ({
  l: Math.min(1, Math.max(0, l)),
  c: Math.max(0, c),
  h: clampHue(h),
});

const toColor = (v: Oklch): Color => new Color('oklch', [v.l, v.c, v.h]);

export const gamutStatus = (v: Oklch): GamutStatus => {
  const col = toColor(v);
  return { inSrgb: col.inGamut('srgb'), inP3: col.inGamut('p3') };
};

/**
 * sRGB triple 0-255 for display and for the contrast maths.
 *
 * Out-of-gamut values are mapped, NOT clipped silently -- but the caller is expected to
 * have announced the out-of-gamut state first. This function is the rendering path; the
 * honesty obligation lives with whoever calls it.
 */
export const toSrgb255 = (v: Oklch): readonly [number, number, number] => {
  const mapped = toColor(v).toGamut({ space: 'srgb', method: 'css' });
  const [r, g, b] = mapped.to('srgb').coords;
  const to255 = (n: number): number =>
    Math.round(Math.min(1, Math.max(0, n)) * 255);
  return [to255(r ?? 0), to255(g ?? 0), to255(b ?? 0)];
};

export const toHex = (v: Oklch): string => {
  const [r, g, b] = toSrgb255(v);
  const hh = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${hh(r)}${hh(g)}${hh(b)}`;
};

/** CSS `oklch()` with the precision a design system actually uses. */
export const toCss = (v: Oklch): string =>
  `oklch(${round(v.l, 4)} ${round(v.c, 4)} ${round(v.h, 2)})`;

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export interface ParsedColor {
  readonly value: Oklch;
  /** The CSS custom-property name when one was pasted; otherwise undefined. */
  readonly label?: string | undefined;
}

/**
 * Parses one pasted line.
 *
 * Accepts a bare colour in any CSS syntax, or a custom-property declaration. The label is
 * taken from the declaration when present -- that is the ONLY source of a label on the
 * paste path, and pasting a bare colour legitimately yields none.
 */
export const parseColor = (input: string): ParsedColor | undefined => {
  const text = input.trim().replace(/;$/, '');
  if (text === '') return undefined;

  const decl = /^(--[A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(text);
  const body = decl?.[2] ?? text;
  const label = decl?.[1];

  try {
    const [l, c, h] = new Color(body).to('oklch').coords;
    const value = makeOklch(l ?? 0, c ?? 0, Number.isNaN(h) ? 0 : (h ?? 0));
    return label === undefined ? { value } : { value, label };
  } catch {
    return undefined;
  }
};

/** Parses a multi-line paste, dropping lines that are not colours. */
export const parseColors = (input: string): readonly ParsedColor[] =>
  input
    .split('\n')
    .map((line) => parseColor(line))
    .filter((p): p is ParsedColor => p !== undefined);
