/**
 * Compile-time gate for `getConnection` and the `dnsHosting` field, in the style of
 * nameserver-methods.assert.ts.
 *
 * What it pins: the call takes the widget token, the four states a domain's DNS hosting can be in are
 * exactly the ones the API sends, and `dnsHosting` is optional (a control plane that predates the field
 * sends none), so a caller must handle its absence. Type-only, no runtime behavior; compiled by
 * `tsc -p tsconfig.json`, which is the package's build and typecheck.
 */
import type { Connection, ConnectionDnsHosting, CustomDomain } from "./index";

/** Compiles only when A and B are mutually assignable. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** Never called: the body only has to compile, one line at a time. */
async function _connectionCalls(sdk: CustomDomain): Promise<void> {
  const connection: Connection = await sdk.getConnection("conn_1", { token: "tok" });
  await sdk.getConnection("conn_1", { token: "tok", apiBase: "https://api.test" });
  // Absent is a legal answer, so the type makes the caller look.
  const hosting: ConnectionDnsHosting | undefined = connection.dnsHosting;
  void hosting;

  // @ts-expect-error getConnection needs the config with the token
  await sdk.getConnection("conn_1");
  // @ts-expect-error a config without a token is not one
  await sdk.getConnection("conn_1", {});
}

const _states: Exact<ConnectionDnsHosting["state"], "none" | "moving" | "hosted" | "failed"> = true;
const _whoRunsIt: Exact<NonNullable<ConnectionDnsHosting["by"]>, "customdomain" | "dns_host" | "custom"> = true;
const _statusIsTheConnectionsOwn: Exact<Connection["status"], "pending" | "propagating" | "live" | "failed"> = true;
const _dnsHostingIsOptional: undefined extends Connection["dnsHosting"] ? true : never = true;
const _optionalFields: Exact<Pick<ConnectionDnsHosting, "by" | "provider" | "zone" | "since">, { by?: ConnectionDnsHosting["by"]; provider?: string; zone?: string; since?: string }> = true;

void _states;
void _whoRunsIt;
void _statusIsTheConnectionsOwn;
void _dnsHostingIsOptional;
void _optionalFields;
void _connectionCalls;

export type {};
