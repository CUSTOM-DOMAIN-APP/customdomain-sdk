/**
 * Compile-time gate: every open mode the WIDGET accepts must be expressible on
 * the SDK's `OpenConfig.mode`, and the SDK must offer no mode the widget lacks.
 *
 * `mode` is forwarded to the widget unchanged (buildInitPayload), so a mode the
 * type omits still works at runtime. That is how "reconnect" shipped in the
 * widget while the published 0.5.4 types named only "connect" and "remove", and
 * the docs told TypeScript integrators to cast it. Same rule as
 * whitelabel-parity.assert.ts: the list below mirrors `WidgetOptions.mode` in
 * the widget's types.ts (product monorepo, packages/widget/src); a mode added
 * there is added here and to `OpenConfig.mode` in the same change.
 *
 * Type-only, no runtime behavior; compiled by `tsc -p tsconfig.json`, which is
 * the package's build and typecheck.
 */
import type { OpenConfig, SetupType, SuccessResult } from "./index";

/** The modes the widget's `WidgetOptions.mode` accepts. */
type WidgetOpenModes = "connect" | "remove" | "reconnect";

/** Compiles only when A and B are mutually assignable. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const _modesMatchTheWidget: Exact<NonNullable<OpenConfig["mode"]>, WidgetOpenModes> = true;

// A reconnect ends in the customdomain:success every host already listens to,
// with setupType "reconnect" and reconnected: true (the widget's
// onReconnectResult), so both must be expressible on SuccessResult.
const _reconnectIsASetupType: "reconnect" extends SetupType ? true : never = true;
const _successSaysReconnected: Exact<SuccessResult["reconnected"], boolean | undefined> = true;
const _reconnectSuccess: SuccessResult = {
  jobId: "conn_1",
  domain: "acme.com",
  setupType: "reconnect",
  provider: "godaddy",
  success: true,
  reconnected: true,
};

// A reconnect is addressed like a removal: by `connectionId`, or by the domain,
// which the widget looks up. Neither is required by the type.
const _reconnectById: OpenConfig = { applicationId: "app_1", token: "t", mode: "reconnect", connectionId: "conn_1" };
const _reconnectByDomain: OpenConfig = { applicationId: "app_1", token: "t", mode: "reconnect", domain: "acme.com" };

// @ts-expect-error a mode the widget does not know is refused
const _unknownMode: OpenConfig = { applicationId: "app_1", token: "t", mode: "renew" };

void _modesMatchTheWidget;
void _reconnectIsASetupType;
void _successSaysReconnected;
void _reconnectSuccess;
void _reconnectById;
void _reconnectByDomain;
void _unknownMode;

export type {};
