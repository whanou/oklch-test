import { APCAcontrast, fontLookupAPCA, sRGBtoY } from 'apca-w3';
import type { Oklch } from './oklch';
import { toSrgb255 } from './oklch';

/**
 * The contrast model.
 *
 * APCA produces the primary suitability guidance; WCAG 2.2 is carried as a permanently
 * visible labelled reference. Three rules govern every output here:
 *
 *   1. A verdict always names a TEXT CLASS (kind and size), never a bare score. A score is
 *      not an answer to "can I use this".
 *   2. A verdict always names its FOREGROUND. "Against white: body text" cannot be mistaken
 *      for a universal claim about the colour the way "body text" can. Two words, and it
 *      removes the need for a repeated disclaimer -- repetition being the main cause of
 *      screen-reader abandonment.
 *   3. When APCA and WCAG disagree, the disagreement is stated explicitly. They are never
 *      merged into one pass/fail, and the word "safe" is never used unqualified.
 */

/** Which side of the pair the colour being edited is on. APCA is signed, so this is required. */
export type Role = 'background' | 'text';

/** WCAG 2.2 AA thresholds. Normative and fixed in a published Recommendation. */
const WCAG_AA_NORMAL = 4.5;
const WCAG_AA_LARGE = 3;

/** APCA's sentinel for "not usable at this weight". */
const APCA_UNUSABLE = 777;

/** Sizes at or below this read as body text; above it, the user is choosing a heading. */
const BODY_TEXT_MAX_PX = 18;
/** Above this, nothing reasonable counts as running text. */
const LARGE_TEXT_MAX_PX = 36;

export interface WcagReading {
  readonly ratio: number;
  readonly passesAaNormal: boolean;
  readonly passesAaLarge: boolean;
}

export interface ApcaReading {
  /** Signed. Sign encodes polarity; magnitude encodes contrast. */
  readonly lc: number;
  /** Minimum px at weight 400, or undefined when unusable at that weight. */
  readonly minSizeRegular: number | undefined;
  /** Minimum px at weight 700. */
  readonly minSizeBold: number | undefined;
  readonly allowsBodyText: boolean;
}

export interface Verdict {
  /** Never omitted. Rule 2. */
  readonly foregroundLabel: string;
  readonly apca: ApcaReading;
  readonly wcag: WcagReading;
  /** Present only when the two methods diverge on body text. Rule 3. */
  readonly disagreement:
    | 'apca-permits-wcag-does-not'
    | 'wcag-permits-apca-does-not'
    | undefined;
}

const relativeLuminance = ([r, g, b]: readonly [
  number,
  number,
  number,
]): number => {
  const ch = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

export const wcagRatio = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

const sizeAtWeight = (
  lookup: readonly (string | number)[],
  weight: number,
): number | undefined => {
  // index 0 is the Lc string; 1..9 are weights 100..900.
  const idx = Math.round(weight / 100);
  const raw = lookup[idx];
  if (typeof raw !== 'number' || raw >= APCA_UNUSABLE) return undefined;
  return raw;
};

export const readApca = (
  textRgb: readonly [number, number, number],
  bgRgb: readonly [number, number, number],
): ApcaReading => {
  const lc = APCAcontrast(sRGBtoY(textRgb), sRGBtoY(bgRgb));
  const lookup = fontLookupAPCA(lc);
  const minSizeRegular = sizeAtWeight(lookup, 400);
  const minSizeBold = sizeAtWeight(lookup, 700);
  return {
    lc,
    minSizeRegular,
    minSizeBold,
    allowsBodyText:
      minSizeRegular !== undefined && minSizeRegular <= BODY_TEXT_MAX_PX,
  };
};

/**
 * Builds a verdict for one pair.
 *
 * `active` is the colour being edited and `other` is the reference colour; `role` says which
 * of them is the text. Getting this backwards produces a different Lc, not a rounding
 * difference -- which is why the role is an explicit input rather than an inference.
 */
export const verdictFor = (
  active: Oklch,
  other: Oklch,
  role: Role,
  foregroundLabel: string,
): Verdict => {
  const activeRgb = toSrgb255(active);
  const otherRgb = toSrgb255(other);
  const [textRgb, bgRgb] =
    role === 'background' ? [otherRgb, activeRgb] : [activeRgb, otherRgb];

  const apca = readApca(textRgb, bgRgb);
  const ratio = wcagRatio(textRgb, bgRgb);
  const wcag: WcagReading = {
    ratio,
    passesAaNormal: ratio >= WCAG_AA_NORMAL,
    passesAaLarge: ratio >= WCAG_AA_LARGE,
  };

  let disagreement: Verdict['disagreement'];
  if (apca.allowsBodyText && !wcag.passesAaNormal)
    disagreement = 'apca-permits-wcag-does-not';
  else if (!apca.allowsBodyText && wcag.passesAaNormal)
    disagreement = 'wcag-permits-apca-does-not';

  return { foregroundLabel, apca, wcag, disagreement };
};

export type Verbosity = 'terse' | 'normal' | 'verbose';

/**
 * Renders a verdict as speech.
 *
 * Every branch names the foreground, names a text class, and never says "safe" on its own.
 * The disagreement clause is MANDATORY when present -- it is not gated on verbosity,
 * because a student who cannot see the colour needs the contradiction more than they need
 * the numbers.
 */
export const describeVerdict = (v: Verdict, verbosity: Verbosity): string => {
  const parts: string[] = [];
  const fg = v.foregroundLabel;

  parts.push(`${fg} on this colour.`);
  parts.push(`${suitability(v.apca)}.`);

  if (verbosity !== 'terse') {
    parts.push(`APCA Lc ${v.apca.lc.toFixed(0)}.`);
    parts.push(
      `WCAG 2.2 reference: ${v.wcag.ratio.toFixed(1)} to 1 — ` +
        `${v.wcag.passesAaNormal ? 'passes' : 'fails'} AA normal text, ` +
        `${v.wcag.passesAaLarge ? 'passes' : 'fails'} AA large text.`,
    );
  }

  // Mandatory at every verbosity level.
  if (v.disagreement === 'apca-permits-wcag-does-not') {
    parts.push(
      'These disagree. APCA allows body text here; WCAG 2.2 does not. ' +
        'If your team audits to WCAG 2.2, treat this as failing for body text.',
    );
  } else if (v.disagreement === 'wcag-permits-apca-does-not') {
    parts.push(
      'These disagree. WCAG 2.2 allows body text here; APCA does not. ' +
        'APCA is the better predictor of readability on screens, so prefer larger or bolder text.',
    );
  } else if (verbosity !== 'terse') {
    parts.push('APCA and WCAG agree.');
  }

  return parts.join(' ');
};

const suitability = (a: ApcaReading): string => {
  if (a.minSizeRegular === undefined && a.minSizeBold === undefined) {
    return 'Not suitable for text at any size or weight';
  }
  const clauses: string[] = [];
  if (a.minSizeRegular !== undefined && a.minSizeRegular <= LARGE_TEXT_MAX_PX) {
    clauses.push(`regular text from ${a.minSizeRegular} pixels`);
  }
  if (a.minSizeBold !== undefined && a.minSizeBold <= LARGE_TEXT_MAX_PX) {
    clauses.push(`bold text from ${a.minSizeBold} pixels`);
  }
  if (clauses.length === 0)
    return 'Not suitable for text at any reasonable size';
  const head = a.allowsBodyText
    ? 'Suitable for body text'
    : 'Suitable for large or bold text only';
  return `${head}: ${clauses.join(', ')}`;
};
