import type { Store } from '../state/store';
import type { ReferenceColor } from '../state/store';
import { encodeHash, saveVerbosity } from '../state/hash';
import type { Role, Verbosity } from '../color/contrast';
import { describeVerdict, verdictFor } from '../color/contrast';
import {
  gamutStatus,
  makeOklch,
  parseColors,
  toCss,
  toHex,
} from '../color/oklch';

/**
 * The interface.
 *
 * One active colour is the subject. Everything else is optional context. The three rules
 * from the proposal's §4.3 are load-bearing here and each is implemented structurally
 * rather than by convention:
 *
 *   1. NEVER DOUBLE-SPEAK. L, C and H are native `<input type="number">`. The control
 *      announces its own value change; nothing mirrors it. Shift-stepping is implemented by
 *      swapping the element's `step` attribute so the BROWSER still performs the change --
 *      writing `.value` from script would either announce twice or not at all, depending on
 *      the screen reader.
 *   2. LONG CONTENT IS NOT AN ANNOUNCEMENT. Verification lives in a focusable region with a
 *      heading, so it is re-readable at the user's pace. Live regions cannot be re-read.
 *   3. POLITE, DEBOUNCED. At terse verbosity the live region is left EMPTY -- the default
 *      setting adds nothing at all to what the control already said.
 */

const STEP = {
  l: { normal: 0.01, shift: 0.05 },
  c: { normal: 0.005, shift: 0.02 },
  h: { normal: 1, shift: 15 },
} as const;

export const mountApp = (root: HTMLElement, store: Store): void => {
  root.innerHTML = `
    <main>
      <h1>Accessible OKLCH colour tool</h1>
      <p class="muted">Adjust one colour, hear whether text is readable on it, and copy it.</p>

      <section id="active" aria-labelledby="active-h">
        <h2 id="active-h" tabindex="-1">The colour</h2>
        <p class="value" id="active-value"></p>
        <div class="swatch" id="swatch" role="img" aria-label="Visual preview. The text description above is the authoritative one."></div>

        <div class="controls">
          <div class="field">
            <label for="in-l">Lightness</label>
            <input id="in-l" type="number" min="0" max="1" step="0.01" inputmode="decimal" />
          </div>
          <div class="field">
            <label for="in-c">Chroma</label>
            <input id="in-c" type="number" min="0" max="0.5" step="0.005" inputmode="decimal" />
          </div>
          <div class="field">
            <label for="in-h">Hue</label>
            <input id="in-h" type="number" min="0" max="360" step="1" inputmode="decimal" />
          </div>
          <div class="field">
            <label for="in-role">This colour is the</label>
            <select id="in-role">
              <option value="background">background</option>
              <option value="text">text</option>
            </select>
          </div>
          <div class="field">
            <label for="in-verbosity">Spoken detail</label>
            <select id="in-verbosity">
              <option value="terse">Terse</option>
              <option value="normal">Normal</option>
              <option value="verbose">Verbose</option>
            </select>
          </div>
        </div>
        <p class="muted" id="step-hint">Hold Shift with the arrow keys for larger steps.</p>
        <p id="gamut"></p>
        <button id="copy">Copy CSS</button>
        <button id="copy-link">Copy shareable link</button>
      </section>

      <section aria-labelledby="verify-h">
        <h2 id="verify-h">Verification</h2>
        <div class="region" id="verify" tabindex="0" aria-labelledby="verify-h"></div>
      </section>

      <section aria-labelledby="refs-h">
        <h2 id="refs-h">Reference colours</h2>
        <p class="muted">
White and near-black are starting points, not an answer. Add the colour you are actually pairing with.
        </p>
        <h3>Used as foregrounds</h3>
        <ul class="refs" id="refs-fg"></ul>
        <h3>Compared for colour-vision distinguishability</h3>
        <ul class="refs" id="refs-cvd"></ul>
        <h3>Add a colour</h3>
        <label for="paste" class="muted">Paste a CSS colour or custom-property declaration, one per line.</label>
        <textarea id="paste" rows="3"></textarea>
        <button id="add">Add to reference colours</button>
      </section>

      <div aria-live="polite" aria-atomic="true" class="sr-only" id="live"></div>
      <div aria-live="assertive" class="sr-only" id="alert"></div>
    </main>`;

  const $ = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
    if (el === null) throw new Error(`missing #${id}`);
    return el;
  };

  const inL = $<HTMLInputElement>('in-l');
  const inC = $<HTMLInputElement>('in-c');
  const inH = $<HTMLInputElement>('in-h');
  const inRole = $<HTMLSelectElement>('in-role');
  const inVerbosity = $<HTMLSelectElement>('in-verbosity');
  const live = $<HTMLElement>('live');

  // --- shift stepping, done natively (rule 1) ---------------------------------------
  const wireShiftStep = (
    el: HTMLInputElement,
    axis: keyof typeof STEP,
  ): void => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        el.step = String(e.shiftKey ? STEP[axis].shift : STEP[axis].normal);
      }
    });
    el.addEventListener('keyup', () => {
      el.step = String(STEP[axis].normal);
    });
    el.addEventListener('input', () => {
      store.set({
        active: makeOklch(
          Number(inL.value),
          Number(inC.value),
          Number(inH.value),
        ),
      });
    });
  };
  wireShiftStep(inL, 'l');
  wireShiftStep(inC, 'c');
  wireShiftStep(inH, 'h');

  inRole.addEventListener('change', () =>
    store.set({ role: inRole.value as Role }),
  );
  inVerbosity.addEventListener('change', () => {
    const v = inVerbosity.value as Verbosity;
    saveVerbosity(v);
    store.set({ verbosity: v });
  });

  $<HTMLButtonElement>('copy').addEventListener('click', () => {
    const s = store.get();
    const decl =
      s.activeLabel === undefined
        ? toCss(s.active)
        : `${s.activeLabel}: ${toCss(s.active)};`;
    void navigator.clipboard
      .writeText(decl)
      .then(() => announce(`Copied: ${decl}`));
  });

  $<HTMLButtonElement>('copy-link').addEventListener('click', () => {
    const url = `${location.origin}${location.pathname}#${encodeHash(store.get())}`;
    void navigator.clipboard
      .writeText(url)
      .then(() =>
        announce(
          'Copied a link carrying the colour, its role, and your reference colours.',
        ),
      );
  });

  $<HTMLButtonElement>('add').addEventListener('click', () => {
    const box = $<HTMLTextAreaElement>('paste');
    const parsed = parseColors(box.value);
    if (parsed.length === 0) {
      $<HTMLElement>('alert').textContent = 'No colour found in that text.';
      return;
    }
    const s = store.get();
    const added: ReferenceColor[] = parsed.map((p, i) => ({
      id: `ref-${String(Date.now())}-${String(i)}`,
      label: p.label ?? toHex(p.value),
      value: p.value,
      isDefault: false,
      asForeground: true,
      asCvdComparand: false,
    }));
    store.set({ references: [...s.references, ...added] });
    box.value = '';
    announce(
      `Added ${String(added.length)} reference colour${added.length === 1 ? '' : 's'}.`,
    );
  });

  let announceTimer: number | undefined;
  const announce = (msg: string): void => {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      live.textContent = msg;
    }, 120);
  };

  // --- render ------------------------------------------------------------------------
  const render = (): void => {
    const s = store.get();

    // Inputs are the source of their own announcements; only sync when they have drifted,
    // so a re-render never re-announces a value the user just typed.
    const sync = (el: HTMLInputElement, v: number): void => {
      const next = String(v);
      if (el.value !== next && document.activeElement !== el) el.value = next;
    };
    sync(inL, round(s.active.l, 4));
    sync(inC, round(s.active.c, 4));
    sync(inH, round(s.active.h, 2));
    inRole.value = s.role;
    inVerbosity.value = s.verbosity;

    const name = s.activeLabel ?? 'Colour';
    $<HTMLElement>('active-value').textContent = `${name}. ${toCss(s.active)}`;
    $<HTMLElement>('swatch').style.background = toHex(s.active);

    // Gamut: announced, never silently resolved.
    const g = gamutStatus(s.active);
    const gamutEl = $<HTMLElement>('gamut');
    if (g.inSrgb) {
      gamutEl.textContent = 'In sRGB gamut.';
      gamutEl.className = 'muted';
    } else {
      gamutEl.textContent = g.inP3
        ? 'Outside sRGB, inside Display P3. The preview above is gamut-mapped; the value you copy is not.'
        : 'Outside both sRGB and Display P3. The preview above is gamut-mapped; the value you copy is not.';
      gamutEl.className = 'flag';
    }

    renderVerification(s);
    renderReferences(s);

    // Rule 3: terse adds nothing to what the control already announced.
    if (s.verbosity === 'terse') live.textContent = '';
    else {
      const first = s.references.find((r) => r.asForeground);
      if (first !== undefined) {
        announce(
          describeVerdict(
            verdictFor(s.active, first.value, s.role, first.label),
            s.verbosity,
          ),
        );
      }
    }

    history.replaceState(null, '', `#${encodeHash(s)}`);
  };

  const renderVerification = (s: ReturnType<Store['get']>): void => {
    const box = $<HTMLElement>('verify');
    const foregrounds = s.references.filter((r) => r.asForeground);
    const comparands = s.references.filter((r) => r.asCvdComparand);

    const contrast =
      foregrounds.length === 0
        ? '<p>No foreground colours selected, so no readability result is reported.</p>'
        : foregrounds
            .map((f) => {
              const v = verdictFor(s.active, f.value, s.role, f.label);
              const spoken = describeVerdict(
                v,
                s.verbosity === 'terse' ? 'normal' : s.verbosity,
              );
              return `<p class="verdict${v.disagreement !== undefined ? ' flag' : ''}">${escapeHtml(spoken)}</p>`;
            })
            .join('');

    // The honest empty state. Seeding this list with white and near-black would let the tool
    // report a distinguishability number that checked nothing relevant.
    // Sentences are single-line: a template literal wrapped mid-sentence puts runs of
    // whitespace into the DOM text, which is what assistive tech actually reads.
    const cvd =
      comparands.length === 0
        ? '<p>No colour-vision comparands designated, so <strong>no distinguishability result is reported</strong>. As general guidance, differences that are only in hue are the risky ones for colour-vision deficiency; differences in lightness are the safest.</p>' +
          '<p class="muted">Per-comparand simulation is not implemented in this build.</p>'
        : `<p class="muted">Per-comparand simulation is not implemented in this build. ${String(comparands.length)} comparand${comparands.length === 1 ? '' : 's'} designated.</p>`;

    box.innerHTML = `<h3>Readability</h3>${contrast}<h3>Colour-vision distinguishability</h3>${cvd}`;
  };

  const renderReferences = (s: ReturnType<Store['get']>): void => {
    const row = (
      r: ReferenceColor,
      kind: 'asForeground' | 'asCvdComparand',
    ): string => `
      <li>
        <span class="value">${escapeHtml(r.label)}</span>
        <span class="muted">${escapeHtml(toCss(r.value))}</span>
        ${r.isDefault ? '<span class="muted">starting point</span>' : ''}
        <span class="roles">
          <label><input type="checkbox" data-id="${r.id}" data-role="${kind}" ${r[kind] ? 'checked' : ''} /> use</label>
        </span>
      </li>`;

    $<HTMLElement>('refs-fg').innerHTML = s.references
      .map((r) => row(r, 'asForeground'))
      .join('');
    $<HTMLElement>('refs-cvd').innerHTML = s.references
      .map((r) => row(r, 'asCvdComparand'))
      .join('');

    for (const box of root.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][data-id]',
    )) {
      box.addEventListener('change', () => {
        const id = box.dataset['id'];
        const role = box.dataset['role'];
        if (id === undefined || role === undefined) return;
        store.set({
          references: store
            .get()
            .references.map((r) =>
              r.id === id ? { ...r, [role]: box.checked } : r,
            ),
        });
      });
    }
  };

  store.subscribe(render);
  render();
};

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === '&'
      ? '&amp;'
      : ch === '<'
        ? '&lt;'
        : ch === '>'
          ? '&gt;'
          : ch === '"'
            ? '&quot;'
            : '&#39;',
  );
