/**
 * Entri drop-in compatibility shim.
 *
 * A tenant migrating off Entri already calls `window.entri.showEntri(...)` and
 * listens for `onSuccess` / `onEntri*` window events. This module mirrors the
 * native `window.customdomain` surface + `customdomain:*` CustomEvents under
 * those Entri names so their existing integration keeps working unchanged.
 *
 * GUARDRAIL: this only ADDS the alias surface. Both namespaces stay live —
 * `window.customdomain` / `customdomain:*` are never touched or removed.
 */
import type { CustomDomain, OpenConfig, DNSRecord, CheckDomainResult, CheckRecordsResult } from "./index";

/**
 * Native event → Entri alias. The detail object is re-dispatched verbatim,
 * except `customdomain:shared`, whose `{domain}` is renamed to `{sharedFlowId}`
 * to match the incumbent's onSharedFlowSent payload.
 */
const ALIASES: ReadonlyArray<[string, string, ((detail: unknown) => unknown)?]> = [
  ["customdomain:success", "onSuccess"],
  ["customdomain:close", "onEntriClose"],
  ["customdomain:step", "onEntriStepChange"],
  ["customdomain:doc-click", "onEntriManualSetupDocumentationClick"],
  ["customdomain:request-close", "onEntriRequestClose"],
  ["customdomain:shared", "onSharedFlowSent", renameSharedDetail],
];

function renameSharedDetail(detail: unknown): unknown {
  if (detail && typeof detail === "object") {
    const { domain, ...rest } = detail as Record<string, unknown>;
    return { sharedFlowId: domain, ...rest };
  }
  return detail;
}

/** The Entri-named facade delegating to the customdomain singleton. */
export interface EntriFacade {
  /** Incumbent alias of open(). */
  showEntri(config: OpenConfig): { close: () => void };
  open(config: OpenConfig): { close: () => void };
  checkDomain(domain: string, cfg: { token: string; apiBase?: string }): Promise<CheckDomainResult>;
  checkRecords(
    domain: string,
    cfg: { token: string; dnsRecords: DNSRecord[]; apiBase?: string }
  ): Promise<CheckRecordsResult>;
  load(): Promise<void>;
  loadSharedFlow(url: string, config?: Partial<OpenConfig>): { close: () => void };
  close(): void;
  /** Incumbent alias of close(). */
  closeModal(): void;
  purchaseDomain(config: OpenConfig): { close: () => void };
}

/**
 * Install the Entri-compatible surface: define `window.entri`, re-dispatch every
 * `customdomain:*` event under its `onEntri*` alias, and fire `entri:ready`.
 * A no-op (returns undefined) outside the browser.
 */
export function installEntriCompat(sdk: CustomDomain): EntriFacade | undefined {
  if (typeof window === "undefined") return undefined;

  const facade: EntriFacade = {
    showEntri: (config) => sdk.open(config),
    open: (config) => sdk.open(config),
    checkDomain: (domain, cfg) => sdk.checkDomain(domain, cfg),
    checkRecords: (domain, cfg) => sdk.checkRecords(domain, cfg),
    load: () => sdk.load(),
    loadSharedFlow: (url, config) => sdk.loadSharedFlow(url, config),
    close: () => sdk.close(),
    closeModal: () => sdk.close(),
    purchaseDomain: (config) => sdk.purchaseDomain(config),
  };
  window.entri = facade;

  for (const [native, alias, map] of ALIASES) {
    window.addEventListener(native, (e) => {
      const detail = (e as CustomEvent).detail;
      window.dispatchEvent(new CustomEvent(alias, { detail: map ? map(detail) : detail }));
    });
  }

  // Callers install this right after `customdomain:ready` is dispatched, so the
  // incumbent's `entri:ready` follows directly.
  window.dispatchEvent(new CustomEvent("entri:ready", { detail: {} }));

  return facade;
}

declare global {
  interface Window {
    entri: EntriFacade;
  }
}
