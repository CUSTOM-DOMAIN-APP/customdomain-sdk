/**
 * Compile-time parity gate between this wrapper and the vanilla SDK for the nameserver methods.
 *
 * The hook does not wrap `getNameserverMove`, `startNameserverMove` and `rollbackNameservers`: a call
 * needs a token, not a modal, so a React app reaches them through the `CustomDomain` class this package
 * re-exports (`new CustomDomain().getNameserverMove(id, { token })`). What it must be able to do is
 * import their types from here, and those must be the SDK's own, not look-alikes that drift when the SDK
 * adds a field. Type-only, no runtime behavior; compiled by `tsc -p tsconfig.json`, so a type the SDK
 * adds to the nameserver surface without being re-exported here, or a re-export that stops being the
 * SDK's, fails the build.
 *
 * Adding a nameserver type to the SDK? Re-export it from index.tsx and assert it here in the same change.
 */
import type {
  ConnectionCallConfig as SdkConnectionCallConfig,
  CustomDomain,
  NameserverConsent as SdkNameserverConsent,
  NameserverMove as SdkNameserverMove,
  NameserverMoveErrorCode as SdkNameserverMoveErrorCode,
  NameserverMoveState as SdkNameserverMoveState,
  NameserverNextAction as SdkNameserverNextAction,
  NameserverRegistrar as SdkNameserverRegistrar,
  NameserverRollbackTarget as SdkNameserverRollbackTarget,
} from "customdomain-js";
import type {
  ConnectionCallConfig,
  NameserverConsent,
  NameserverMove,
  NameserverMoveErrorCode,
  NameserverMoveState,
  NameserverNextAction,
  NameserverRegistrar,
  NameserverRollbackTarget,
} from "./index";
import { CustomDomain as ReExportedCustomDomain } from "./index";

/** Compiles only when A and B are mutually assignable. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
/** Compiles only when K is a key of T. */
type Has<T, K extends keyof T> = Exact<K, K>;

const _configIsReExported: Exact<ConnectionCallConfig, SdkConnectionCallConfig> = true;
const _consentIsReExported: Exact<NameserverConsent, SdkNameserverConsent> = true;
const _moveIsReExported: Exact<NameserverMove, SdkNameserverMove> = true;
const _stateIsReExported: Exact<NameserverMoveState, SdkNameserverMoveState> = true;
const _errorCodeIsReExported: Exact<NameserverMoveErrorCode, SdkNameserverMoveErrorCode> = true;
const _nextActionIsReExported: Exact<NameserverNextAction, SdkNameserverNextAction> = true;
const _registrarIsReExported: Exact<NameserverRegistrar, SdkNameserverRegistrar> = true;
const _rollbackTargetIsReExported: Exact<NameserverRollbackTarget, SdkNameserverRollbackTarget> = true;

// The class the wrapper re-exports has the three methods, so the route the docs describe exists.
const _sdkHasTheMethods: Has<CustomDomain, "getNameserverMove" | "startNameserverMove" | "rollbackNameservers"> = true;
const _reExportedClassIsTheSdks: Exact<InstanceType<typeof ReExportedCustomDomain>, CustomDomain> = true;

export type {};
void _configIsReExported;
void _consentIsReExported;
void _moveIsReExported;
void _stateIsReExported;
void _errorCodeIsReExported;
void _nextActionIsReExported;
void _registrarIsReExported;
void _rollbackTargetIsReExported;
void _sdkHasTheMethods;
void _reExportedClassIsTheSdks;
