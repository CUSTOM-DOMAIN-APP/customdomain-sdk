/**
 * customdomain-js — the integrator SDK (the integrator SDK, spec §6).
 *
 * Framework-free. Renders the widget in an iframe and bridges its postMessage
 * protocol onto BOTH callback props and native `customdomain:*` window
 * CustomEvents. Global: `window.customdomain`.
 *
 * 12 methods: open, checkDomain, checkRecords, load, loadSharedFlow, close,
 * purchaseDomain, removeDomain, the three nameserver methods getNameserverMove,
 * startNameserverMove and rollbackNameservers, and getConnection (widget token
 * calls, typed in the `Nameserver*` and `Connection*` types below). 8 window CustomEvents:
 * customdomain:success, customdomain:close, customdomain:step,
 * customdomain:doc-click, customdomain:request-close, customdomain:shared,
 * customdomain:purchase, customdomain:removed.
 *
 * Migration compatibility (the window.entri facade + onEntri* event aliases) is
 * isolated in compat.ts and installed via installEntriCompat() — that module is
 * the only place Entri-era naming lives.
 */

import { installEntriCompat } from "./compat";

export type DNSRecordType = "A" | "AAAA" | "CNAME" | "CAA" | "MX" | "NS" | "TXT" | "SPFM" | "REDIR301";

export interface DNSRecord {
  type: DNSRecordType | string;
  host: string;
  value: string;
  ttl?: number;
  priority?: number;
  /** DKIM grouping hint for the widget's DKIM_SETUP screen. */
  purpose?: string;
}

/**
 * How a flow finished, on `SuccessResult.setupType`. `reconnect` is the end of a
 * `mode: "reconnect"` flow: the domain's lasting API key was renewed and no DNS
 * record changed.
 */
export type SetupType = "automatic" | "manual" | "semiautomatic" | "sharedLogin" | "purchase" | "reconnect";

export interface WhiteLabel {
  colors?: Record<string, string>;
  font?: string;
  /**
   * Stylesheet URL loaded into the widget iframe so a self-hosted or
   * third-party `@font-face` is available to the widget's Shadow-DOM content;
   * `font` still selects the family. https-only and idempotent per URL
   * (packages/widget/src/theme.ts:320-335, applied at app.ts:149), and subject
   * to the widget page's own CSP.
   *
   * P6.8 · L8: the widget has consumed this since WS7-F5 and the SDK forwards
   * `whiteLabel` whole, so it always worked at runtime — but it was absent from
   * this interface, which meant a TypeScript integrator could not express it
   * without a cast.
   */
  fontUrl?: string;
  borderRadius?: string;
  logo?: string;
  /** The logo for dark mode (an `https:` URL or a base64 image). The light `logo` is used when this is absent. */
  logoDark?: string;
  /** Dark mode with no `logoDark`: show `logo` on a small light plate, for a logo drawn for light pages. */
  logoPlate?: boolean;
  hideLogo?: boolean;
  hideConfetti?: boolean;
  tokens?: Record<string, string>;
  screens?: { disable?: string[] };
  /** Host owns dismissal: widget posts request-close instead of closing. */
  delegateClose?: boolean;
  /** Render inside a host container (see OpenConfig.container) instead of a fullscreen modal. */
  embedded?: boolean;
  /**
   * The SDK forwards `whiteLabel` whole into the widget, so these deeper
   * white-label controls ride for free once typed. The widget owns the precise
   * shapes (packages/widget/src/{i18n,icons,theme}.ts); typed loosely here so the
   * SDK stays a pass-through.
   */
  /** Per-screen/per-locale copy overrides: { [locale|"*"]: { key: string } }. */
  customCopy?: Record<string, Record<string, string>>;
  /** Icon slot overrides (https:/data:image URL or inline SVG), keyed by slot. */
  icons?: Record<string, string>;
  /** Dark theme: "disabled" (default) | "enabled" | "auto" (follows the OS). */
  darkMode?: "disabled" | "enabled" | "auto";
  /** Dark-only raw token overrides, applied when dark mode is active. */
  darkTokens?: Record<string, string>;
  /** Load a Google Font into the widget iframe and apply it as the base family. */
  googleFont?: { family: string; weights?: Array<number | string>; display?: string };
  /** Granular UI toggles (incumbent customProperties parity). */
  customProperties?: Record<string, unknown>;
}

/**
 * What the widget is asking `OpenConfig.getToken` for, built from the payload of its
 * `customdomain:token-expired` message. The SDK checks both fields: `domain` is a usable
 * string or absent, and `reason` is one of the two words below.
 */
export interface TokenRequest {
  /**
   * The domain the end user typed, which the token should be bound to: mint it with this
   * `domain` and your own `end_user_ref`. Absent when the widget names none, or sent
   * something other than a non-empty string of at most 253 characters.
   */
  domain?: string;
  /**
   * Why the widget is asking. `"bind"`: the token in use is not bound to `domain`, which a
   * domain check reports as `token_not_bound`; answer with a token minted for that domain.
   * `"expired"`: the token ran out, or the message gave no reason this SDK knows; when
   * `domain` is set, mint the new token for it too, so it stays bound.
   */
  reason: "expired" | "bind";
}

/**
 * OpenConfig is IncumbentConfig-era-compatible (spec §1.6): incumbent key names are
 * accepted directly; CustomDomain™-native aliases noted inline.
 */
export interface OpenConfig {
  /** Application id (public). */
  applicationId: string;
  /** Short-lived widget JWT minted server-side via POST /v1/tokens. */
  token: string;
  /** Pre-filled domain (incumbent: prefilledDomain; string or [string]). */
  domain?: string;
  prefilledDomain?: string | string[];
  /**
   * DKIM records for the widget's DKIM screen. Array mode, or incumbent's
   * per-domain object mode {"acme.com": [records]}.
   *
   * ONLY DKIM RECORDS ARE USED (a `purpose: "dkim"` record, or a host under
   * `_domainkey`). Every other record is ignored, and the SDK says so once in
   * the console: the records a customer is shown and checked against come from
   * the server. Set where customer domains point on the console's Domain
   * routing page (or `PUT /v1/applications/{id}/connect-target`), or supply one
   * connection's records from your backend with
   * `PUT /v1/connections/{id}/records`.
   *
   * ROOT DOMAINS. A CNAME is illegal at a zone apex (RFC 1034 §3.6.2), and most
   * of your users will type `acme.com`, not `www.acme.com`. What happens depends
   * on their DNS provider:
   *
   *   - Cloudflare (flattening) and Namecheap, DNSimple, Porkbun and Vercel
   *     (ALIAS) accept your hostname at the root. Nothing to do.
   *   - GoDaddy has no ALIAS/ANAME/flattening type at all, and a Route 53 alias
   *     can only target AWS resources. A hostname CANNOT be placed at a root
   *     there, so those users cannot complete the connection with a CNAME-only
   *     record set.
   *
   * Give your connect target `apex_ipv4` addresses (PUT
   * /v1/applications/{id}/connect-target) and root domains at those providers
   * get A records to them; or steer those users to a subdomain, or route the
   * apex through the CustomDomain™ edge.
   *
   * `POST /v1/domains:check` returns `integration_warnings` with code
   * `supplied_apex_unrealizable` when this applies — check it during
   * integration. Testing with a subdomain will NOT reveal the problem; only your
   * end users will hit it, and they cannot diagnose it.
   */
  dnsRecords?: DNSRecord[] | Record<string, DNSRecord[]>;
  applicationName?: string;
  locale?: string;
  whiteLabel?: WhiteLabel;
  forceManualSetup?: boolean;
  hostRequired?: boolean;
  defaultSubdomain?: string;
  supportForSubdomains?: boolean;
  manualSetupDocumentation?: string;
  enableDkim?: boolean;
  /** Show the email-setup screen (email-full template records) before domain records. */
  enableEmail?: boolean;
  userId?: string;
  /**
   * WS6-F3 (Side B / end-user attribution): the integrator's OWN identifier for
   * the end user this connect belongs to (e.g. the tenant's own customer id).
   * Forwarded to the widget and sent to the control plane as `end_user_ref` on
   * the connection, so the console can render "Connected by …" and search by
   * customer instead of showing a bare "Direct". Distinct from userId (which is
   * only echoed back on step events). Omit it to leave the connect unchanged.
   */
  endUserRef?: string;
  /**
   * Embedded mode: CSS selector of the host element to render inside (the
   * element must be positioned; the widget fills it as a flat panel). Implies
   * whiteLabel.embedded.
   */
  container?: string;
  /** Legacy CustomDomain™ theme ({accent}). Prefer whiteLabel. */
  theme?: Record<string, string>;
  /** Control-plane + widget base URLs (defaults to CustomDomain™ cloud). */
  apiBase?: string;
  widgetBase?: string;
  /**
   * Override the iframe `sandbox` attribute (advanced). Defaults to the value
   * needed for provider OAuth popups to escape (spec §1.7).
   */
  iframeSandbox?: string;
  /** Force the flow onto a subdomain (widget hides the apex option). */
  forceSubdomain?: boolean;
  /** Search mode for the purchase/buy screen (e.g. "standard" | "ai"). */
  searchType?: string;
  /**
   * WS3-F3: opt the widget's Domain Connect flow into the durable MANAGED (async)
   * rail, so the platform keeps ongoing authority over the end-user's DNS instead
   * of a one-shot connect. The control plane falls back to the standard sync
   * redirect when the provider or deployment can't do async, so enabling it never
   * breaks a connect. Default false.
   */
  managed?: boolean;
  /**
   * Root domains: also connect www and redirect the root to it (true), connect
   * the root alone (false), or leave unset to let the end user choose.
   */
  wwwRedirect?: boolean;
  /**
   * Return a fresh widget token (mint one on your server via POST /v1/tokens).
   * Widget tokens last about 15 minutes and a user adding DNS records by hand
   * often takes longer; with getToken the widget refreshes silently instead of
   * stopping. Without it, the widget tells the user they can close the window
   * and the connection still finishes on its own once the records appear.
   *
   * The argument is a `TokenRequest`, built from the payload of the widget's
   * request. When the widget names the domain the end user typed, it carries
   * that `domain` and, if the token in use is not bound to it, `reason: "bind"`,
   * so you can mint the token with that `domain` and your own `end_user_ref`.
   * A widget build that sends no payload reads as `{ reason: "expired" }` with
   * no `domain`, so `"bind"` is not guaranteed: always handle a plain expiry.
   * A function that takes no argument keeps working: it simply ignores the
   * request.
   */
  getToken?: (ctx?: TokenRequest) => string | Promise<string>;
  /**
   * Which flow the widget opens on. "connect" (the default) connects a domain.
   *
   * "remove" opens the removal flow for a connected domain instead
   * (removeDomain() sets it): the widget shows the DNS records that were
   * added, asks whether to remove or keep them, asks the user to sign in once
   * more when the access used to connect was not kept, and reports what
   * happened in `customdomain:removed`.
   *
   * "reconnect" opens straight on the sign-in that renews the lasting API key
   * CustomDomain™ made at the domain's DNS provider, for when it nears its end
   * or the provider stopped accepting it: one sign-in, a new key, no DNS
   * change. It ends in `customdomain:success` with `setupType: "reconnect"`
   * and `reconnected: true`. A domain with no such key gets a short notice
   * instead. https://docs.customdomain.ai/docs/guides/secure-sign-in#reconnect
   */
  mode?: "connect" | "remove" | "reconnect";
  /**
   * The connection to remove or reconnect, when you kept its id; otherwise the
   * prefilled domain is looked up. Either way the token must be minted for
   * that domain and end user (POST /v1/tokens with `domain` and
   * `end_user_ref`).
   */
  connectionId?: string;
  /** Called when the removal finished (also the `customdomain:removed` event). */
  onRemoved?: (result: RemovedResult) => void;
  /** Callbacks (in addition to the window CustomEvents). */
  onSuccess?: (result: SuccessResult) => void;
  onClose?: (detail: CloseDetail) => void;
  /** Receives the full step detail (superset of the legacy bare-string step). */
  onStepChange?: (step: StepDetail) => void;
  onError?: (err: CustomDomainError) => void;
  /**
   * The widget sent the user to copy records by hand instead of a one-click
   * or sign-in flow, and why (no_end_user_rail, conflicts_exceed_tolerance,
   * provider_unsupported, unknown_provider).
   */
  onFallback?: (detail: FallbackDetail) => void;
}

/** Detail of a `customdomain:removed` event: what happened to the domain's DNS records. */
export interface RemovedResult {
  domain: string;
  connectionId?: string;
  /**
   * removed (every record we added is gone), partly_removed, kept (the user
   * kept them), manual (the user deletes them; the widget listed how),
   * in_use (another application still serves the domain), not_needed.
   */
  records: string;
  removed: Array<{ type: string; name: string; value: string }>;
  restored: Array<{ type: string; name: string; value: string }>;
  leftInPlace: Array<{ type: string; name: string; value: string }>;
  /** Integrator-supplied end-user id (OpenConfig.userId), echoed back. */
  user?: string;
}

/** Detail of a `customdomain:fallback` event. */
export interface FallbackDetail {
  reason: string;
  provider?: string;
  screen?: string;
  message?: string;
}

export interface SuccessResult {
  jobId: string;
  domain: string;
  setupType: SetupType;
  /** DNS provider the domain resolved to (null when unidentified). */
  provider?: string | null;
  /** Always true on the success event — mirrors the incumbent's flag. */
  success?: true;
  /** Sell: the free domain granted with a paid plan, when applicable. */
  freeDomain?: string;
  /**
   * Set when this domain was already live and returned via resume (200) rather
   * than freshly connected — so integrators can distinguish an "already
   * connected" outcome from a fresh connect (WS5-7).
   */
  alreadyConnected?: boolean;
  /**
   * Set (true) when a `mode: "reconnect"` flow renewed the domain's lasting API
   * key, with `setupType: "reconnect"`. No DNS record changed, so tell it apart
   * from a fresh connect before acting on the success.
   */
  reconnected?: boolean;
  /** Multi-domain (CP-PAR-3): domains completed / still pending at this success. */
  processedDomains?: string[];
  pendingDomains?: string[];
}

/**
 * Detail of a `customdomain:purchase` event (WS4-F6). The widget has created a
 * checkout session for `domain` (a quoted order exists server-side); the host
 * completes payment with `clientSecret` (Stripe Embedded Checkout) and then
 * finalizes via POST /v1/registrar/fulfill, which registers and connects the
 * domain. `url` is set only if the control plane returned a hosted-redirect
 * session instead of an embedded one.
 */
export interface PurchaseInitiated {
  domain: string;
  sessionId?: string;
  clientSecret?: string;
  url?: string;
}

/** Detail of a `customdomain:step` / onStepChange event (incumbent onEntriStepChange). */
export interface StepDetail {
  /** Public status name (statuses.ts). */
  step: string;
  domain?: string;
  provider?: string | null;
  /** Integrator-supplied end-user id (OpenConfig.userId), echoed back. */
  user?: string;
  /** Multi-domain (Phase 2): domains still to process / already processed. */
  pendingDomains?: string[];
  processedDomains?: string[];
  /** Conditional-record resolution context (Phase 2). */
  conditionalRecords?: unknown;
  error?: { code: string; title?: string; details?: string };
}

export interface CloseDetail {
  lastStatus?: string;
  error?: { code: string; title?: string; details?: string };
  /** Set when the user forwarded the setup to a colleague before closing. */
  shared?: boolean;
  /** Whether the manual-setup screen was disabled for this session. */
  manualScreenDisabled?: boolean;
}

/** Full feature-detection result of a domain pre-flight (spec §1.6). */
export interface CheckDomainResult {
  domain: string;
  provider: string | null;
  setupType: string;
  supportsAutomatic: boolean;
  oauthAvailable: boolean;
  domainConnect: boolean;
  /**
   * API-12 · the server's Public-Suffix-List parse of the checked domain.
   *
   * These are the authoritative split and exist precisely so a client does not
   * have to guess one: the hand-maintained suffix lists this replaced produced
   * wrong Domain Connect hosts and illegal apex records on long-tail suffixes
   * (a `.co.uk` or `.s3.amazonaws.com` is two labels of suffix, not one).
   *
   * `subdomain` is `""` when the checked domain IS the registrable apex — a
   * meaningful verdict, not a missing value, so test it with `=== ""` rather
   * than for falsiness. The server sends it without omitempty for that reason.
   */
  subdomain?: string;
  registrableDomain?: string;
  publicSuffix?: string;
  registered?: boolean;
  authoritativeDnsProvider?: string;
  NSSupport?: { root?: boolean; subdomains?: boolean };
  wildcardSupport?: boolean;
  cnameFlattening?: boolean;
  spfOverrideSupport?: boolean;
  caaSupport?: boolean;
  supportsSocialLogin?: string;
  /** Existing records the automatic write would replace. */
  recordConflicts?: Array<{ kind: string; host: string; type: string; existing: string; desired: string }>;
  /** Non-destructive advisories (CAA blocking Let's Encrypt, SPF to merge). Never counted
   * toward the automatic to manual fallback; render as authorize or merge. Absent when the
   * control plane does not return the field: one that predates it reports the CAA advisory
   * (kind `caa-blocks-letsencrypt`) in `recordConflicts` instead, so read both. */
  advisories?: Array<{ kind: string; host: string; type: string; existing: string; desired: string }>;
  /**
   * P6.4 · F10 — the rest of the pre-flight the control plane already returns
   * (connect.go:458-466). `recordConflicts` alone is not actionable without
   * them: `willFallbackToManual` is the server's prediction that the provider
   * stops writing automatically past `conflictTolerance` conflicts, so the
   * one-click rail would quietly become a manual record list. A conflict of
   * kind `caa-blocks-letsencrypt` is a CERTIFICATE advisory, not a DNS-write
   * clash, and is deliberately excluded from that count.
   */
  conflictTolerance?: number;
  willFallbackToManual?: boolean;
  /**
   * `apexSupported` is a PROVIDER fact (can it host a CNAME-like record at the
   * zone root); `apexMessage` is a THIS-DOMAIN verdict, non-empty exactly when
   * the apply would refuse this record set. Gate warnings on the MESSAGE — a
   * subdomain connect on an apex-incapable provider is fine (CG-3).
   */
  apexSupported?: boolean;
  apexMessage?: string;
  /**
   * Rail truth (B1). `supportsAutomatic` only ever meant "an adapter exists
   * for this provider" — for GoDaddy that is an API key most accounts cannot
   * obtain. `rails` says, per rail, whether it can run for THIS domain right
   * now and why not when it can't; `recommendedRail` is the server's pick
   * (the same precedence the widget routes on); `endUserAutomatic` is true
   * when that pick needs nothing typed by the end user; `blockedReason` is
   * set when no rail can connect the domain at all (`unregistered`,
   * `platform_subdomain` — the latter is also refused by createConnection).
   */
  rails?: {
    oauth: RailInfo;
    domainConnect: RailInfo;
    apiKey: RailInfo;
    manual: RailInfo;
    /** Only present when the application has the cloud browser rail switched on. */
    cloudBrowser?: RailInfo;
    /**
     * The DNS hosting verdict: whether the application offers to host the
     * domain's DNS by moving its nameservers. Absent while the application's
     * setting is off. Not the delegation the detector observed, which is the
     * top level `nameservers`.
     */
    nameservers?: DnsHostingVerdict;
    /**
     * The provider keys the workspace already keeps that may act for this
     * domain. Only an API key caller gets any; a widget token, the one a
     * browser holds, gets `available: false` and no accounts.
     */
    savedAccess?: SavedAccessRail;
  };
  recommendedRail?: "saved_access" | "oauth" | "domain_connect" | "cloud_browser" | "api_key" | "manual";
  /**
   * The second way, when the registrar and the nameservers name two providers:
   * a former Google Domains name is Squarespace's now and keeps Google's
   * nameservers, which Google Cloud DNS zones use too. `provider` is then the
   * registrar's and this names the other.
   */
  alsoProvider?: AlsoProvider;
  endUserAutomatic?: boolean;
  blockedReason?: "unregistered" | "platform_subdomain";
  /** Best-effort deep link into the provider's DNS panel for this zone. */
  dashboardUrl?: string;
  /** The nameserver delegation the detector observed. */
  nameservers?: string[];
  /**
   * Why provider detection could not finish: `nxdomain` when the name does
   * not resolve at all, `resolver` when the lookup itself failed. A `resolver`
   * result is transient; the same check can be retried.
   */
  detectionError?: "nxdomain" | "resolver";
  /** Where traffic lands: the shared edge, or a custom target the application set. */
  targetMode?: "edge" | "custom";
  /**
   * How an apex (root) domain would be pointed at the target: `alias` when
   * the provider flattens CNAMEs, `a_records` when static addresses are
   * written, `unsupported` when the apex cannot be connected automatically.
   */
  apexStrategy?: "alias" | "a_records" | "unsupported";
  /** Record type the apex strategy writes (`CNAME`, `ALIAS`, `ANAME`, `A`). */
  apexRecordType?: string;
  /** Record values the apex strategy writes (one hostname, or the A addresses). */
  apexTargets?: string[];
  /**
   * Set only when `dnsRecords` were supplied to `checkDomain`: each warning
   * names a record in that set the provider cannot write as given.
   */
  integrationWarnings?: IntegrationWarning[];
  /** Whether CustomDomain™ can host the zone itself (managed DNS) and why not when it cannot. */
  managedDns?: ManagedDnsAvailability | null;
  /** True when the token belongs to a test mode application. */
  sandbox?: boolean;
}

/** One rail's availability on checkDomain. */
export interface RailInfo {
  available: boolean;
  /**
   * Machine reason, present exactly when `available` is false. Two of them, on
   * `rails.cloudBrowser` (the secure sign-in), name the caller, not the provider:
   * `caller_cannot_start` (this caller could never start it: an agent, a plain
   * API call without the console, or a role that cannot write connections) and
   * `token_not_bound` (the widget token is bound to no domain, or only to other
   * domains: mint one with `domain` and `end_user_ref`, which is the case a
   * `getToken` request with `reason: "bind"` is about). The type stays
   * `string`: new reasons are added without a new SDK release.
   */
  reason?: string;
  /** A note on an available rail most users still can't use (GoDaddy API gating). */
  caveat?: string;
  /** Available `oauth` rail only: the sign-in it runs, so a client can label its button. */
  flow?: string;
  /** Available `oauth` rail only: the connect keeps its credential (managed mode). Omitted when it will not. */
  managed?: boolean;
  /** Available `ovh_consent` rail only: the API regions the consent can run in, the default first. */
  regions?: string[];
  /**
   * Available `cloudBrowser` rail only, and only when the sign-in also makes a
   * lasting API key: what that key can do beyond DNS and when it ends.
   */
  key?: RailKey;
}

/** The API key a secure sign-in makes, on `RailInfo.key`. */
export interface RailKey {
  /** What the key can do beyond DNS: empty when it is DNS only. */
  rights: Array<"transfer" | "billing" | "account">;
  /** Days until the key stops working, or `null` for no end date. */
  endsInDays: number | null;
}

/** The DNS hosting verdict for a domain, on `rails.nameservers`. */
export interface DnsHostingVerdict {
  /**
   * `offered`: after the other ways. `offered_first`: the application's
   * setting is `prefer`. `recommended`: no automatic way works for this
   * domain, so the move saves the person copying records. `unavailable`:
   * offered, but not for this domain (`reason` says why).
   */
  verdict: "offered" | "offered_first" | "recommended" | "unavailable";
  /** `application_offers`, `application_prefers`, `no_automatic_way`, or for `unavailable` the reason. */
  reason: string;
}

/** One kept provider key that may act for the domain, on `rails.savedAccess.accounts`. */
export interface SavedAccess {
  accountId: string;
  provider: string;
  providerName: string;
  label: string;
  /** How the key came: a person pasted it, or the agent made it at a secure sign-in. */
  how: "api_key" | "secure_sign_in";
  ownerKind: "workspace" | "end_user";
  scope: "all" | "selected";
  /** The domain's zone at the provider. */
  zone: string;
  /** True when the key's scope holds the zone; false when using it adds the zone to its scope. */
  ready: boolean;
  /** `needs_reconnect` for a key that still works until its end date. */
  status: "active" | "needs_reconnect";
  applicationId?: string;
  keyName?: string;
  keyExpiresAt?: string;
  lastUsedAt?: string;
}

/** The kept keys that may act for the domain, on `rails.savedAccess`. */
export interface SavedAccessRail {
  available: boolean;
  /** Best first. Empty for a widget token. */
  accounts: SavedAccess[];
}

/** The second provider a domain names, on `alsoProvider`. */
export interface AlsoProvider {
  provider: string;
  providerName: string;
  reason: "former_google_domains";
}

/** One warning about a record in the `dnsRecords` set passed to checkDomain. */
export interface IntegrationWarning {
  /** Machine code, for example `supplied_apex_unrealizable`. */
  code: string;
  /** Human readable explanation, safe to show to the end user. */
  message: string;
}

/** Whether the managed DNS rail (CustomDomain™ hosting the zone) can take this domain. */
export interface ManagedDnsAvailability {
  available: boolean;
  /** Machine reason, present exactly when `available` is false. */
  reason?: string;
}

/** checkRecords: per-record propagation state of a desired record set. */
export interface CheckRecordsResult {
  domain: string;
  inSync: boolean;
  records: Array<{ host: string; type: string; ok: boolean; observed: string[] }>;
}

/** What a call about one connection needs: the widget token, and where the CustomDomain API is. */
export interface ConnectionCallConfig {
  /** A widget token minted on your server (`POST /v1/tokens`) for this domain and the end user it belongs to. */
  token: string;
  /** The CustomDomain API base URL. Defaults to the one the instance was built with, else CustomDomain™ cloud. */
  apiBase?: string;
}

/**
 * The consent text an end user agreed to before their nameservers move, which the move stores with the
 * time it was given (never their address). The CustomDomain API accepts only a text the hosted widget
 * shows, so send the id and version of the text you showed, not words of your own.
 */
export interface NameserverConsent {
  id: string;
  version: string;
}

/** Where a move back goes: the nameservers the domain had before, or the registrar's own DNS. */
export type NameserverRollbackTarget = "previous" | "registrar_default";

/**
 * Where a move stands. Poll while it is not `active`, `failed` or `rolled_back`. `needs_review`: the copy of
 * the domain's records is not proven complete, so the person checks `copyWarnings` and the move goes on with
 * `startNameserverMove(id, consent, { token, copyReviewed: true })`. `needs_dnssec_off` and `waiting_ds`: DNSSEC must be off
 * first. `setting`: the nameservers are being changed (`waitingFor` says by whom). `propagating`: changed,
 * waiting for the registry to list every new nameserver. `active`: the registry lists them. `pending` and
 * `copying` come first.
 */
export type NameserverMoveState =
  | "pending"
  | "copying"
  | "needs_review"
  | "needs_dnssec_off"
  | "waiting_ds"
  | "setting"
  | "propagating"
  | "active"
  | "failed"
  | "rolled_back";

/** The company a domain is registered with, which is where its nameservers are changed. */
export interface NameserverRegistrar {
  /** The brand, or the name the registry gives. */
  name: string;
  /** CustomDomain's provider id for it, when it routes to it. */
  provider?: string;
  /** The IANA Registrar ID, when the registry gives one. */
  ianaId?: number;
  /** The registrar's website. */
  url?: string;
  /** How the registrar was found (`rdap`, `request`, `account`), empty when only the name is known. */
  source: string;
}

/**
 * The one request that moves a stuck or waiting move on, with the connection's id filled in. `retry` is
 * `startNameserverMove` and `rollback` is `rollbackNameservers`; `sign_in` is the registrar sign-in the hosted
 * widget runs, which this SDK has no method for.
 */
export interface NameserverNextAction {
  kind: "sign_in" | "retry" | "rollback";
  method: "POST";
  /** The API route, for example `/v1/connections/{id}/nameservers:migrate`. */
  path: string;
  /** What the route needs beyond what a client always sends: `purpose` and `provider` for `sign_in`, `rollback_target` for `rollback`. */
  body?: Record<string, unknown>;
}

/**
 * A nameserver move of a connection's domain: CustomDomain hosting the DNS, by changing the nameservers at the
 * registrar with the end user's consent. Fields the answer did not carry are absent (optional), and the lists,
 * counts and flags read as empty, zero and false, so a field a control plane predates never throws.
 */
export interface NameserverMove {
  id: string;
  connectionId?: string;
  /** The registrable domain whose nameservers move. */
  zone: string;
  state: NameserverMoveState;
  /** How the nameservers change: the registrar's API (`api`), the cloud browser sign-in (`agent`), or by hand (`manual`). */
  path: "api" | "agent" | "manual";
  /** Where they go: CustomDomain hosting the zone (`managed`), a zone in the platform's DNS host account (`dns_host`), or the platform's own nameservers (`custom`). */
  target: "managed" | "dns_host" | "custom";
  /** The DNS host of target `dns_host` (a provider id such as `cloudflare`). */
  dnsHost?: string;
  /** Where the nameservers are changed: the registrar's provider id, or when `registrar` is null, the DNS host the domain used, as a guess. */
  provider?: string;
  /** Who the domain is registered with, or `null` when unknown. */
  registrar: NameserverRegistrar | null;
  /** The DNS host the domain used when the move started. */
  oldDnsHost?: string;
  /** What the registry listed when the move started. A move back sets these. */
  oldNameservers: string[];
  newNameservers: string[];
  /** What the registry listed at the last check. */
  observedNameservers: string[];
  /** What the move waits on, when it waits. */
  waitingFor?:
    | "zone_ready"
    | "zone_served"
    | "copy_review"
    | "dnssec_off"
    | "ds_clear"
    | "credential"
    | "registrar_confirm"
    | "browser_session"
    | "registrar"
    | "delegation";
  /** One sentence for the person: what happens or what to do next. */
  nextStep?: string;
  /** The request that presses the move on, or `null` when nothing is waiting for a press. */
  nextAction: NameserverNextAction | null;
  failureCode?:
    | "zone_copy_failed"
    | "zone_not_served"
    | "dnssec_timeout"
    | "ds_removal_failed"
    | "credential_refused"
    | "registrar_refused"
    | "registrar_locked"
    | "changed_elsewhere"
    | "agent_failed"
    | "delegation_timeout"
    | "delegation_drift"
    | "internal";
  failureDetail?: string;
  /** How many of the domain's records were copied to the new DNS host. */
  recordsCopied: number;
  /** How many of those carry mail (MX, SPF, DKIM, DMARC). */
  emailRecords: number;
  emailKinds: Array<"mx" | "spf" | "dkim" | "dmarc">;
  /** `api`: the whole zone, proven complete. `discovery`: read from public DNS, so a person confirms it. `existing_zone`: the platform's zone already held records. */
  copySource?: "api" | "discovery" | "existing_zone";
  /** What a person should check before the switch. */
  copyWarnings: string[];
  copyReviewedAt?: string;
  /** The registry published a DS record (DNSSEC was on) during the move. */
  dsPresent: boolean;
  dsRemovedAt?: string;
  dsClearedAt?: string;
  canRollback: boolean;
  /** How the move back was made: `api`, `agent`, `manual`, or `none` (nothing had changed yet). */
  rollbackPath?: "api" | "agent" | "manual" | "none";
  /** The moves back possible now. */
  rollbackTargets: NameserverRollbackTarget[];
  /** Where a move back without a choice goes. */
  rollbackDefault?: NameserverRollbackTarget;
  /** Where the move back went. */
  rollbackTarget?: NameserverRollbackTarget;
  rollbackSetAt?: string;
  /** Whether the old nameservers still answered for the zone when last asked, or `null` when not asked yet. */
  oldDnsServes: boolean | null;
  /** The consent the move was started with. */
  consent?: { id: string; version: string; at: string };
  actor?: "end_user" | "api_key" | "console" | "agent";
  createdAt?: string;
  setAt?: string;
  activeAt?: string;
  failedAt?: string;
  rolledBackAt?: string;
  driftedAt?: string;
  checkedAt?: string;
  nextCheckAt?: string;
  updatedAt?: string;
}

/**
 * The `CustomDomainError.code` values a nameserver method's rejection can carry, besides the transport
 * ones (`http_<status>`). The union is not closed: handle the ones you know and treat any other as a
 * failed call (`status` says whether it is worth retrying).
 *
 * - `token_wrong_end_user` (403): the token is not this connection's end user's: it was minted for
 *   another end user, or for none while the connection names one. An end user also gets it for a move
 *   that is not theirs to resume. Mint the token with this domain's `end_user_ref` (`details` says so).
 *   Nothing was read or changed.
 * - `forbidden` (403): the application does not offer DNS hosting, or the token may not do this.
 * - `nameserver_migration_unavailable`, `registrar_locks_nameservers`, `nameserver_agent_unavailable` (422):
 *   this domain's nameservers cannot be moved this way (`details` says why).
 * - `old_dns_gone`, `changed_elsewhere` (409), `registrar_refused` (502), `registrar_unconfirmed` (504):
 *   a move back that could not be made, with nothing changed (`registrar_unconfirmed`: try again).
 *
 * `getNameserverMove` also answers 404 when no move was started, which it reports as `null` instead.
 */
export type NameserverMoveErrorCode =
  | "token_wrong_end_user"
  | "forbidden"
  | "nameserver_migration_unavailable"
  | "registrar_locks_nameservers"
  | "nameserver_agent_unavailable"
  | "old_dns_gone"
  | "changed_elsewhere"
  | "registrar_refused"
  | "registrar_unconfirmed";

/**
 * Who runs a domain's DNS, on `Connection.dnsHosting`: a zone CustomDomain hosts, or a move to one. `state`
 * `none`: nothing of CustomDomain's runs the domain's DNS, and no other field is set. `moving`: the zone is
 * being set up or the nameservers are being moved, and the domain is not served from it yet. `hosted`: the
 * nameservers point at the zone, which is what the world resolves. `failed`: the zone never became active, or
 * the domain moved its nameservers away again; someone has to look.
 */
export interface ConnectionDnsHosting {
  state: "none" | "moving" | "hosted" | "failed";
  /**
   * Who runs the DNS: CustomDomain's own managed DNS (`customdomain`), CustomDomain's account at a DNS host
   * it integrates with (`dns_host`, which `provider` names), or the platform's own nameservers (`custom`).
   * Absent when `state` is `none`.
   */
  by?: "customdomain" | "dns_host" | "custom";
  /** The DNS host's provider id when `by` is `dns_host`, for example `cloudflare`. */
  provider?: string;
  /** The zone that is hosted or being set up: the connection's domain or a parent of it (`acme.com` for `shop.acme.com`). */
  zone?: string;
  /** When the domain reached this state: the zone's activation, the start of the move, or the failure. */
  since?: string;
}

/**
 * A connection as `getConnection` reads it: its identity, status and `dnsHosting`. It is a view of those
 * fields, not the whole object; the connection's records, routing and the rest are not in it.
 */
export interface Connection {
  id: string;
  applicationId: string;
  domain: string;
  /** The subdomain label of the connection; empty or absent for the apex. */
  host?: string;
  /** The DNS provider detected or applied for the domain. */
  providerId?: string;
  setupType: string;
  status: "pending" | "propagating" | "live" | "failed";
  createdAt: string;
  /** Who runs the domain's DNS. Absent when the control plane does not send it (one that predates it). */
  dnsHosting?: ConnectionDnsHosting;
}

/** The longest hostname DNS allows, in characters. A longer `domain` in a token request is not one. */
const MAX_TOKEN_REQUEST_DOMAIN = 253;

/**
 * The TokenRequest for a `customdomain:token-expired` payload. The payload comes from the widget's
 * frame, so it is untrusted: anything that is not an object, or a field of the wrong type,
 * reads as "expired" with no domain. `domain` is left off the object (not set to undefined) when
 * it is dropped, so a host that spreads or compares the request sees only what the widget sent.
 * Reading a hostile payload (a getter that throws) can throw, so call it inside the promise chain
 * that answers the widget, never before it.
 */
function tokenRequestFrom(payload: unknown): TokenRequest {
  const p = payload && typeof payload === "object" ? (payload as { domain?: unknown; reason?: unknown }) : {};
  const request: TokenRequest = { reason: p.reason === "bind" ? "bind" : "expired" };
  if (typeof p.domain === "string" && p.domain.length > 0 && p.domain.length <= MAX_TOKEN_REQUEST_DOMAIN) {
    request.domain = p.domain;
  }
  return request;
}

/**
 * Thrown by `checkDomain` and `checkRecords`, passed to `onError`, and the
 * shape of the `customdomain:error` event detail.
 *
 * `status` is the HTTP status of the control plane response the error came
 * from. It is unset when the error was raised by the widget or by the SDK
 * itself (an `onError` call, a missing `container`). Retry guidance: a 429 or
 * any 5xx is transient, so the same call can be retried after a pause; a 4xx
 * other than 429 answers the same way until the request changes (the token,
 * the domain, the records). A network failure never reaches this class: fetch
 * rejects with a plain `TypeError`, which is also safe to retry.
 */
export class CustomDomainError extends Error {
  code: string;
  details?: string;
  /** HTTP status of the control plane response, when there was one. */
  readonly status?: number;
  constructor(code: string, message: string, details?: string, status?: number) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
    this.name = "CustomDomainError";
  }
}

const DEFAULT_API = "https://api.customdomain.ai";
const DEFAULT_WIDGET = "https://app.customdomain.ai";
/** Spec §1.7 sandbox: popups must escape so provider OAuth can open. */
const DEFAULT_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

/**
 * The SDK's native window CustomEvents. The migration layer (compat.ts)
 * re-dispatches each under its incumbent-compatible alias — event naming for
 * migrating tenants lives THERE, not here.
 */
const EVT = {
  success: "customdomain:success",
  close: "customdomain:close",
  step: "customdomain:step",
  doc: "customdomain:doc-click",
  requestClose: "customdomain:request-close",
  shared: "customdomain:shared",
  purchase: "customdomain:purchase",
  error: "customdomain:error",
  fallback: "customdomain:fallback",
  removed: "customdomain:removed",
} as const;

function dispatch(name: string, detail: unknown) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export class CustomDomain {
  private apiBase: string;
  private frame: HTMLIFrameElement | null = null;
  private msgHandler: ((e: MessageEvent) => void) | null = null;
  private lastStatus = "INITIAL";
  private lastError: CloseDetail["error"];

  constructor(opts: { apiBase?: string } = {}) {
    this.apiBase = opts.apiBase || DEFAULT_API;
  }

  /**
   * load — npm/CDN loader parity: resolves when the SDK is ready. The npm
   * build is ready synchronously; the CDN gateway fires `customdomain:ready` (and
   * `incumbent:ready`) after attach, which this awaits for symmetry.
   */
  async load(): Promise<void> {
    return Promise.resolve();
  }

  /** Pre-flight: full feature-detection for a domain (spec §1.6 checkDomain). */
  /**
   * Pre-flight a domain without opening the widget. Pass `dnsRecords` (the
   * same shape as `open({ dnsRecords })`) to have conflict detection and the
   * `willFallbackToManual` prediction run against the records you intend to
   * write; `integrationWarnings` is only ever set in that case.
   */
  async checkDomain(
    domain: string,
    cfg: { token: string; apiBase?: string; dnsRecords?: DNSRecord[] }
  ): Promise<CheckDomainResult> {
    const records = cfg.dnsRecords?.map((rec) => ({ type: rec.type, host: rec.host, value: rec.value }));
    const res = await fetch(`${cfg.apiBase || this.apiBase}/v1/domains:check`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(records?.length ? { domain, records } : { domain }),
    });
    if (!res.ok) throw await toError(res);
    const r = await res.json();
    // The API speaks snake_case; adapt to the camelCase view exactly once here
    // so no caller ever reads the wrong field.
    return {
      domain: r.domain,
      provider: r.provider || null,
      setupType: r.setup_type,
      supportsAutomatic: r.supports_automatic ?? false,
      oauthAvailable: r.oauth_available ?? false,
      domainConnect: r.domain_connect ?? false,
      registered: r.registered,
      authoritativeDnsProvider: r.authoritative_dns_provider,
      NSSupport: r.ns_support,
      wildcardSupport: r.wildcard_support,
      cnameFlattening: r.cname_flattening,
      spfOverrideSupport: r.spf_override_support,
      caaSupport: r.caa_support,
      supportsSocialLogin: r.supports_social_login,
      recordConflicts: r.record_conflicts,
      advisories: r.advisories,
      conflictTolerance: r.conflict_tolerance,
      willFallbackToManual: r.will_fallback_to_manual,
      apexSupported: r.apex_supported,
      apexMessage: r.apex_message,
      subdomain: r.subdomain,
      registrableDomain: r.registrable_domain,
      publicSuffix: r.public_suffix,
      rails: r.rails
        ? {
            oauth: railInfo(r.rails.oauth),
            domainConnect: railInfo(r.rails.domain_connect),
            apiKey: railInfo(r.rails.api_key),
            manual: railInfo(r.rails.manual),
            cloudBrowser: r.rails.cloud_browser ? railInfo(r.rails.cloud_browser) : undefined,
            nameservers: r.rails.nameservers ?? undefined,
            savedAccess: r.rails.saved_access
              ? {
                  available: r.rails.saved_access.available,
                  accounts: (r.rails.saved_access.accounts ?? []).map(savedAccess),
                }
              : undefined,
          }
        : undefined,
      recommendedRail: r.recommended_rail,
      alsoProvider: r.also_provider
        ? { provider: r.also_provider.provider, providerName: r.also_provider.provider_name, reason: r.also_provider.reason }
        : undefined,
      endUserAutomatic: r.end_user_automatic,
      blockedReason: r.blocked_reason,
      dashboardUrl: r.dashboard_url,
      nameservers: r.nameservers,
      detectionError: r.detection_error,
      targetMode: r.target_mode,
      apexStrategy: r.apex_strategy,
      apexRecordType: r.apex_record_type,
      apexTargets: r.apex_targets,
      integrationWarnings: r.integration_warnings,
      managedDns: r.managed_dns,
      sandbox: r.sandbox,
    };
  }

  /**
   * checkRecords — verify a desired record set against live public DNS
   * (incumbent checkRecords). Rides the control-plane's monitor:check endpoint.
   */
  async checkRecords(
    domain: string,
    cfg: { token: string; dnsRecords: DNSRecord[]; apiBase?: string }
  ): Promise<CheckRecordsResult> {
    const baseline = (cfg.dnsRecords || []).map((r) => ({
      subdomain: relativeHost(r.host, domain),
      type: r.type,
      values: [r.value],
    }));
    const res = await fetch(`${cfg.apiBase || this.apiBase}/v1/monitor:check`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ domain, baseline }),
    });
    if (!res.ok) throw await toError(res);
    const r = await res.json();
    // The control plane emits `{domain, drift: bool, records: [{subdomain, type,
    // verdict, drift, expected, observed}]}` (monitor.go:169-193) — the observed
    // values live INSIDE each record, and `observed` is `omitempty`, so a record
    // that resolved to nothing has no key at all. Reading a top-level `r.observed`
    // /`r.in_sync` (which this endpoint has never emitted) made every record
    // `ok: false` and `inSync: false` on a fully-propagated domain. The legacy
    // top-level shape is still accepted so an older/alternate server keeps working.
    const legacy: Array<{ subdomain?: string; type?: string; values?: string[] }> =
      Array.isArray(r.observed) ? r.observed : [];
    const emitted: Array<{ subdomain?: string; type?: string; observed?: string[]; values?: string[] }> =
      Array.isArray(r.records) ? r.records : legacy;
    const records = baseline.map((b) => {
      const o = emitted.find(
        (x) => (x.subdomain || "") === b.subdomain && (x.type || "").toUpperCase() === b.type.toUpperCase()
      );
      const values = o?.observed || o?.values || [];
      const ok = b.values.every((v) => values.some((got) => got.toLowerCase().includes(v.toLowerCase())));
      return { host: b.subdomain || "@", type: b.type, ok, observed: values };
    });
    // `drift` is a BOOLEAN here and is always present, so it must be tested for
    // the boolean it is — `r.in_sync ?? …` never fell through because the field
    // was absent, not null.
    const inSync = typeof r.drift === "boolean" ? !r.drift : (r.in_sync ?? records.every((x) => x.ok));
    return { domain, inSync, records };
  }

  /**
   * The connection's nameserver move: its state, the old and new nameservers, what it waits on and what to
   * do next (`nextStep`, `nextAction`). Poll it while `state` is not `active`, `failed` or `rolled_back`.
   * Resolves `null` when no move was started for the connection: the API answers 404, and an unknown
   * connection id reads the same, so check the id if you never started one.
   *
   * Rides `GET /v1/connections/{id}/nameservers` with a widget token. Rejects with a `CustomDomainError`
   * for any other refusal; see `NameserverMoveErrorCode` for the ones to expect (`token_wrong_end_user`).
   */
  async getNameserverMove(connectionId: string, cfg: ConnectionCallConfig): Promise<NameserverMove | null> {
    const res = await this.connectionCall(cfg, "GET", `${connectionPath(connectionId)}/nameservers`);
    if (res.status === 404) return null;
    if (!res.ok) throw await toError(res);
    return nameserverMoveFrom(await res.json());
  }

  /**
   * Start the connection's nameserver move, or resume the open one, with the consent the end user gave.
   * `consent` is required: pass the id and version of the text you showed them (a missing one, or one
   * whose id or version is not a non-empty string, rejects with code `InvalidConsentError` before anything
   * is sent). Resolves the move as far as it got; poll `getNameserverMove` from there.
   *
   * `cfg.copyReviewed: true` confirms the copy of the domain's records for a move in `needs_review`; the
   * API accepts it from a widget token only for a move already in that state.
   *
   * Rides `POST /v1/connections/{id}/nameservers:migrate` with a widget token, which may not choose the
   * target, send a registrar key or skip the zone check; the application's own DNS hosting setting decides
   * where the nameservers go and whether it is offered at all. Rejects with a `CustomDomainError` when the
   * API refuses: `NameserverMoveErrorCode` lists the ones to expect (`token_wrong_end_user` for another
   * end user's connection, `forbidden` when the application does not offer DNS hosting, and 409 or 422
   * answers whose `details` say why).
   */
  async startNameserverMove(
    connectionId: string,
    consent: NameserverConsent,
    cfg: ConnectionCallConfig & { copyReviewed?: boolean }
  ): Promise<NameserverMove> {
    const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
    if (!consent || !text(consent.id) || !text(consent.version)) {
      throw new CustomDomainError(
        "InvalidConsentError",
        "startNameserverMove needs the consent the end user agreed to, as { id, version }; the move was not started"
      );
    }
    const res = await this.connectionCall(cfg, "POST", `${connectionPath(connectionId)}/nameservers:migrate`, {
      consent: { id: consent.id, version: consent.version },
      ...(cfg.copyReviewed ? { copy_reviewed: true } : {}),
    });
    if (!res.ok) throw await toError(res);
    return nameserverMoveFrom(await res.json());
  }

  /**
   * Move the domain's nameservers back: to `previous` (the nameservers it had) or `registrar_default` (the
   * registrar's own DNS). With no target the API chooses: the old nameservers while they still answer for
   * the zone, else the registrar's own DNS (`rollbackDefault` on the move says which). Resolves the move,
   * `rolled_back` once it is done; a move back that needs the person at the registrar says so in `nextStep`.
   *
   * Rides `POST /v1/connections/{id}/nameservers:rollback` with a widget token, which may choose the
   * target but may not send a registrar key. Rejects with a `CustomDomainError` when the API refuses:
   * `NameserverMoveErrorCode` lists the ones to expect (`token_wrong_end_user`, `old_dns_gone`,
   * `changed_elsewhere`, `registrar_refused`, `registrar_unconfirmed`).
   */
  rollbackNameservers(connectionId: string, cfg: ConnectionCallConfig): Promise<NameserverMove>;
  rollbackNameservers(
    connectionId: string,
    target: NameserverRollbackTarget | undefined,
    cfg: ConnectionCallConfig
  ): Promise<NameserverMove>;
  async rollbackNameservers(
    connectionId: string,
    targetOrConfig: NameserverRollbackTarget | undefined | ConnectionCallConfig,
    maybeConfig?: ConnectionCallConfig
  ): Promise<NameserverMove> {
    const withTarget = typeof targetOrConfig !== "object" || targetOrConfig === null;
    const cfg = (withTarget ? maybeConfig : targetOrConfig) as ConnectionCallConfig;
    const target = withTarget ? targetOrConfig : undefined;
    const res = await this.connectionCall(
      cfg,
      "POST",
      `${connectionPath(connectionId)}/nameservers:rollback`,
      target ? { rollback_target: target } : {}
    );
    if (!res.ok) throw await toError(res);
    return nameserverMoveFrom(await res.json());
  }

  /**
   * Read a connection with a widget token (`GET /v1/connections/{id}`): the `Connection` view, whose
   * `dnsHosting` says who runs the domain's DNS (a zone CustomDomain hosts, a move to one, or none). It is
   * the field to read to see that a domain is already hosted without asking for its nameserver move.
   * Rejects with a `CustomDomainError` when the API refuses, a 404 for an unknown connection included.
   */
  async getConnection(connectionId: string, cfg: ConnectionCallConfig): Promise<Connection> {
    const res = await this.connectionCall(cfg, "GET", connectionPath(connectionId));
    if (!res.ok) throw await toError(res);
    return connectionFrom(await res.json());
  }

  /** One bearer-authorized call about a connection. A GET sends no body and no content type. */
  private connectionCall(cfg: ConnectionCallConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
    const authorization = `Bearer ${cfg.token}`;
    return fetch(`${cfg.apiBase || this.apiBase}${path}`, {
      method,
      headers: body === undefined ? { authorization } : { "content-type": "application/json", authorization },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Open the embedded modal to connect a domain (the incumbent's modal-open method). */
  open(config: OpenConfig): { close: () => void } {
    this.closeFrame(); // one modal at a time
    this.lastStatus = "INITIAL";
    this.lastError = undefined;

    const widgetBase = config.widgetBase || DEFAULT_WIDGET;
    const frame = document.createElement("iframe");
    frame.src = `${widgetBase}/widget?app=${encodeURIComponent(config.applicationId)}`;
    frame.setAttribute("title", "Connect your domain");
    frame.setAttribute("sandbox", config.iframeSandbox || DEFAULT_SANDBOX);
    // Lets the widget's Copy buttons (records, the AI prompt) write to the
    // clipboard from its cross-origin frame. Write only: it cannot read.
    frame.setAttribute("allow", "clipboard-write");
    // Embedded mode mounts the iframe inside the host's container as a flat
    // panel; the default is the fullscreen modal overlay.
    const container = config.container ? document.querySelector(config.container) : null;
    if (config.container && !container) {
      throw new CustomDomainError("InvalidDomainError", `container ${config.container} not found`);
    }
    Object.assign(
      frame.style,
      container
        ? { position: "absolute", inset: "0", width: "100%", height: "100%", border: "0", background: "transparent" }
        : { position: "fixed", inset: "0", width: "100%", height: "100%", border: "0", zIndex: "2147483647", background: "transparent" }
    );
    this.frame = frame;
    const whiteLabel = container ? { ...(config.whiteLabel || {}), embedded: true } : config.whiteLabel;

    // Keep the FULL prefilledDomain (string or array) to forward to the widget
    // so multi-domain flows process every entry (CP-PAR-3); the first entry is
    // used only to resolve the top-level domain + its record set.
    const first = Array.isArray(config.prefilledDomain) ? config.prefilledDomain[0] : config.prefilledDomain;
    const domain = config.domain || first;
    const records = resolveRecords(config.dnsRecords, domain);
    warnIgnoredRecords(records);

    const handler = (e: MessageEvent) => {
      if (new URL(widgetBase).origin !== e.origin) return; // origin-checked
      const { type, payload } = e.data || {};
      switch (type) {
        case "customdomain:ready":
          // Guarded: an exception here (bad theme object, torn-down frame, a
          // structured-clone failure on an exotic config value) would otherwise
          // vanish inside the message handler and strand the widget on its
          // intro spinner with no error anywhere. Surface it to the host.
          try {
            frame.contentWindow?.postMessage(
              {
                type: "customdomain:init",
                payload: buildInitPayload(config, whiteLabel, domain, records, config.prefilledDomain),
              },
              widgetBase
            );
          } catch (e) {
            const err = new CustomDomainError(
              "GenericError",
              e instanceof Error ? e.message : "failed to initialize the widget"
            );
            this.lastError = { code: err.code };
            config.onError?.(err);
            dispatch(EVT.error, { code: err.code, message: err.message });
          }
          break;
        case "customdomain:step":
          // Forward the whole enriched step payload; don't narrow to {step}.
          this.lastStatus = payload?.step || this.lastStatus;
          config.onStepChange?.(payload as StepDetail);
          dispatch(EVT.step, payload);
          break;
        case "customdomain:success":
          // Success is an event, not a dismissal: the widget stays up showing
          // the congratulations screen and closes itself when the user is done.
          config.onSuccess?.(payload as SuccessResult);
          dispatch(EVT.success, payload);
          break;
        case "customdomain:close":
          // Merge the widget's close payload (shared/manualScreenDisabled) which
          // was previously discarded.
          this.close(payload);
          break;
        case "customdomain:request-close":
          // delegateClose: surface the request; the host decides (close()).
          dispatch(EVT.requestClose, payload);
          break;
        case "customdomain:doc-click":
          dispatch(EVT.doc, payload);
          break;
        case "customdomain:shared":
          dispatch(EVT.shared, payload);
          break;
        case "customdomain:purchase":
          // WS4-F6: the widget initiated a domain purchase and created a checkout
          // session (order recorded server-side). It hands the embedded Stripe
          // session here so the host can mount payment (Stripe.js Embedded
          // Checkout with clientSecret) and, once paid, POST /v1/registrar/fulfill
          // to register + connect the domain. The widget can't mount Stripe.js in
          // its self-contained iframe, so this handoff is the payment boundary.
          dispatch(EVT.purchase, payload as PurchaseInitiated);
          break;
        case "customdomain:error": {
          const err = new CustomDomainError(payload?.code || "GenericError", payload?.message || "Widget error", payload?.details);
          this.lastError = { code: err.code, title: payload?.title, details: payload?.details };
          config.onError?.(err);
          // Documented as a window event too; it used to reach only onError.
          dispatch(EVT.error, { code: err.code, message: err.message, title: payload?.title, details: payload?.details });
          break;
        }
        case "customdomain:fallback":
          config.onFallback?.(payload as FallbackDetail);
          dispatch(EVT.fallback, payload);
          break;
        case "customdomain:removed":
          // The removal finished: the widget stays up on its summary (with
          // any records left for the user to delete) until the user closes it.
          config.onRemoved?.(payload as RemovedResult);
          dispatch(EVT.removed, payload);
          break;
        case "customdomain:token-expired": {
          // The widget needs another token: its own expired mid-setup, or (when
          // it says so in the payload) it is not bound to the domain the end
          // user typed. Ask the integrator for one, telling it which; a widget
          // that sends no payload reads as a plain expiry. Answer with null when
          // there is no getToken so the widget moves straight to "you can close
          // this window" instead of waiting.
          const reply = (token: string | null) => {
            try {
              frame.contentWindow?.postMessage({ type: "customdomain:token", payload: { token } }, widgetBase);
            } catch {
              /* frame gone */
            }
          };
          if (!config.getToken) {
            reply(null);
            break;
          }
          // The request is built inside the chain, not before it: the payload comes
          // from a frame, and a payload that throws when read must still end in a
          // reply (null) instead of escaping this handler and leaving the widget
          // waiting for a token that never comes.
          Promise.resolve()
            .then(() => config.getToken!(tokenRequestFrom(payload)))
            .then((tok) => reply(typeof tok === "string" && tok ? tok : null))
            .catch(() => reply(null));
          break;
        }
      }
    };
    this.msgHandler = handler;
    this.onCloseCb = config.onClose;
    window.addEventListener("message", handler);
    (container ?? document.body).appendChild(frame);

    return { close: () => this.close() };
  }

  /** Sell: open the in-widget domain purchase flow. */
  purchaseDomain(config: OpenConfig): { close: () => void } {
    return this.open({ ...(config as OpenConfig), purchase: true } as OpenConfig);
  }

  /**
   * Open the removal flow for a connected domain: pass `connectionId`, or the
   * domain as `prefilledDomain`. Mint the token for that domain and end user
   * (POST /v1/tokens with `domain` and `end_user_ref`): an end user's token
   * bound to neither cannot remove it. The widget asks whether to remove or
   * keep the DNS records that were added, and reports the outcome in
   * onRemoved / `customdomain:removed`.
   */
  removeDomain(config: OpenConfig): { close: () => void } {
    return this.open({ ...config, mode: "remove" });
  }

  /**
   * Open a shared/delegated setup link in the modal (incumbent loadSharedFlow).
   *
   * The link must be on the widget's own origin (`config.widgetBase`, else the hosted widget). The
   * frame it names is sent the integrator's token in the init message, and a tenant hand-off page
   * reads the link from its own query string, which anyone can write. A link that is missing, is
   * not a URL, is on any other origin or has any other scheme throws a CustomDomainError with code
   * `InvalidLinkError`, and nothing is framed or closed.
   */
  loadSharedFlow(url: string, config?: Partial<OpenConfig>): { close: () => void } {
    const widget = new URL(config?.widgetBase || DEFAULT_WIDGET);
    const refused = () =>
      new CustomDomainError(
        "InvalidLinkError",
        "loadSharedFlow only opens a link on the widget's own origin, so the link was not opened"
      );
    // A hand-off page passes the `link` query parameter as it arrives, so it can be missing
    // (null) or not a URL at all; both are refused the same way as a link on another origin.
    if (typeof url !== "string" || url === "") throw refused();
    let u: URL;
    try {
      u = new URL(url, widget.origin);
    } catch {
      throw refused();
    }
    // The scheme is checked as well as the origin: a blob: URL reports the origin of the page that
    // made it, so the origin alone would let one through.
    if (u.origin !== widget.origin || u.protocol !== widget.protocol) throw refused();
    this.closeFrame();
    const frame = document.createElement("iframe");
    frame.src = u.toString();
    frame.setAttribute("title", "Connect your domain");
    frame.setAttribute("sandbox", (config as OpenConfig | undefined)?.iframeSandbox || DEFAULT_SANDBOX);
    frame.setAttribute("allow", "clipboard-write");
    Object.assign(frame.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      border: "0",
      zIndex: "2147483647",
      background: "transparent",
    } as Partial<CSSStyleDeclaration>);
    this.frame = frame;
    const cfg = config as OpenConfig | undefined;
    const handler = (e: MessageEvent) => {
      if (u.origin !== e.origin) return;
      const { type, payload } = e.data || {};
      if (type === "customdomain:ready") {
        // Post the stored config/whiteLabel into the iframe the way open() does,
        // so a resumed shared flow renders with the tenant's branding instead of
        // unbranded defaults (WS7-F11). No-op when no config was supplied.
        if (!cfg) return;
        try {
          const first = Array.isArray(cfg.prefilledDomain) ? cfg.prefilledDomain[0] : cfg.prefilledDomain;
          const domain = cfg.domain || first;
          const records = resolveRecords(cfg.dnsRecords, domain);
          frame.contentWindow?.postMessage(
            { type: "customdomain:init", payload: buildInitPayload(cfg, cfg.whiteLabel, domain, records, cfg.prefilledDomain) },
            u.origin
          );
        } catch {
          /* structured-clone / torn-down frame — leave the widget to time out */
        }
      } else if (type === "customdomain:success") {
        cfg?.onSuccess?.(payload as SuccessResult);
        dispatch(EVT.success, payload);
        this.close();
      } else if (type === "customdomain:close") {
        this.close();
      }
    };
    this.msgHandler = handler;
    window.addEventListener("message", handler);
    document.body.appendChild(frame);
    return { close: () => this.close() };
  }

  private onCloseCb?: (detail: CloseDetail) => void;

  /**
   * Close and tear down the modal. When the widget requested the close it hands
   * over its own close payload (shared / manualScreenDisabled / lastStatus),
   * which is merged over the SDK-tracked status/error instead of being dropped.
   */
  close(widgetDetail?: Partial<CloseDetail> & Record<string, unknown>) {
    const wasOpen = !!this.frame;
    this.closeFrame();
    if (wasOpen) {
      const detail: CloseDetail = {
        lastStatus: this.lastStatus,
        error: this.lastError,
        ...(widgetDetail as Partial<CloseDetail> | undefined),
      };
      this.onCloseCb?.(detail);
      dispatch(EVT.close, detail);
      this.onCloseCb = undefined;
    }
  }

  private closeFrame() {
    if (this.msgHandler) window.removeEventListener("message", this.msgHandler);
    if (this.frame && this.frame.parentNode) this.frame.parentNode.removeChild(this.frame);
    this.frame = null;
    this.msgHandler = null;
  }
}

/**
 * Build the `customdomain:init` payload posted into the widget iframe. Shared by
 * open() and loadSharedFlow() so a resumed shared flow renders with the same
 * config/whiteLabel branding open() sends (WS7-F11).
 */
function buildInitPayload(
  config: OpenConfig,
  whiteLabel: WhiteLabel | undefined,
  domain: string | undefined,
  records: DNSRecord[] | undefined,
  prefilledDomain: string | string[] | undefined
) {
  return {
    token: config.token,
    domain,
    dnsRecords: records,
    theme: config.theme,
    config: {
      applicationName: config.applicationName,
      prefilledDomain,
      locale: config.locale,
      whiteLabel,
      forceManualSetup: config.forceManualSetup,
      supportForSubdomains: config.supportForSubdomains,
      defaultSubdomain: config.defaultSubdomain,
      hostRequired: config.hostRequired,
      manualSetupDocumentation: config.manualSetupDocumentation,
      enableDkim: config.enableDkim,
      enableEmail: config.enableEmail,
      userId: config.userId,
      endUserRef: config.endUserRef,
      forceSubdomain: config.forceSubdomain,
      searchType: config.searchType,
      managed: config.managed,
      wwwRedirect: config.wwwRedirect,
      canRefreshToken: typeof config.getToken === "function",
      purchase: (config as { purchase?: boolean }).purchase,
      mode: config.mode,
      connectionId: config.connectionId,
    },
  };
}

/** True for a record the widget's DKIM screen uses; the widget's own test. */
function isDkimRecord(r: DNSRecord): boolean {
  return r.purpose === "dkim" || /(^|\.)_domainkey(\.|$)/.test(r.host || "");
}

let warnedIgnoredRecords = false;

/**
 * Says once, in the console, that `dnsRecords` other than DKIM are ignored.
 * Builders passed A and CNAME records here expecting their customers to get
 * them; the customers got the application's routing instead, with nothing to
 * say why.
 */
function warnIgnoredRecords(records: DNSRecord[] | undefined): void {
  if (warnedIgnoredRecords || !records) return;
  const ignored = records.filter((r) => !isDkimRecord(r));
  if (ignored.length === 0) return;
  warnedIgnoredRecords = true;
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(
      `customdomain-js: ${ignored.length} of the dnsRecords passed to open() ${ignored.length === 1 ? "is" : "are"} ignored: ` +
        "only DKIM records are used. Customers are shown the records of your application's routing; set it on the " +
        "Domain routing page (PUT /v1/applications/{id}/connect-target), or supply a connection's records from your " +
        "backend with PUT /v1/connections/{id}/records. https://docs.customdomain.ai/docs/connect-flow/routing"
    );
  }
}

/** incumbent dnsRecords object mode: {"acme.com": [records]} → the domain's set. */
function resolveRecords(
  records: OpenConfig["dnsRecords"],
  domain?: string
): DNSRecord[] | undefined {
  if (!records) return undefined;
  if (Array.isArray(records)) return records;
  if (domain && records[domain]) return records[domain];
  const first = Object.values(records)[0];
  return first;
}

function relativeHost(host: string, domain: string): string {
  const h = host.replace(/\.$/, "");
  if (h === domain || h === "@" || h === "") return "";
  if (h.endsWith(`.${domain}`)) return h.slice(0, -(domain.length + 1));
  return h;
}

// One rail's wire shape is the camelCase view already, except the key a secure
// sign-in makes, whose `ends_in_days` becomes `endsInDays`.
function railInfo(x: any): RailInfo {
  if (!x || !x.key) return x;
  const { key, ...rest } = x;
  return { ...rest, key: { rights: key.rights ?? [], endsInDays: key.ends_in_days ?? null } };
}

function savedAccess(a: any): SavedAccess {
  return {
    accountId: a.account_id,
    provider: a.provider,
    providerName: a.provider_name,
    label: a.label,
    how: a.how,
    ownerKind: a.owner_kind,
    scope: a.scope,
    zone: a.zone,
    ready: a.ready,
    status: a.status,
    ...(a.application_id != null ? { applicationId: a.application_id } : {}),
    ...(a.key_name != null ? { keyName: a.key_name } : {}),
    ...(a.key_expires_at != null ? { keyExpiresAt: a.key_expires_at } : {}),
    ...(a.last_used_at != null ? { lastUsedAt: a.last_used_at } : {}),
  };
}

async function toError(res: Response): Promise<CustomDomainError> {
  try {
    const body = await res.json();
    return new CustomDomainError(body.code || `http_${res.status}`, body.title || res.statusText, body.details, res.status);
  } catch {
    return new CustomDomainError(`http_${res.status}`, res.statusText, undefined, res.status);
  }
}

/** `/v1/connections/{id}`, the id escaped so one that holds a slash or a colon stays a single path segment. */
function connectionPath(connectionId: string): string {
  return `/v1/connections/${encodeURIComponent(connectionId)}`;
}

/**
 * A connection from the wire to the `Connection` view: only the fields it names, so nothing else the answer
 * carries (its records, routing, a credential) reaches the caller through it. `dns_hosting` is read only when
 * it is an object with a string `state`; anything else leaves `dnsHosting` off.
 */
function connectionFrom(c: any): Connection {
  const a = c ?? {};
  const d = a.dns_hosting;
  const dnsHosting: ConnectionDnsHosting | undefined =
    d && typeof d.state === "string"
      ? {
          state: d.state,
          ...(d.by != null ? { by: d.by } : {}),
          ...(d.provider != null ? { provider: d.provider } : {}),
          ...(d.zone != null ? { zone: d.zone } : {}),
          ...(d.since != null ? { since: d.since } : {}),
        }
      : undefined;
  return {
    id: a.id,
    applicationId: a.application_id,
    domain: a.domain,
    ...(a.host != null ? { host: a.host } : {}),
    ...(a.provider_id != null ? { providerId: a.provider_id } : {}),
    setupType: a.setup_type,
    status: a.status,
    createdAt: a.created_at,
    ...(dnsHosting ? { dnsHosting } : {}),
  };
}

/**
 * A nameserver move from the wire (snake_case) to the camelCase view. A field the answer did not carry
 * (or sent as null) is left off the object, except the lists, counts and flags and the three nullable
 * ones (`registrar`, `nextAction`, `oldDnsServes`), which read as empty, zero, false and null.
 */
function nameserverMoveFrom(m: any): NameserverMove {
  const a = m ?? {};
  const registrar = a.registrar;
  const action = a.next_action;
  const consent = a.consent;
  return {
    id: a.id,
    ...(a.connection_id != null ? { connectionId: a.connection_id } : {}),
    zone: a.zone,
    state: a.state,
    path: a.path,
    target: a.target,
    ...(a.dns_host != null ? { dnsHost: a.dns_host } : {}),
    ...(a.provider != null ? { provider: a.provider } : {}),
    registrar: registrar
      ? {
          name: registrar.name,
          ...(registrar.provider != null ? { provider: registrar.provider } : {}),
          ...(registrar.iana_id != null ? { ianaId: registrar.iana_id } : {}),
          ...(registrar.url != null ? { url: registrar.url } : {}),
          source: registrar.source ?? "",
        }
      : null,
    ...(a.old_dns_host != null ? { oldDnsHost: a.old_dns_host } : {}),
    oldNameservers: a.old_nameservers ?? [],
    newNameservers: a.new_nameservers ?? [],
    observedNameservers: a.observed_nameservers ?? [],
    ...(a.waiting_for != null ? { waitingFor: a.waiting_for } : {}),
    ...(a.next_step != null ? { nextStep: a.next_step } : {}),
    nextAction: action
      ? { kind: action.kind, method: action.method, path: action.path, ...(action.body != null ? { body: action.body } : {}) }
      : null,
    ...(a.failure_code != null ? { failureCode: a.failure_code } : {}),
    ...(a.failure_detail != null ? { failureDetail: a.failure_detail } : {}),
    recordsCopied: a.records_copied ?? 0,
    emailRecords: a.email_records ?? 0,
    emailKinds: a.email_kinds ?? [],
    ...(a.copy_source != null ? { copySource: a.copy_source } : {}),
    copyWarnings: a.copy_warnings ?? [],
    ...(a.copy_reviewed_at != null ? { copyReviewedAt: a.copy_reviewed_at } : {}),
    dsPresent: a.ds_present ?? false,
    ...(a.ds_removed_at != null ? { dsRemovedAt: a.ds_removed_at } : {}),
    ...(a.ds_cleared_at != null ? { dsClearedAt: a.ds_cleared_at } : {}),
    canRollback: a.can_rollback ?? false,
    ...(a.rollback_path != null ? { rollbackPath: a.rollback_path } : {}),
    rollbackTargets: a.rollback_targets ?? [],
    ...(a.rollback_default != null ? { rollbackDefault: a.rollback_default } : {}),
    ...(a.rollback_target != null ? { rollbackTarget: a.rollback_target } : {}),
    ...(a.rollback_set_at != null ? { rollbackSetAt: a.rollback_set_at } : {}),
    oldDnsServes: a.old_dns_serves ?? null,
    ...(consent ? { consent: { id: consent.id, version: consent.version, at: consent.at } } : {}),
    ...(a.actor != null ? { actor: a.actor } : {}),
    ...(a.created_at != null ? { createdAt: a.created_at } : {}),
    ...(a.set_at != null ? { setAt: a.set_at } : {}),
    ...(a.active_at != null ? { activeAt: a.active_at } : {}),
    ...(a.failed_at != null ? { failedAt: a.failed_at } : {}),
    ...(a.rolled_back_at != null ? { rolledBackAt: a.rolled_back_at } : {}),
    ...(a.drifted_at != null ? { driftedAt: a.drifted_at } : {}),
    ...(a.checked_at != null ? { checkedAt: a.checked_at } : {}),
    ...(a.next_check_at != null ? { nextCheckAt: a.next_check_at } : {}),
    ...(a.updated_at != null ? { updatedAt: a.updated_at } : {}),
  };
}

/** Default singleton, attached to window in browsers. */
export const customdomain = new CustomDomain();

declare global {
  interface Window {
    customdomain: CustomDomain;
  }
}

if (typeof window !== "undefined") {
  window.customdomain = customdomain;
  dispatch("customdomain:ready", {});
  // Migration parity: also expose window.entri + onEntri* aliases. Both
  // namespaces stay live; this only ADDS the incumbent-compatible surface.
  installEntriCompat(customdomain);
}
