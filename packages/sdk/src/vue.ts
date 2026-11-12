/**
 * Vue binding (0.6): useSetupState(store) is a shallow ref that follows a setup store, released when the calling
 * scope (a component's setup, or an effectScope) is disposed. Needs vue >= 3.3 (an optional peer dependency).
 */
import { getCurrentScope, onScopeDispose, shallowRef, type ShallowRef } from "vue";
import type { SetupState, SetupStore } from "./store";

export function useSetupState(store: SetupStore): Readonly<ShallowRef<SetupState>> {
  const state = shallowRef(store.getSnapshot());
  const stop = store.subscribe(() => {
    state.value = store.getSnapshot();
  });
  if (getCurrentScope()) onScopeDispose(stop);
  return state;
}
