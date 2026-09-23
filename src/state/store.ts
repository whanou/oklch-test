import type { Oklch } from '../color/oklch';
import { makeOklch } from '../color/oklch';
import type { Role, Verbosity } from '../color/contrast';

/**
 * A reference colour, and the roles it may hold.
 *
 * Three roles, not two. Compare's operand is distinct from a contrast foreground and from a
 * CVD comparand: collapsing Compare into the CVD list would make it unusable at first run,
 * because CVD comparands are never seeded.
 */
export interface ReferenceColor {
  readonly id: string;
  readonly label: string;
  readonly value: Oklch;
  /** Seeded defaults are foregrounds ONLY. A seeded CVD comparand would let the tool
   *  report a distinguishability result that checked nothing relevant. */
  readonly isDefault: boolean;
  readonly asForeground: boolean;
  readonly asCvdComparand: boolean;
}

export interface AppState {
  readonly active: Oklch;
  readonly activeLabel: string | undefined;
  readonly role: Role;
  readonly verbosity: Verbosity;
  readonly references: readonly ReferenceColor[];
}

export const SEEDED: readonly ReferenceColor[] = [
  {
    id: 'white',
    label: 'White',
    value: makeOklch(1, 0, 0),
    isDefault: true,
    asForeground: true,
    asCvdComparand: false,
  },
  {
    id: 'near-black',
    label: 'Near-black',
    value: makeOklch(0.18, 0, 0),
    isDefault: true,
    asForeground: true,
    asCvdComparand: false,
  },
];

export const initialState = (): AppState => ({
  active: makeOklch(0.6, 0.2, 25),
  activeLabel: undefined,
  role: 'background',
  verbosity: 'terse',
  references: SEEDED,
});

type Listener = (s: AppState) => void;

export interface Store {
  readonly get: () => AppState;
  readonly set: (patch: Partial<AppState>) => void;
  readonly subscribe: (fn: Listener) => void;
}

export const makeStore = (initial: AppState): Store => {
  let state = initial;
  const listeners: Listener[] = [];
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe: (fn) => void listeners.push(fn),
  };
};
