/**
 * The setup store (0.6): one small, framework-free state machine for an open() session, built from the widget's
 * events (protocol/protocol.json). `bind(config)` returns the config with the store's callbacks chained before yours;
 * `subscribe` and `getSnapshot` fit React's useSyncExternalStore, the Vue and Svelte bindings and plain code alike.
 * The snapshot object is replaced on every change and never mutated, so identity comparison is enough.
 */
import type { CloseDetail, FallbackDetail, OpenConfig, RemovedResult, StepDetail, SuccessResult } from "./index";

/** Where a setup stands: not opened yet, open, finished (success), failed (error shown), or closed. */
export type SetupPhase = "idle" | "open" | "success" | "error" | "closed";

export interface SetupState {
  phase: SetupPhase;
  /** The last step the widget reported (customdomain:step). */
  step?: StepDetail;
  /** Set once the domain went live (customdomain:success). */
  result?: SuccessResult;
  /** The last error the widget showed (customdomain:error). */
  error?: { code: string; message: string };
  /** Set when the person was sent to copy the records (customdomain:fallback). */
  fallback?: FallbackDetail;
  /** Set when a removal finished (customdomain:removed). */
  removed?: RemovedResult;
  /** Set when the modal closed (customdomain:close). */
  closed?: CloseDetail;
}

export interface SetupStore {
  getSnapshot(): SetupState;
  /** Calls listener after every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** The config to pass to open(): the store's callbacks run first, then yours. */
  bind(config: OpenConfig): OpenConfig;
  /** Back to idle, for the next open(). */
  reset(): void;
}

const IDLE: SetupState = Object.freeze({ phase: "idle" }) as SetupState;

export function createSetupStore(): SetupStore {
  let state: SetupState = IDLE;
  const listeners = new Set<() => void>();
  const set = (next: Partial<SetupState>) => {
    state = Object.freeze({ ...state, ...next });
    for (const l of [...listeners]) l();
  };
  const chain = <A>(mine: (a: A) => void, theirs?: (a: A) => void) => (a: A) => {
    mine(a);
    theirs?.(a);
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      state = IDLE;
      for (const l of [...listeners]) l();
    },
    bind(config) {
      set({ phase: "open", step: undefined, result: undefined, error: undefined, fallback: undefined, removed: undefined, closed: undefined });
      return {
        ...config,
        onStepChange: chain((step: StepDetail) => set({ step, phase: state.phase === "error" ? "open" : state.phase }), config.onStepChange),
        onSuccess: chain((result: SuccessResult) => set({ result, phase: "success" }), config.onSuccess),
        onError: chain((err: { code: string; message: string }) => set({ error: { code: err.code, message: err.message }, phase: state.phase === "success" ? "success" : "error" }), config.onError),
        onFallback: chain((fallback: FallbackDetail) => set({ fallback }), config.onFallback),
        onRemoved: chain((removed: RemovedResult) => set({ removed }), config.onRemoved),
        onClose: chain((closed: CloseDetail) => set({ closed, phase: state.phase === "success" ? "success" : "closed" }), config.onClose),
      };
    },
  };
}
