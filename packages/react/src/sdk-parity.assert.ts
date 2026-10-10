/**
 * Compile-time parity gate between this wrapper and the vanilla SDK.
 *
 * P6.8 · L7: the buy-a-domain flow existed in `customdomain-js`
 * (`customdomain:purchase` + `PurchaseInitiated` + `purchaseDomain()`) and in
 * the widget, and was missing from this package entirely — so the event was
 * silently dropped for every React consumer and there was no way to open the
 * buy screen at all. Nothing failed; the surface was just quietly smaller.
 *
 * Type-only, no runtime behavior. It exists so `tsc -p tsconfig.json` (the
 * package's own build, run by `pnpm -r build` in CI) fails the moment a member
 * the SDK offers stops being reachable from here.
 *
 * Adding a rail to the SDK? Add its assertion here in the same change.
 */
import type {
  CustomDomain,
  OpenConfig,
  PurchaseInitiated as SdkPurchaseInitiated,
  RemovedResult as SdkRemovedResult,
} from "customdomain-js";
import type {
  CustomdomainEventHandlers,
  PurchaseInitiated,
  RemovedResult,
  UseCustomdomainOptions,
  UseCustomdomainResult,
} from "./index";

/** Compiles only when A and B are mutually assignable. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
/** Compiles only when K is a key of T. */
type Has<T, K extends keyof T> = Exact<K, K>;

// The purchase payload must be the SDK's own type, re-exported — not a
// structural look-alike that can drift when the SDK adds a field.
const _payloadIsReExported: Exact<PurchaseInitiated, SdkPurchaseInitiated> = true;

// A React consumer must be able to receive `customdomain:purchase` …
const _handlerExists: Has<CustomdomainEventHandlers, "onPurchase"> = true;
const _handlerIsAccepted: Has<UseCustomdomainOptions, "onPurchase"> = true;
// …and the handler must be typed with the payload, not `unknown`.
const _handlerIsTyped: Exact<
  Parameters<NonNullable<CustomdomainEventHandlers["onPurchase"]>>[0],
  PurchaseInitiated
> = true;

// …and must be able to START the flow. `open()` cannot: the SDK gates the buy
// screen on a `purchase` flag that is not a member of OpenConfig (index.ts:517
// casts to set it), so a dedicated entry point is the only reachable route.
const _canStartPurchase: Has<UseCustomdomainResult, "purchaseDomain"> = true;

// Removal: the SDK and the widget gained `removeDomain()`, `onRemoved` and the
// `customdomain:removed` event, and this wrapper had no handler or entry point
// for them. Same rule as the buy flow: the payload is the SDK's own type, the
// handler is typed with it, and the hook can START the flow.
const _removedPayloadIsReExported: Exact<RemovedResult, SdkRemovedResult> = true;
const _removedHandlerExists: Has<CustomdomainEventHandlers, "onRemoved"> = true;
const _removedHandlerIsAccepted: Has<UseCustomdomainOptions, "onRemoved"> = true;
const _removedHandlerIsTyped: Exact<
  Parameters<NonNullable<CustomdomainEventHandlers["onRemoved"]>>[0],
  RemovedResult
> = true;
// The SDK carries the same callback on OpenConfig; if it stops, this fails.
const _sdkHasOnRemoved: Has<OpenConfig, "onRemoved"> = true;
const _sdkHasRemoveDomain: Has<CustomDomain, "removeDomain"> = true;
// `open()` always starts the connect flow, so removal needs its own entry point,
// as `purchaseDomain` does for the buy screen. It must also take the id of the
// connection to remove, which only OpenConfig can carry.
const _canStartRemoval: Has<UseCustomdomainResult, "removeDomain"> = true;
const _removalIsAddressable: Has<OpenConfig, "connectionId" | "mode"> = true;

export type {};
void _payloadIsReExported;
void _removedPayloadIsReExported;
void _removedHandlerExists;
void _removedHandlerIsAccepted;
void _removedHandlerIsTyped;
void _sdkHasOnRemoved;
void _sdkHasRemoveDomain;
void _canStartRemoval;
void _removalIsAddressable;
void _handlerExists;
void _handlerIsAccepted;
void _handlerIsTyped;
void _canStartPurchase;
