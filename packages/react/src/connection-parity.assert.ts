/**
 * Compile-time parity gate between this wrapper and the vanilla SDK for `getConnection` and the
 * `dnsHosting` field. Same reason and rule as nameserver-parity.assert.ts: the hook does not wrap the
 * call, so what a React app needs is the SDK's own types re-exported, not look-alikes that drift.
 * Type-only, no runtime behavior; compiled by `tsc -p tsconfig.json`.
 *
 * Adding a field to the SDK's `Connection`? It comes through the re-export; nothing to change here.
 */
import type {
  Connection as SdkConnection,
  ConnectionDnsHosting as SdkConnectionDnsHosting,
  CustomDomain,
} from "customdomain-js";
import type { Connection, ConnectionDnsHosting } from "./index";

/** Compiles only when A and B are mutually assignable. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
/** Compiles only when K is a key of T. */
type Has<T, K extends keyof T> = Exact<K, K>;

const _connectionIsReExported: Exact<Connection, SdkConnection> = true;
const _dnsHostingIsReExported: Exact<ConnectionDnsHosting, SdkConnectionDnsHosting> = true;
const _connectionCarriesDnsHosting: Has<Connection, "dnsHosting"> = true;
const _sdkHasGetConnection: Has<CustomDomain, "getConnection"> = true;

export type {};
void _connectionIsReExported;
void _dnsHostingIsReExported;
void _connectionCarriesDnsHosting;
void _sdkHasGetConnection;
