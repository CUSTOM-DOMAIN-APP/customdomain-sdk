/**
 * customdomain-js — the integrator SDK (the integrator SDK, spec §6).
 *
 * Framework-free. Renders the widget in an iframe and bridges its postMessage
 * protocol onto BOTH callback props and native `customdomain:*` window
 * CustomEvents. Global: `window.customdomain`.
 *
 * 7 methods: open, checkDomain, checkRecords, load, loadSharedFlow, close,
 * purchaseDomain. 7 window CustomEvents: customdomain:success, customdomain:close,
 * customdomain:step, customdomain:doc-click, customdomain:request-close,
 * customdomain:shared, customdomain:purchase.
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

export type SetupType = "automatic" | "manual" | "semiautomatic" | "sharedLogin" | "purchase";

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
 * OpenConfig is IncumbentConfig-era-compatible (spec §1.6): incumbent key names are
 * accepted directly; Customdomain-native aliases noted inline.
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
   * DNS records the platform needs applied. Array mode, or incumbent's per-domain
   * object mode {"acme.com": [records]}. Optional: the control-plane's
   * authoritative per-connection record set is preferred when omitted.
   *
   * ROOT DOMAINS. A CNAME is illegal at a zone apex (RFC 1034 §3.6.2), and most
   * of your users will type `acme.com`, not `www.acme.com`. What happens depends
   * on their DNS provider:
   *
   *   - Cloudflare, Route 53, DNSimple and other flattening providers accept
   *     your hostname at the root unchanged. Nothing to do.
   *   - GoDaddy and Namecheap have no ALIAS/ANAME/flattening type at all. A
   *     hostname CANNOT be placed at a root there, so those users cannot
   *     complete the connection with a CNAME-only record set.
   *
   * Supply A records with your own addresses for the apex, steer those users to
   * a subdomain, or route the apex through the reverse-proxy edge.
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
  /** Legacy Customdomain theme ({accent}). Prefer whiteLabel. */
  theme?: Record<string, string>;
  /** Control-plane + widget base URLs (defaults to Customdomain cloud). */
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
   */
  getToken?: () => string | Promise<string>;
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
  recordConflicts?: Array<{ kind: string; host: string; type: string; existing: string; desired: string }>;
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
  };
  recommendedRail?: "oauth" | "domain_connect" | "api_key" | "manual";
  endUserAutomatic?: boolean;
  blockedReason?: "unregistered" | "platform_subdomain";
  /** Best-effort deep link into the provider's DNS panel for this zone. */
  dashboardUrl?: string;
  /** The nameserver delegation the detector observed. */
  nameservers?: string[];
}

/** One rail's availability on checkDomain. */
export interface RailInfo {
  available: boolean;
  /** Machine reason, present exactly when `available` is false. */
  reason?: string;
  /** A note on an available rail most users still can't use (GoDaddy API gating). */
  caveat?: string;
}

/** checkRecords: per-record propagation state of a desired record set. */
export interface CheckRecordsResult {
  domain: string;
  inSync: boolean;
  records: Array<{ host: string; type: string; ok: boolean; observed: string[] }>;
}

export class CustomDomainError extends Error {
  code: string;
  details?: string;
  constructor(code: string, message: string, details?: string) {
    super(message);
    this.code = code;
    this.details = details;
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
  async checkDomain(domain: string, cfg: { token: string; apiBase?: string }): Promise<CheckDomainResult> {
    const res = await fetch(`${cfg.apiBase || this.apiBase}/v1/domains:check`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ domain }),
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
      conflictTolerance: r.conflict_tolerance,
      willFallbackToManual: r.will_fallback_to_manual,
      apexSupported: r.apex_supported,
      apexMessage: r.apex_message,
      subdomain: r.subdomain,
      registrableDomain: r.registrable_domain,
      publicSuffix: r.public_suffix,
      rails: r.rails
        ? {
            oauth: r.rails.oauth,
            domainConnect: r.rails.domain_connect,
            apiKey: r.rails.api_key,
            manual: r.rails.manual,
          }
        : undefined,
      recommendedRail: r.recommended_rail,
      endUserAutomatic: r.end_user_automatic,
      blockedReason: r.blocked_reason,
      dashboardUrl: r.dashboard_url,
      nameservers: r.nameservers,
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
        case "customdomain:token-expired": {
          // The widget's token expired mid-setup. Ask the integrator for a
          // fresh one; answer with null when there is none so the widget moves
          // straight to "you can close this window" instead of waiting.
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
          Promise.resolve()
            .then(() => config.getToken!())
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

  /** Open a shared/delegated setup link in the modal (incumbent loadSharedFlow). */
  loadSharedFlow(url: string, config?: Partial<OpenConfig>): { close: () => void } {
    const u = new URL(url, DEFAULT_WIDGET);
    this.closeFrame();
    const frame = document.createElement("iframe");
    frame.src = u.toString();
    frame.setAttribute("title", "Connect your domain");
    frame.setAttribute("sandbox", (config as OpenConfig | undefined)?.iframeSandbox || DEFAULT_SANDBOX);
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
    },
  };
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

async function toError(res: Response): Promise<CustomDomainError> {
  try {
    const body = await res.json();
    return new CustomDomainError(body.code || `http_${res.status}`, body.title || res.statusText, body.details);
  } catch {
    return new CustomDomainError(`http_${res.status}`, res.statusText);
  }
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
