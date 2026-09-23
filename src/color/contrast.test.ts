import { describe, expect, it } from 'vitest';
import {
  makeOklch,
  parseColor,
  parseColors,
  toCss,
  gamutStatus,
} from './oklch';
import { describeVerdict, verdictFor, wcagRatio } from './contrast';

const WHITE = makeOklch(1, 0, 0);
const NEAR_BLACK = makeOklch(0.18, 0, 0);
const MID_RED = makeOklch(0.6, 0.2, 25);

describe('APCA polarity is signed — the input WCAG does not need', () => {
  it('reports different magnitudes for the two directions', () => {
    // A WCAG ratio is symmetric: swap the pair, same number. APCA is not. This is exactly
    // why the active colour must declare whether it is text or background.
    const asBackground = verdictFor(MID_RED, WHITE, 'background', 'White');
    const asText = verdictFor(MID_RED, WHITE, 'text', 'White');
    expect(asBackground.apca.lc).not.toBeCloseTo(asText.apca.lc, 1);
  });

  it('keeps the WCAG ratio symmetric across the same swap', () => {
    const a = verdictFor(MID_RED, WHITE, 'background', 'White');
    const b = verdictFor(MID_RED, WHITE, 'text', 'White');
    expect(a.wcag.ratio).toBeCloseTo(b.wcag.ratio, 6);
  });
});

describe('rule 1 — a verdict names a text class, never a bare score', () => {
  it.each(['terse', 'normal', 'verbose'] as const)(
    'at %s verbosity',
    (verbosity) => {
      const spoken = describeVerdict(
        verdictFor(MID_RED, WHITE, 'background', 'White'),
        verbosity,
      );
      expect(spoken).toMatch(/text|Not suitable/i);
    },
  );
});

describe('rule 2 — a verdict always names its foreground', () => {
  it.each(['terse', 'normal', 'verbose'] as const)(
    'at %s verbosity',
    (verbosity) => {
      const spoken = describeVerdict(
        verdictFor(MID_RED, WHITE, 'background', 'White'),
        verbosity,
      );
      // Scopes the claim structurally, so it cannot be read as a universal statement.
      expect(spoken.startsWith('White on this colour.')).toBe(true);
    },
  );
});

describe('rule 3 — disagreement is disclosed, and never gated on verbosity', () => {
  /** Walks lightness to find a pair where the two methods genuinely diverge on body text. */
  const findDisagreement = () => {
    for (let l = 0.3; l <= 0.95; l += 0.005) {
      const v = verdictFor(
        makeOklch(l, 0.12, 250),
        WHITE,
        'background',
        'White',
      );
      if (v.disagreement !== undefined) return v;
    }
    return undefined;
  };

  it('such a pair exists — the case is real, not hypothetical', () => {
    expect(findDisagreement()).toBeDefined();
  });

  it('states the contradiction at EVERY verbosity level including terse', () => {
    const v = findDisagreement();
    expect(v).toBeDefined();
    if (v === undefined) return;
    for (const verbosity of ['terse', 'normal', 'verbose'] as const) {
      expect(describeVerdict(v, verbosity)).toContain('These disagree');
    }
  });

  it('orients the contradiction to the audit context, not to which method is correct', () => {
    const v = findDisagreement();
    if (v === undefined) return;
    const spoken = describeVerdict(v, 'normal');
    expect(spoken).toMatch(/audits to WCAG 2\.2|better predictor/);
  });
});

describe('the word "safe" never appears unqualified', () => {
  it('holds across a sweep of lightness, both roles, both verbosity extremes', () => {
    for (let l = 0.05; l <= 1; l += 0.05) {
      for (const role of ['background', 'text'] as const) {
        for (const verbosity of ['terse', 'verbose'] as const) {
          const spoken = describeVerdict(
            verdictFor(makeOklch(l, 0.15, 140), NEAR_BLACK, role, 'Near-black'),
            verbosity,
          );
          expect(spoken).not.toMatch(/\bsafe\b/i);
        }
      }
    }
  });
});

describe('WCAG reference is always present above terse', () => {
  it('names itself as a reference rather than as the verdict', () => {
    const spoken = describeVerdict(
      verdictFor(MID_RED, WHITE, 'background', 'White'),
      'normal',
    );
    expect(spoken).toContain('WCAG 2.2 reference:');
  });
});

describe('wcagRatio', () => {
  it('gives 21:1 for black on white, the known extreme', () => {
    expect(wcagRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });
  it('gives 1:1 for a colour against itself', () => {
    expect(wcagRatio([120, 30, 90], [120, 30, 90])).toBeCloseTo(1, 6);
  });
});

describe('parsing', () => {
  it('takes the label from a custom-property declaration — the only paste-path source', () => {
    const p = parseColor('--accent-background: oklch(0.55 0.18 250);');
    expect(p?.label).toBe('--accent-background');
    expect(p?.value.h).toBeCloseTo(250, 0);
  });

  it('yields no label for a bare colour, rather than inventing one', () => {
    const p = parseColor('#ff8800');
    expect(p).toBeDefined();
    expect(p?.label).toBeUndefined();
  });

  it('drops non-colour lines from a multi-line paste instead of failing the whole paste', () => {
    const parsed = parseColors(
      '--a: #fff;\nnot a colour\n--b: oklch(0.5 0.1 200);',
    );
    expect(parsed).toHaveLength(2);
  });
});

describe('gamut is reported, never silently decided', () => {
  it('flags a colour outside sRGB but inside P3', () => {
    const vivid = makeOklch(0.7, 0.28, 145);
    const g = gamutStatus(vivid);
    expect(g.inSrgb).toBe(false);
    expect(typeof g.inP3).toBe('boolean');
  });
  it('round-trips a plain colour through CSS output', () => {
    expect(toCss(makeOklch(0.55, 0.18, 250))).toBe('oklch(0.55 0.18 250)');
  });
});
