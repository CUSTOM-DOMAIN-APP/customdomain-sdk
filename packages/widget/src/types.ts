import type { WhiteLabelConfig } from "./theme";

/** DNS record shape (EntriConfig.dnsRecords-compatible superset). */
export interface DnsRecord {
  type: string;
  host: string;
  value: string;
  ttl?: number;
  priority?: number | null;
  applied?: boolean;
  /** DKIM grouping hint: records marked dkim render on the DKIM_SETUP screen. */
  purpose?: "dkim" | string;
}

/**
 * The init payload the SDK posts into the iframe. A superset of the legacy
 * {token, domain, dnsRecords, theme} shape (still accepted) carrying the
 * EntriConfig-compatible options the widget acts on.
 */
export interface InitPayload {
  token: string;
  domain?: string;
  dnsRecords?: DnsRecord[];
  theme?: Record<string, string>; // legacy {accent}
  config?: WidgetOptions;
}

/** EntriConfig-compatible options (spec §1.6) the widget honors today. */
export interface WidgetOptions {
  applicationName?: string;
  /** Pre-filled domain(s). A string connects one; an array is processed
   * sequentially (multi-domain, CP-PAR-3). */
  prefilledDomain?: string | string[];
  locale?: string;
  whiteLabel?: WhiteLabelConfig;
  forceManualSetup?: boolean;
  supportForSubdomains?: boolean; // default true
  defaultSubdomain?: string;
  hostRequired?: boolean;
  manualSetupDocumentation?: string; // deep-link to the tenant's own guide
  enableDkim?: boolean;
  /** Show the email-setup screen (email-full template records) before domain records. */
  enableEmail?: boolean;
  userId?: string;
  /**
   * WS6-F3 (Side B / end-user attribution): the integrator's OWN identifier for
   * the end user this widget-origin connect belongs to (e.g. the tenant's own
   * customer id). Threaded into the POST /v1/connections `end_user_ref` field so
   * the console can render "Connected by …" and customer search instead of a
   * bare "Direct". Distinct from userId, which is only echoed back on step
   * events. Omitted when unset — the connect request is unchanged.
   */
  endUserRef?: string;
  /** Force the flow onto a subdomain (the apex option is removed). */
  forceSubdomain?: boolean;
  /** Search mode for the purchase/buy screen (e.g. "standard" | "ai"). */
  searchType?: string;
  /** Sell: open the purchase flow instead of connect. */
  purchase?: boolean;
  /**
   * WS3-F3: opt this widget's Domain Connect flow into the durable MANAGED (async)
   * rail so the tenant keeps ongoing authority over the end-user's DNS instead of a
   * one-shot connect. The widget requests it through the same security-checked
   * domainconnect:start gate the console/MCP use; the control plane falls back to
   * the sync redirect when the provider or deployment can't do async, so enabling
   * it never breaks a connect. Default false (the unchanged one-shot behavior).
   */
  managed?: boolean;
}

/** Wire shape of /v1/domains:check (snake_case). */
export interface CheckInfo {
  domain?: string;
  /** Server's authoritative PSL parse verdict: subdomain labels ("" when the
   * domain IS the registrable apex). Adopt over any local heuristic — the
   * server's full Public Suffix List is the one source of truth for where the
   * registrable boundary sits. */
  subdomain?: string;
  registrable_domain?: string;
  public_suffix?: string;
  provider?: string;
  setup_type?: string;
  supports_automatic?: boolean;
  oauth_available?: boolean;
  domain_connect?: boolean;
  registered?: boolean;
  authoritative_dns_provider?: string;
  ns_support?: { root?: boolean; subdomains?: boolean };
  wildcard_support?: boolean;
  cname_flattening?: boolean;
  spf_override_support?: boolean;
  caa_support?: boolean;
  supports_social_login?: string;
  record_conflicts?: RecordConflict[];
  /** Provider's automated-write conflict threshold (0 / absent = no modeled limit). */
  conflict_tolerance?: number;
  /** True when current conflicts exceed the threshold, so an automated flow would
   * silently fall back to manual — prompt the user to clear conflicts first. */
  will_fallback_to_manual?: boolean;
}

export interface RecordConflict {
  kind: string;
  host: string;
  type: string;
  existing: string;
  desired: string;
}

/** Wire shape of a connection (snake_case, straight from the control-plane). */
export interface Connection {
  id: string;
  application_id: string;
  domain: string;
  provider_id?: string;
  setup_type: string;
  status: "pending" | "propagating" | "live" | "failed" | "timed_out";
  created_at: string;
  records?: DnsRecord[];
}

/** Payload the control-plane's OAuth callback page postMessages to the widget. */
export interface OAuthResult {
  ok: boolean;
  code?: string;
  message?: string;
  connection_id?: string;
  provider?: string;
  domain?: string;
}

/** One entry of GET /v1/providers (capability catalog). */
export interface ProviderInfo {
  id: string;
  rail?: string;
  oauth?: boolean;
}
