/**
 * Compile-time gate for the nameserver methods' signatures, in the style of open-mode-parity.assert.ts.
 *
 * What it pins: the consent of `startNameserverMove` is REQUIRED by the type (the API refuses a widget
 * token's move without one, and the method checks it at runtime too), the rollback target is optional
 * and only one of the two places a move back can go, and every call takes the widget token. A signature
 * that loosens any of these stops compiling here, so the types cannot quietly promise less than the
 * runtime checks. Type-only, no runtime behavior; compiled by `tsc -p tsconfig.json`, which is the
 * package's build and typecheck.
 */
import type {
  CustomDomain,
  NameserverConsent,
  NameserverMove,
  NameserverMoveErrorCode,
  NameserverMoveState,
  NameserverRollbackTarget,
} from "./index";

/** Compiles only when A and B are mutually assignable. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const cfg = { token: "tok" };

/** Never called: the body only has to compile, one line at a time. */
async function _nameserverCalls(sdk: CustomDomain): Promise<void> {
  // The calls the docs show.
  const read: NameserverMove | null = await sdk.getNameserverMove("conn_1", cfg);
  const start: NameserverMove = await sdk.startNameserverMove("conn_1", { id: "nsm-consent", version: "3" }, cfg);
  await sdk.startNameserverMove("conn_1", { id: "nsm-consent", version: "3" }, { ...cfg, apiBase: "https://api.test", copyReviewed: true });
  await sdk.rollbackNameservers("conn_1", cfg);
  await sdk.rollbackNameservers("conn_1", "previous", cfg);
  await sdk.rollbackNameservers("conn_1", "registrar_default", { ...cfg, apiBase: "https://api.test" });
  await sdk.rollbackNameservers("conn_1", undefined, cfg);
  void read;
  void start;

  // The consent is required, and it is an id AND a version.
  // @ts-expect-error startNameserverMove has no form without the consent
  await sdk.startNameserverMove("conn_1", cfg);
  // @ts-expect-error the consent needs a version
  await sdk.startNameserverMove("conn_1", { id: "nsm-consent" }, cfg);
  // @ts-expect-error the consent needs an id
  await sdk.startNameserverMove("conn_1", { version: "3" }, cfg);
  // @ts-expect-error a version is a string, not a number
  await sdk.startNameserverMove("conn_1", { id: "nsm-consent", version: 3 }, cfg);

  // Every call takes the token.
  // @ts-expect-error getNameserverMove needs the config with the token
  await sdk.getNameserverMove("conn_1");
  // @ts-expect-error a config without a token is not one
  await sdk.getNameserverMove("conn_1", {});
  // @ts-expect-error rollbackNameservers needs the config with the token
  await sdk.rollbackNameservers("conn_1", "previous");
  // @ts-expect-error a rollback with a target but no config is not a call
  await sdk.rollbackNameservers("conn_1", undefined);

  // A move back goes to one of two places.
  // @ts-expect-error not a place a move back can go
  await sdk.rollbackNameservers("conn_1", "elsewhere", cfg);
}

const _consentIsAnIdAndAVersion: Exact<keyof NameserverConsent, "id" | "version"> = true;
const _consentFieldsAreStrings: Exact<NameserverConsent[keyof NameserverConsent], string> = true;
const _rollbackTargets: Exact<NameserverRollbackTarget, "previous" | "registrar_default"> = true;
// A move's rollback fields speak the same two words.
const _moveBackFieldsUseThem: Exact<NonNullable<NameserverMove["rollbackDefault"]>, NameserverRollbackTarget> = true;
const _moveBackListUsesThem: Exact<NameserverMove["rollbackTargets"], NameserverRollbackTarget[]> = true;
// The states a poll ends on are members of the state union.
const _endStates: "active" | "failed" | "rolled_back" extends NameserverMoveState ? true : never = true;
// The refusal an end user can meet for another end user's connection is a named code.
const _wrongEndUserIsTyped: "token_wrong_end_user" extends NameserverMoveErrorCode ? true : never = true;
// A move's registrar and next action may be null, which is a different answer from a missing field.
const _registrarMayBeNull: null extends NameserverMove["registrar"] ? true : never = true;
const _nextActionMayBeNull: null extends NameserverMove["nextAction"] ? true : never = true;
const _oldDnsServesMayBeNull: null extends NameserverMove["oldDnsServes"] ? true : never = true;

void _consentIsAnIdAndAVersion;
void _consentFieldsAreStrings;
void _rollbackTargets;
void _moveBackFieldsUseThem;
void _moveBackListUsesThem;
void _endStates;
void _wrongEndUserIsTyped;
void _registrarMayBeNull;
void _nextActionMayBeNull;
void _oldDnsServesMayBeNull;
void _nameserverCalls;

export type {};
