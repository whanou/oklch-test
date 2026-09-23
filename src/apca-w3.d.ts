/**
 * Types for `apca-w3`, which ships no declarations.
 *
 * Deliberately NOT a re-implementation. APCA's thresholds have moved between revisions, so
 * transcribing them into this codebase would create a copy that silently goes stale -- the
 * exact failure the proposal's "cite a specific revision" rule exists to prevent. The
 * citation here is the pinned package version (apca-w3@0.1.9), and these declarations only
 * describe its surface.
 */
declare module 'apca-w3' {
  /** sRGB triple 0-255 -> luminance Y. */
  export function sRGBtoY(rgb: readonly [number, number, number]): number;
  /**
   * Signed lightness contrast. POLARITY MATTERS: positive is dark text on a light
   * background, negative is light text on dark. This is the property a WCAG ratio does not
   * have, and the reason the active colour must declare whether it is text or background.
   */
  export function APCAcontrast(textY: number, bgY: number): number;
  /**
   * Authoritative font lookup. Returns a 10-element array:
   * index 0 is the Lc as a string, indices 1..9 are the minimum font size in px for
   * weights 100..900. The sentinel 777 means "not usable at this weight".
   */
  export function fontLookupAPCA(lc: number): readonly (string | number)[];
}
