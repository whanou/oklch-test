# @whanou/oklch-test

An accessible OKLCH colour tool. One colour is the active edit target; you adjust lightness,
chroma and hue directly, hear whether text is readable on it, and copy the result.

Built for screen-reader use first. The sighted view is a view of the same state.

## Isolation

This package imports **nothing** from the rest of the monorepo and pins every dependency
explicitly rather than through pnpm `catalog:`. Copy the directory out of this repo and
`pnpm install && pnpm build` still works.

`src/isolation.test.ts` enforces both properties mechanically — it fails on a `@whanou/*`
import, on a path escaping the package, and on any `catalog:` or `workspace:` specifier.

## Commands

```
pnpm dev       # local dev server
pnpm build     # typecheck, then production build into dist/
pnpm preview   # serve the built output
pnpm test      # unit tests
```

## Deployment

`.github/workflows/deploy-oklch-test.yml` builds and publishes `dist/` to GitHub Pages on
pushes to `main` that touch this package. The workflow injects `BASE_PATH=/<repo>/`, which
is what a GitHub Pages **project site** requires — without it every asset URL 404s.

**One-time setup:** in the repository settings, set *Pages → Build and deployment → Source*
to **GitHub Actions**. The workflow cannot do this for you.

## Design notes worth knowing before changing anything

**APCA is primary; WCAG 2.2 is a permanently visible reference.** Not a preference — APCA's
`Lc` is *signed*, so dark-text-on-light and light-text-on-dark are different calculations.
That is why the active colour must declare whether it is the text or the background. A WCAG
ratio is symmetric and needs no such input.

**Thresholds are never transcribed.** `apca-w3@0.1.9` supplies both the contrast value and
`fontLookupAPCA`, the authoritative font-size × weight table. Copying those numbers into
this codebase would create a silent fork of a spec that has moved between revisions. The
pinned version *is* the citation.

**Three rules govern every verdict**, and each is tested:
1. It names a **text class** (kind and size), never a bare score.
2. It names its **foreground**. "Against white: body text" cannot be misread as a universal
   claim the way "body text" can — two words instead of a repeated disclaimer.
3. When APCA and WCAG disagree, it **says so**, at every verbosity level including terse.
   They are never merged into one pass/fail, and "safe" is never used unqualified.

**Never double-speak.** L, C and H are native `<input type="number">`. The control announces
its own value; nothing mirrors it into a live region. Shift-stepping works by swapping the
element's `step` attribute so the *browser* still performs the change — writing `.value`
from script announces twice or not at all, depending on the screen reader. At the default
terse verbosity the live region is deliberately left empty.

**Defaults are starting points, not answers.** White and near-black seed the *foreground*
list only. The colour-vision comparand list is **never** seeded: a seeded comparand would
let the tool report a distinguishability number that checked nothing relevant, to someone
who cannot verify it.

## Not in this build

- **Colour-vision simulation.** The comparand list and its honest empty state are wired, but
  per-comparand Brettel/Machado simulation is not implemented. The UI says so rather than
  reporting a number it cannot produce. Implementing it requires transformation matrices
  from a citable source — the same discipline applied to the APCA tables.
- **The constraint solver** (fix-suggestions and goal-seeking).
- **Compare** — delta reporting between two reference colours.
