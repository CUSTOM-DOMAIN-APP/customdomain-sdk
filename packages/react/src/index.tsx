/**
 * @customdomain/react — a thin, idiomatic React wrapper around `customdomain-js`.
 *
 * The vanilla SDK renders the widget in an iframe, exposes `window.customdomain`,
 * and bridges the widget's postMessage protocol onto `customdomain:*` window
 * CustomEvents. This package surfaces that flow as a React hook
 * (`useCustomdomain`) and a declarative component (`<CustomdomainConnect>`),
 * turning each window event into an ergonomic callback prop and cleaning up
 * every listener (and any open modal) on unmount.
 *
 * SSR-safe: the SDK is only ever touched inside effects / after a `typeof window`
 * guard, so importing this module on the server is a no-op.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  customdomain as sdkSingleton,
  type CustomDomain,
  type OpenConfig,
  type SuccessResult,
  type CloseDetail,
  type StepDetail,
  type PurchaseInitiated,
} from "customdomain-js";

// Re-export the SDK's public surface so consumers get fully-typed props/results
// from a single import (`@customdomain/react`).
export type {
  DNSRecord,
  DNSRecordType,
  SetupType,
  WhiteLabel,
  OpenConfig,
  SuccessResult,
  StepDetail,
  CloseDetail,
  PurchaseInitiated,
  CheckDomainResult,
  CheckRecordsResult,
} from "customdomain-js";
export { CustomDomain, CustomDomainError } from "customdomain-js";

/** Event callbacks — one per native `customdomain:*` window CustomEvent. */
export interface CustomdomainEventHandlers {
  /** `customdomain:success` — the connection job was created. */
  onSuccess?: (result: SuccessResult) => void;
  /** `customdomain:close` — the modal was dismissed / torn down. */
  onClose?: (detail: CloseDetail) => void;
  /** `customdomain:step` — the widget advanced to a new screen (legacy bare-string). */
  onStep?: (step: string) => void;
  /** `customdomain:step` — the widget advanced to a new screen (full step detail). */
  onStepChange?: (detail: StepDetail) => void;
  /** `customdomain:doc-click` — the user followed a documentation link. */
  onDocClick?: (detail: unknown) => void;
  /** `customdomain:request-close` — host owns dismissal (`whiteLabel.delegateClose`). */
  onRequestClose?: (detail: unknown) => void;
  /** `customdomain:shared` — a shared/delegated setup link event. */
  onShared?: (detail: unknown) => void;
  /**
   * `customdomain:purchase` — the widget created a checkout session for a
   * domain the user is buying (WS4-F6). The widget cannot mount Stripe.js
   * inside its own iframe, so this is the payment handoff: mount Embedded
   * Checkout with `clientSecret` (or send the user to `url` for a hosted
   * session), then finalize with POST /v1/registrar/fulfill, which registers
   * and connects the domain. Start the flow with {@link
   * UseCustomdomainResult.purchaseDomain}.
   */
  onPurchase?: (detail: PurchaseInitiated) => void;
}

/**
 * Options accepted by {@link useCustomdomain} / {@link CustomdomainConnect}: the
 * full SDK `OpenConfig` (applicationId, token, domain, whiteLabel, …) with the
 * event-shaped callbacks swapped for the React handlers above. `onError` (which
 * has no window-event equivalent) is passed straight through to the SDK.
 */
export type UseCustomdomainOptions = Omit<
  OpenConfig,
  "onSuccess" | "onClose" | "onStepChange"
> &
  CustomdomainEventHandlers;

export interface UseCustomdomainResult {
  /** Open the widget modal. Optional per-call overrides merge over the options. */
  open: (overrides?: Partial<OpenConfig>) => { close: () => void } | undefined;
  /**
   * Sell: open the widget on the buy-a-domain screen (the SDK's
   * `purchaseDomain`). This is the ONLY way in — the SDK gates the buy flow on
   * a `purchase` flag that is not a member of `OpenConfig`, so `open()` cannot
   * reach it through its overrides. Pair it with `onPurchase`, which receives
   * the checkout session once the user picks a domain.
   */
  purchaseDomain: (overrides?: Partial<OpenConfig>) => { close: () => void } | undefined;
  /** Close/tear down the modal. */
  close: () => void;
  /** True once `window.customdomain` is available (client-side). */
  ready: boolean;
}

// `customdomain:step` is handled separately (it drives two callbacks), so it's
// not in this 1:1 table.
const EVENT_HANDLERS: ReadonlyArray<[string, keyof CustomdomainEventHandlers]> = [
  ["customdomain:success", "onSuccess"],
  ["customdomain:close", "onClose"],
  ["customdomain:doc-click", "onDocClick"],
  ["customdomain:request-close", "onRequestClose"],
  ["customdomain:shared", "onShared"],
  ["customdomain:purchase", "onPurchase"],
];

// Wrapper-only callbacks: every event above is delivered through the window
// listeners, so leaving one of these on the config handed to the SDK would make
// it fire twice. `onStep` has no SDK equivalent at all; `onError` is absent on
// purpose — it has no window event, so the SDK is its only delivery path and it
// must ride through (documented on UseCustomdomainOptions).
const WRAPPER_ONLY_KEYS = [
  "onSuccess",
  "onClose",
  "onStep",
  "onStepChange",
  "onDocClick",
  "onRequestClose",
  "onShared",
  "onPurchase",
] as const;

/** Resolve the SDK instance, or null during SSR. */
function getSdk(): CustomDomain | null {
  if (typeof window === "undefined") return null;
  // Importing the package registers `window.customdomain`; fall back to the
  // imported singleton (identical object) for resilience.
  return window.customdomain ?? sdkSingleton;
}

/**
 * useCustomdomain — imperative access to the widget. Wires the SDK's seven
 * window CustomEvents (success, close, step, doc-click, request-close, shared,
 * purchase — packages/sdk/src/index.ts:269-278, minus `error`, which the SDK
 * delivers only through `onError`) to your callbacks for the lifetime of the
 * component, and returns `open` / `purchaseDomain` / `close`. Listeners and any
 * open modal are removed on unmount.
 */
export function useCustomdomain(options: UseCustomdomainOptions): UseCustomdomainResult {
  // Keep the latest options/callbacks without re-subscribing listeners.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [ready, setReady] = useState<boolean>(() => !!getSdk());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const registered: Array<[string, EventListener]> = [];
    for (const [eventName, key] of EVENT_HANDLERS) {
      const listener: EventListener = (e) => {
        const cb = optionsRef.current[key];
        if (!cb) return;
        (cb as (d: unknown) => void)((e as CustomEvent).detail);
      };
      window.addEventListener(eventName, listener);
      registered.push([eventName, listener]);
    }

    // The step event drives both callbacks: the legacy bare-string `onStep` and
    // the full-detail `onStepChange`. Neither narrows the other.
    const stepListener: EventListener = (e) => {
      const detail = (e as CustomEvent).detail as StepDetail | undefined;
      optionsRef.current.onStep?.(detail?.step ?? "");
      optionsRef.current.onStepChange?.(detail as StepDetail);
    };
    window.addEventListener("customdomain:step", stepListener);
    registered.push(["customdomain:step", stepListener]);

    if (getSdk()) {
      setReady(true);
    } else {
      // CDN-only case: wait for the SDK to announce itself.
      const onReady: EventListener = () => setReady(true);
      window.addEventListener("customdomain:ready", onReady, { once: true });
      registered.push(["customdomain:ready", onReady]);
    }

    return () => {
      for (const [eventName, listener] of registered) {
        window.removeEventListener(eventName, listener);
      }
      // Tear down any modal this component opened.
      getSdk()?.close();
    };
  }, []);

  // Build the SDK config from the latest options, then strip the wrapper's
  // event callbacks: every event is delivered through the window listeners
  // above, so leaving `onSuccess`/`onClose` on the config would double-fire.
  const sdkConfig = useCallback((overrides?: Partial<OpenConfig>): OpenConfig => {
    const config = { ...(optionsRef.current as unknown as OpenConfig), ...overrides };
    for (const key of WRAPPER_ONLY_KEYS) {
      delete (config as Record<string, unknown>)[key];
    }
    return config;
  }, []);

  const open = useCallback(
    (overrides?: Partial<OpenConfig>) => getSdk()?.open(sdkConfig(overrides)),
    [sdkConfig]
  );

  // Delegates to the SDK's own purchaseDomain rather than setting the flag
  // here: `purchase` is not a member of OpenConfig, and the SDK owns that cast
  // (packages/sdk/src/index.ts:485-487). Re-implementing it in the wrapper is
  // how the two surfaces drift apart again.
  const purchaseDomain = useCallback(
    (overrides?: Partial<OpenConfig>) => getSdk()?.purchaseDomain(sdkConfig(overrides)),
    [sdkConfig]
  );

  const close = useCallback(() => {
    getSdk()?.close();
  }, []);

  return { open, purchaseDomain, close, ready };
}

export interface CustomdomainConnectProps extends UseCustomdomainOptions {
  /**
   * Whether the modal should be open. Defaults to `true`, so mounting
   * `<CustomdomainConnect .../>` opens the flow immediately; flip to `false`
   * (or unmount) to close it.
   */
  open?: boolean;
}

/**
 * CustomdomainConnect — declarative wrapper. Mount it (typically after your
 * server mints a token) to open the connect flow; it renders nothing itself.
 */
export function CustomdomainConnect({ open = true, ...options }: CustomdomainConnectProps): null {
  const { open: openModal, close, ready } = useCustomdomain(options);

  useEffect(() => {
    if (!open || !ready) return;
    const handle = openModal();
    return () => {
      handle?.close();
      close();
    };
  }, [open, ready, openModal, close]);

  return null;
}
