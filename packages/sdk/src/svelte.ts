/**
 * Svelte binding (0.6): a setup store as a Svelte readable store (the store contract: subscribe calls back at once
 * with the current value, then on every change). No dependency on svelte: `$setup` works in any Svelte version.
 */
import type { SetupState, SetupStore } from "./store";

export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

export function toReadable(store: SetupStore): Readable<SetupState> {
  return {
    subscribe(run) {
      run(store.getSnapshot());
      return store.subscribe(() => run(store.getSnapshot()));
    },
  };
}
