/**
 * The widget application: an animated state machine over the connect flow
 * (spec §5). Internal screens collapse onto the 15 incumbent-named public statuses
 * (statuses.ts) emitted to the SDK on every transition. Renders inside a
 * Shadow DOM; all copy flows through i18n.t; all style through theme tokens.
 */
import { Api, ApiError } from "./api";
import { burstConfetti } from "./confetti";
import { setCustomCopy, setLocale, t } from "./i18n";
import { ANALYSIS_ICON_SET, providerDisplayName, providerIcon, setIconOverrides, slotIcon } from "./icons";
import type { Status, WidgetError } from "./statuses";
import { styles } from "./styles";
import { loadFontUrl, loadGoogleFont, resolveTokens, tokensToCSS } from "./theme";
import type { CustomProperties } from "./theme";
import type { CheckInfo, Connection, DnsRecord, InitPayload, OAuthResult, WidgetOptions } from "./types";

/** Internal screens (the ~33-screen machine collapsed to implementables). */
type Screen =
  | "intro"
  | "enter-domain"
  | "analysis"
  | "authorize" // OAuth or DC variant of LOGIN
  | "twofa" // Mode D branch — gated, unreachable until credential login ships
  | "existing"
  | "setup"
  | "progress"
  | "manual"
  | "provider-list"
  | "unsupported"
  | "dkim"
  | "email"
  | "error"
  | "done-auto"
  | "done-manual"
  | "done-shared"
  | "buy";

const SCREEN_STATUS: Record<Screen, Status> = {
  intro: "INITIAL",
  "enter-domain": "ENTER_DOMAIN",
  analysis: "DOMAIN_ANALYSIS",
  authorize: "LOGIN",
  twofa: "LOGIN_2FA",
  existing: "EXISTING_RECORDS",
  setup: "DOMAIN_SETUP",
  progress: "IN_PROGRESS",
  manual: "MANUAL_CONFIGURATION",
  "provider-list": "PROVIDER_MANUAL_SELECTION",
  unsupported: "PROVIDER_MANUAL_SELECTION",
  dkim: "DKIM_SETUP",
  // Email setup is an email-authentication interstitial; it collapses onto the
  // existing DKIM_SETUP public status so the 15-status contract is unchanged.
  email: "DKIM_SETUP",
  error: "EXIT_WITH_ERROR",
  "done-auto": "FINISHED_SUCCESSFULLY",
  "done-manual": "FINISHED_SUCCESSFULLY_MANUAL",
  "done-shared": "FINISHED_SUCCESSFULLY_LINK_SHARED",
  buy: "ENTER_DOMAIN",
};

const POLL_INTERVAL_MS = 3000;
const POLL_BACKOFF_MS = 8000;
const ANALYSIS_STEP_MIN_MS = 650; // keep the checklist legible even on fast APIs

export class WidgetApp {
  private root: ShadowRoot;
  private post: (type: string, payload?: unknown) => void;

  private api!: Api;
  private opts: WidgetOptions = {};
  private tokens: Record<string, string> = resolveTokens();
  private disabledScreens = new Set<string>();

  private screen: Screen = "intro";
  private renderDirection: "fwd" | "back" = "fwd";
  private shellMounted = false;
  private domain = "";
  private subdomain = "";
  private useSubdomain = false;
  private check?: CheckInfo;
  private connection?: Connection;
  private records: DnsRecord[] = [];
  private dkimRecords: DnsRecord[] = [];
  private dkimShown = false;
  private emailRecords: DnsRecord[] = [];
  private emailShown = false;
  private controlPanelUrl = ""; // provider DNS control-panel deep-link (Domain Connect discovery)
  private conflictsAccepted = false;
  private notice = "";
  private noticeKind: "warning" | "info" | "error" | "success" = "warning";
  private error?: WidgetError;
  // Resume/multi-domain state.
  private resumed = false; // this domain's connection was returned (200), not created (201)
  private alreadyConnected = false; // resumed AND already live at creation (WS5-7)
  private pendingDomains: string[] = []; // domains still to process (CP-PAR-3)
  private processedDomains: string[] = []; // domains already completed
  private analysisStep = 0;
  private setupStep = 0;
  private marqueeIndex = 0;
  private marqueeTimer?: ReturnType<typeof setInterval>;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private popup: Window | null = null;
  private exitConfirm = false;
  private providerCatalog: Array<{ id: string }> = [];
  private providerFilter = "";
  private buyResults: Array<{ domain: string; available: boolean; price?: string }> = [];
  private buyBusy = false;
  // WS4-F6 purchase-checkout state: the domain the user chose to buy, whether a
  // checkout session is being created, and whether one was started (so the buy
  // screen shows the payment-pending handoff instead of the search results).
  private buyChosen: { domain: string; price?: string } | null = null;
  private buyCheckoutBusy = false;
  private buyCheckoutStarted = false;
  private automaticPath = false; // whether success came via OAuth/DC (vs manual)
  private shared = false;
  private legacyTheme?: Record<string, string>;
  private darkMq?: MediaQueryList;
  private darkListener?: () => void;

  constructor(host: HTMLElement, post: (type: string, payload?: unknown) => void) {
    this.root = host.attachShadow({ mode: "open" });
    this.post = post;
    this.render();
  }

  /**
   * Called by the boundary when no customdomain:init arrives within the
   * handshake window — a broken embed (SDK failed before posting init, the
   * host page navigated away mid-open, or /widget opened directly without the
   * SDK). Without this the intro spinner runs forever, which reads as a
   * glitch; instead surface the standard error screen so the user can close.
   */
  initTimedOut() {
    if (this.screen !== "intro") return; // init arrived — nothing to do
    this.failWith("InitTimeoutError", t("error.body.init"));
  }

  /** Wire in the init payload from the SDK. */
  init(payload: InitPayload, apiBase: string) {
    this.api = new Api(apiBase, payload.token);
    this.opts = payload.config || {};
    const wl = this.opts.whiteLabel;
    setLocale(this.opts.locale);
    // Pass the integrator's requested locale (region variant included) so
    // customCopy resolves region → base → "*" (WS7-F8).
    setCustomCopy(wl?.customCopy, this.opts.locale);
    setIconOverrides(wl?.icons);
    if (wl?.googleFont) loadGoogleFont(wl.googleFont);
    if (wl?.fontUrl) loadFontUrl(wl.fontUrl);
    this.legacyTheme = payload.theme;
    this.tokens = resolveTokens(wl, payload.theme, prefersDark());
    this.watchDarkMode();
    // The constructor's first render mounted the shell with DEFAULT tokens —
    // this payload didn't exist yet. Everything baked into the shell at mount
    // (stylesheet, brand logo, embedded/close/ToS chrome) would otherwise keep
    // the defaults forever, silently discarding the tenant's white-label config.
    // Remount it once now that tokens + whiteLabel are known; every later render
    // still takes the mount-once path, so the anti-flashing fix is preserved.
    this.shellMounted = false;
    this.useSubdomain = !!this.opts.forceSubdomain;
    this.disabledScreens = new Set(wl?.screens?.disable || []);
    const supplied = payload.dnsRecords || [];
    this.dkimRecords = supplied.filter((r) => r.purpose === "dkim" || /(^|\.)_domainkey(\.|$)/.test(r.host));
    if (this.opts.purchase) {
      this.setScreen("buy");
      return;
    }
    // Prefill can be a single domain or an array (multi-domain, CP-PAR-3). Route
    // every prefilled domain through the SAME normalize/validate as typed input
    // (WS5-8) — a URL-shaped or malformed prefill is normalized (or rejected)
    // before analysis, not analyzed raw.
    const rawList = Array.isArray(this.opts.prefilledDomain)
      ? this.opts.prefilledDomain
      : this.opts.prefilledDomain
        ? [this.opts.prefilledDomain]
        : payload.domain
          ? [payload.domain]
          : [];
    if (rawList.length) {
      const normalized = rawList.map((d) => normalizeDomain(d)).filter((d): d is string => !!d);
      if (normalized.length) {
        this.domain = normalized[0];
        this.pendingDomains = normalized.slice(1);
        const sub = subdomainOf(normalized[0]);
        if (sub) this.subdomain = sub;
        void this.analyze();
        return;
      }
      // Prefill was supplied but nothing survived normalization: land on the
      // domain-entry screen with a notice instead of analyzing garbage (WS5-8).
      this.setNotice(t("enter.invalid"), "warning");
    }
    this.setScreen("enter-domain");
  }

  onOAuthResult(result: OAuthResult) {
    if (!this.connection || result.connection_id !== this.connection.id) return;
    try {
      this.popup?.close();
    } catch {
      /* popup already closed itself */
    }
    this.popup = null;
    if (result.ok) {
      this.automaticPath = true;
      this.enterSetup();
      return;
    }
    const declined = result.code === "access_denied";
    this.setNotice(t(declined ? "notice.oauth.declined" : "notice.oauth.unavailable"), "info");
    if (result.message && !declined) this.setNotice(result.message, "info");
    this.setScreen("manual");
  }

  apiOrigin(): string {
    return this.api ? this.api.origin() : "";
  }

  /** customProperties toggles (incumbent parity), never undefined. */
  private cp(): CustomProperties {
    return this.opts.whiteLabel?.customProperties || {};
  }

  /** Whether the manual-setup path is disabled for this session. */
  private manualDisabled(): boolean {
    return this.disabledScreens.has("manualConfiguration") || !!this.cp().gotoManualLink?.hide;
  }

  /** Set the transient notice text and its visual kind (drives the .notice CSS variant). */
  private setNotice(msg: string, kind: "warning" | "info" | "error" | "success" = "warning") {
    this.notice = msg;
    this.noticeKind = kind;
  }

  /** darkMode:"auto" — re-resolve tokens and re-render when the OS preference flips. */
  private watchDarkMode() {
    if (this.opts.whiteLabel?.darkMode !== "auto" || typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    this.darkMq = mq;
    this.darkListener = () => {
      this.tokens = resolveTokens(this.opts.whiteLabel, this.legacyTheme, mq.matches);
      // The stylesheet is mounted once and not re-parsed per render, so refresh
      // it here when the palette actually changes (OS dark-mode flip).
      const st = this.root.getElementById("je-style");
      if (st) st.textContent = styles(tokensToCSS(this.tokens));
      this.render();
    };
    mq.addEventListener("change", this.darkListener);
  }

  // ---- transitions ----

  private setScreen(s: Screen, direction: "fwd" | "back" = "fwd") {
    // customProperties parity: a disabled optional screen is skipped to its
    // natural next screen. Loop (bounded) so a chain of disabled screens all
    // resolve; a screen with no defined skip returns itself → the disable is
    // ignored and it renders (WS7-F3). Unknown disable names never match a real
    // screenConfigName, so they're ignored by construction.
    for (let i = 0; i < 6 && this.disabledScreens.has(this.screenConfigName(s)); i++) {
      const next = this.skipTarget(s);
      if (next === s) break;
      s = next;
    }
    this.screen = s;
    this.renderDirection = direction;
    this.exitConfirm = false;
    this.post("customdomain:step", {
      step: SCREEN_STATUS[s],
      domain: this.domain || undefined,
      provider: this.check?.provider,
      user: this.opts.userId,
      // Multi-domain progression (CP-PAR-3): present only while a queue is
      // active, so single-domain step events keep their existing shape.
      ...(this.pendingDomains.length || this.processedDomains.length
        ? { pendingDomains: [...this.pendingDomains], processedDomains: [...this.processedDomains] }
        : {}),
    });
    // PII-free first-party funnel beacon: which step the user reached, so
    // pre-connection drop-off (invisible to server-side connection counters) is
    // measurable. Fire-and-forget; carries no domain/provider/user.
    this.api.telemetry(
      s,
      s === "error"
        ? "error"
        : s.startsWith("done")
          ? "success"
          : s === "existing" && this.check?.will_fallback_to_manual
            ? "fallback"
            : "view"
    );
    this.render();
    if (s === "analysis") this.startMarquee();
    else this.stopMarquee();
  }

  private screenConfigName(s: Screen): string {
    switch (s) {
      case "intro":
        return "initial";
      case "existing":
        return "existingRecords";
      case "manual":
        return "manualConfiguration";
      case "done-auto":
      case "done-manual":
        return "congratulations";
      default:
        return s;
    }
  }

  private skipTarget(s: Screen): Screen {
    switch (s) {
      case "existing":
        this.conflictsAccepted = true;
        // Predicted automatic→manual fallback (e.g. GoDaddy past its conflict
        // limit): skip the automated route that would silently dead-end and go
        // straight to manual — unless manual is disabled for this session.
        if (this.check?.will_fallback_to_manual && !this.manualDisabled()) return "manual";
        return this.routeAfterAnalysis();
      case "dkim":
        // Skip the DKIM interstitial → next pre-setup screen.
        this.dkimShown = true;
        return this.nextSetupScreen();
      case "email":
        this.emailShown = true;
        return this.nextSetupScreen();
      case "manual":
        // Manual disabled: the host applies DNS out-of-band, so jump straight to
        // verification/propagation polling instead of rendering the records
        // table. Fall back to rendering manual only if there's no connection to
        // watch yet (nothing to verify).
        if (!this.connection) return s;
        queueMicrotask(() => {
          if (this.screen === "progress") void this.poll();
        });
        return "progress";
      case "unsupported":
        // Skip the "we don't support X" interstitial → manual, or the provider
        // picker when manual is also disabled.
        return this.manualDisabled() ? "provider-list" : "manual";
      case "provider-list":
        return this.manualDisabled() ? "unsupported" : "manual";
      case "done-auto":
      case "done-manual":
        this.teardown();
        return s; // teardown closes; render is moot
      default:
        return s;
    }
  }

  private failWith(code: string, details?: string) {
    const bodies: Record<string, string> = {
      TimeoutError: t("error.body.timeout"),
      SessionError: t("error.body.session"),
      PopupBlockedError: t("error.body.popup"),
      InvalidNameservers: t("error.body.nameservers"),
      ProviderAuthenticationError: t("error.body.providerAuth"),
      PlanLimitError: t("error.body.planLimit"),
    };
    this.error = {
      code,
      title: t("error.title"),
      details: details || bodies[code] || t("error.body.generic"),
    };
    this.post("customdomain:error", { code, title: this.error.title, details: this.error.details, message: this.error.details });
    this.setScreen("error");
  }

  private fromApiError(err: unknown): { code: string; details?: string } {
    if (err instanceof ApiError) {
      // Translate the api-client's own labels AND the control-plane's snake_case
      // error codes into the widget's PascalCase ErrorCode union, so the error
      // screen and the customdomain:error event carry a specific, branchable
      // cause instead of collapsing every non-network/rate error to GenericError.
      // The server's human-readable message is always preserved in details.
      const map: Record<string, string> = {
        NetworkError: "NetworkError",
        RateLimitError: "RateLimitError",
        SessionError: "SessionError",
        // control-plane codes (api.go errInvalid/errForbidden/…):
        invalid_request: "InvalidDomainError", // dominant 400 on connect is a bad domain
        forbidden: "SessionError", // domain-bound token used for another host → re-auth
        // Entri-parity 422 codes the server emits verbatim (CP-PAR-2):
        InvalidNameservers: "InvalidNameservers",
        ProviderAuthenticationError: "ProviderAuthenticationError",
        // 402 billing rejection → a distinct, branchable plan-limit code (F8):
        quota_exceeded: "PlanLimitError",
      };
      // A 402 that arrives without the expected code still maps to the plan-limit
      // code so integrators can branch on it uniformly.
      const code = map[err.code] || (err.status === 402 ? "PlanLimitError" : "GenericError");
      return { code, details: err.message };
    }
    return { code: "GenericError", details: err instanceof Error ? err.message : undefined };
  }

  // ---- ENTER_DOMAIN ----

  private submitDomain() {
    const input = this.root.getElementById("d") as HTMLInputElement | null;
    if (!input) return;
    let raw = input.value.trim().toLowerCase();
    if (this.useSubdomain) {
      const sub = (this.root.getElementById("sub") as HTMLInputElement | null)?.value.trim().toLowerCase() || "";
      if (sub) raw = `${sub}.${raw}`;
      else if (this.opts.forceSubdomain && this.opts.defaultSubdomain) raw = `${this.opts.defaultSubdomain}.${raw}`;
      else if (this.opts.forceSubdomain) {
        // A subdomain is required and none was supplied.
        this.setNotice(t("enter.subdomain.required"), "warning");
        this.render();
        return;
      }
    } else if (this.opts.hostRequired && this.opts.defaultSubdomain && !raw.startsWith(`${this.opts.defaultSubdomain}.`)) {
      raw = `${this.opts.defaultSubdomain}.${raw}`;
    }
    const normalized = normalizeDomain(raw);
    if (!normalized) {
      this.setNotice(t("enter.invalid"), "warning");
      this.render();
      return;
    }
    this.notice = "";
    this.domain = normalized;
    // Auto-detect a subdomain the user typed straight into the main field (e.g.
    // "shop.acme.com") and pull it out as the host — so they don't have to toggle
    // "Use a subdomain" and re-enter. Connecting the full FQDN already produces
    // the right record; this just also populates the host param for the DC/host
    // flows. Only fill it when the user hasn't already supplied one.
    if (!this.subdomain) {
      const sub = subdomainOf(normalized);
      if (sub) this.subdomain = sub;
    }
    void this.analyze();
  }

  // ---- DOMAIN_ANALYSIS ----

  private async analyze() {
    this.analysisStep = 0;
    this.conflictsAccepted = false;
    this.resumed = false;
    this.alreadyConnected = false;
    this.setScreen("analysis");
    const stepDone = async (i: number, started: number) => {
      const dwell = ANALYSIS_STEP_MIN_MS - (Date.now() - started);
      if (dwell > 0) await sleep(dwell);
      this.analysisStep = i + 1;
      this.render();
    };
    try {
      let st = Date.now();
      this.check = await this.api.checkDomain(this.domain);
      // Adopt the server's authoritative PSL parse verdict over the local
      // subdomainOf() heuristic (a small multi-label list, not the full PSL).
      // For long-tail suffixes (acme.com.ng, shop.co.ke) the heuristic
      // misreads the apex as a subdomain, which poisons the DC host param —
      // the server's verdict is what the record math actually uses.
      if (typeof this.check?.subdomain === "string") {
        this.subdomain = this.check.subdomain;
      }
      await stepDone(0, st);
      st = Date.now();
      await stepDone(1, st); // provider identification came with the check
      st = Date.now();
      const created = await this.api.createConnection(this.domain, this.opts.endUserRef);
      this.connection = created.connection;
      this.resumed = created.resumed; // 200 = existing connection returned
      this.records = this.pickRecords(this.connection);
      await stepDone(2, st);
      await sleep(250); // let the last tick land
    } catch (err) {
      const { code, details } = this.fromApiError(err);
      this.failWith(code, details);
      return;
    }
    if (this.connection.status === "live") {
      // A domain returned already-live via resume (200) is "already connected",
      // not a fresh connect — flag it so the success event and screen reflect a
      // resume rather than re-firing a fresh success (WS5-7).
      this.alreadyConnected = this.resumed;
      this.finish("done-auto");
      return;
    }
    if (this.connection.status === "propagating") {
      this.startPolling();
      return;
    }
    if (this.opts.enableEmail && !this.emailShown) await this.loadEmailRecords();
    this.setScreen(this.nextSetupScreen());
  }

  /**
   * The next screen in the pre-setup interstitial chain: DKIM → email →
   * existing-records → the OAuth/DC/manual route. Each interstitial marks itself
   * shown so re-entry (via its "continue" button) advances to the next one.
   */
  private nextSetupScreen(): Screen {
    if (this.dkimRecords.length && this.opts.enableDkim && !this.dkimShown) return "dkim";
    if (this.emailRecords.length && this.opts.enableEmail && !this.emailShown) return "email";
    if ((this.check?.record_conflicts?.length ?? 0) > 0 && !this.conflictsAccepted) return "existing";
    return this.routeAfterAnalysis();
  }

  /**
   * Fetch the connection's authoritative record set and keep the email records
   * (email-full template: MX / SPF / DKIM selector / DMARC) for the email screen.
   * Best-effort: on failure the email screen is simply skipped.
   */
  private async loadEmailRecords() {
    if (!this.connection) return;
    try {
      const res = await this.api.records(this.connection.id);
      this.emailRecords = (res.records || []).filter(isEmailRecord);
    } catch {
      this.emailRecords = [];
    }
  }

  /** Post-analysis routing: OAuth > Domain Connect > manual/unsupported. */
  private routeAfterAnalysis(): Screen {
    if (this.opts.forceManualSetup) return "manual";
    const c = this.check;
    if (!c) return "manual";
    if (c.oauth_available && c.provider) return "authorize";
    if (c.domain_connect) return "authorize"; // DC variant of the same screen
    if (!c.provider) return "provider-list";
    if (!c.supports_automatic) return "unsupported";
    return "manual";
  }

  private pickRecords(conn: Connection): DnsRecord[] {
    if (conn.records && conn.records.length) return conn.records;
    return [{ type: "CNAME", host: conn.domain, value: "edge.customdomain.ai", ttl: 3600 }];
  }

  // ---- LOGIN (OAuth + DC) ----

  /**
   * Build the window.open feature string, preferring discovery-provided
   * dimensions when present and falling back to the built-in defaults.
   */
  private popupFeatures(defW: number, defH: number, w?: number, h?: number): string {
    const width = Math.round(w && w > 0 ? w : defW);
    const height = Math.round(h && h > 0 ? h : defH);
    return `popup,width=${width},height=${height}`;
  }

  private async authorize() {
    if (!this.connection || !this.check) return;
    if (this.check.oauth_available && this.check.provider) {
      try {
        const res = await this.api.oauthStart(this.connection.id, this.check.provider, window.location.origin);
        this.popup = window.open(res.authorize_url, "customdomain-oauth", this.popupFeatures(680, 760));
        if (!this.popup) {
          this.failWith("PopupBlockedError");
          return;
        }
        this.render(); // waiting sub-state
      } catch (err) {
        const e = this.fromApiError(err);
        this.setNotice(t("notice.oauth.unavailable"), "info");
        if (e.code === "SessionError") {
          this.failWith(e.code, e.details);
          return;
        }
        this.setScreen("manual");
      }
      return;
    }
    // Domain Connect (Mode A sync redirect by default). WS3-F3: when the tenant
    // opts into managed mode, request the durable async rail through the SAME
    // security-checked gate — the control plane transparently returns a sync
    // apply_url when async isn't available, so this never breaks a connect.
    try {
      const managed = !!this.opts.managed;
      const res = await this.api.domainConnectStart(this.connection.id, {
        host: this.subdomain || undefined,
        ...(managed ? { managed: true, return_origin: window.location.origin } : {}),
      });
      // Discovery may hand us the provider's control-panel deep-link and a
      // preferred popup size; keep the deep-link so a blocked popup can still
      // route the user to their DNS console.
      this.controlPanelUrl = res.url_control_panel || "";
      // Async (managed) rail returns a consent_url the user authorizes; the sync
      // rail returns an apply_url the provider writes from after the redirect.
      const async = res.rail === "async" || (!res.apply_url && !!res.consent_url);
      const authorizeUrl = res.apply_url || res.consent_url;
      this.popup = window.open(authorizeUrl, "customdomain-dc", this.popupFeatures(760, 820, res.width, res.height));
      if (!this.popup) {
        // Popup blocked: fall back to manual, offering the control-panel deep-link.
        this.setNotice(t("notice.popup.blocked"), "info");
        this.setScreen("manual");
        return;
      }
      this.automaticPath = true;
      if (async) {
        // Managed rail: the control-plane callback applies the records SERVER-SIDE
        // and its finish page postMessages the same customdomain:oauth envelope the
        // OAuth rail uses. Wait for it (onOAuthResult drives enterSetup) instead of
        // polling immediately, exactly like OAuth — otherwise we'd start a second
        // poll loop when the outcome lands.
        this.render(); // waiting sub-state
      } else {
        this.enterSetup(); // sync: the provider writes; we watch public DNS
      }
    } catch {
      // Template/vars mismatch or discovery raced away — manual is the floor.
      this.setNotice(t("notice.oauth.unavailable"), "info");
      this.setScreen("manual");
    }
  }

  // ---- DOMAIN_SETUP / IN_PROGRESS ----

  private enterSetup() {
    this.setupStep = 0;
    this.setScreen("setup");
    // Animate the setup checklist while the records propagate; hand over to
    // the polling loop after the stepped intro.
    const advance = () => {
      this.setupStep++;
      this.render();
      if (this.setupStep < 2) setTimeout(advance, 900);
      else this.startPolling(true);
    };
    setTimeout(advance, 900);
  }

  private startPolling(staySetup = false) {
    if (!this.connection) return;
    if (!staySetup) this.setScreen("progress");
    void this.poll();
  }

  private async poll() {
    if (!this.connection) return;
    let delay = POLL_INTERVAL_MS;
    try {
      const conn = await this.api.getConnection(this.connection.id);
      this.connection = conn;
      this.records = this.pickRecords(conn);
      this.render();
      if (conn.status === "live") {
        this.finish(this.automaticPath ? "done-auto" : "done-manual");
        return;
      }
      if (conn.status === "failed" || conn.status === "timed_out") {
        // P6.4 · F11 — the control plane records WHY a connection failed
        // (model.go:276-277 error_code/error_message). Passing the human half
        // through as `details` replaces the generic timeout copy with the
        // actual reason; an absent message falls back to that copy, so nothing
        // regresses for a control plane that never set one.
        this.failWith("TimeoutError", conn.error_message || undefined);
        return;
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "RateLimitError") {
        delay = POLL_BACKOFF_MS;
      } else {
        const { code, details } = this.fromApiError(err);
        this.failWith(code, details);
        return;
      }
    }
    this.pollTimer = setTimeout(() => void this.poll(), delay);
  }

  private finish(screen: "done-auto" | "done-manual") {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    // Record this domain as processed (multi-domain progression, CP-PAR-3).
    if (!this.processedDomains.includes(this.domain)) this.processedDomains.push(this.domain);
    this.setScreen(screen);
    this.post("customdomain:success", {
      jobId: this.connection?.id,
      domain: this.domain,
      setupType: screen === "done-auto" ? "automatic" : "manual",
      provider: this.check?.provider ?? null,
      success: true,
      // Distinct resume flag: an already-live domain re-submit is surfaced as
      // already-connected, not a fresh connect (WS5-7).
      ...(this.alreadyConnected ? { alreadyConnected: true } : {}),
      ...(this.pendingDomains.length || this.processedDomains.length > 1
        ? { pendingDomains: [...this.pendingDomains], processedDomains: [...this.processedDomains] }
        : {}),
    });
    // No celebratory confetti for a resume (the domain was already connected).
    if (!this.alreadyConnected && this.tokens["confetti-display"] !== "none") {
      const modal = this.root.querySelector(".modal") as HTMLElement | null;
      if (modal) {
        burstConfetti(modal, [
          this.tokens["color-primary"],
          this.tokens["color-accent"],
          this.tokens["color-success"],
          "#fbbf24",
        ]);
      }
    }
  }

  /**
   * Advance the multi-domain queue: reset the per-domain state and analyze the
   * next pending domain. When the queue is empty this tears the widget down as a
   * normal completion (CP-PAR-3).
   */
  private advanceToNextDomain() {
    const next = this.pendingDomains.shift();
    if (!next) {
      this.teardown();
      return;
    }
    this.domain = next;
    this.subdomain = "";
    this.check = undefined;
    this.connection = undefined;
    this.records = [];
    this.dkimShown = false;
    this.emailShown = false;
    this.emailRecords = [];
    this.conflictsAccepted = false;
    this.automaticPath = false;
    this.controlPanelUrl = "";
    this.notice = "";
    const sub = subdomainOf(next);
    if (sub) this.subdomain = sub;
    void this.analyze();
  }

  // ---- share (link-shared branch) ----

  private async shareByEmail() {
    const forwardUrl = this.cp().forwardLink?.url;
    // WS4-F5: mint a REAL, resumable share link via POST /v1/sharing/connect so
    // "forward the connect flow to whoever controls DNS" actually hands over a
    // resumable flow — replacing the old dead-end that emailed raw records and
    // created nothing the recipient could resume.
    let link = "";
    let jobId = "";
    try {
      const res = await this.api.createSharedFlow({ domain: this.domain, prefill: this.sharePrefill() });
      link = res.link;
      jobId = res.job_id;
    } catch {
      // Minting failed (offline / server error): fall through to the raw-records
      // email so the button never dead-ends — the recipient can still add records.
    }

    if (forwardUrl && /^https:\/\//i.test(forwardUrl)) {
      // Tenant-supplied hand-off page owns delivery; pass it the resumable link.
      const sep = forwardUrl.includes("?") ? "&" : "?";
      window.open(link ? `${forwardUrl}${sep}link=${encodeURIComponent(link)}` : forwardUrl, "_blank", "noopener");
    } else if (link) {
      // Deliver the resumable link by email — mailto is the DELIVERY, the minted
      // link is the resumable artifact.
      const subject = encodeURIComponent(`Finish connecting ${this.domain}`);
      const body = encodeURIComponent(
        `Please finish connecting ${this.domain} by opening this link and following the steps:\n\n${link}\n\nSetup completes automatically once the DNS records are added.`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    } else {
      // Fallback (mint failed): email the raw records as before.
      const lines = this.records.map((r) => `${r.type}  ${r.host}  ${r.value}${r.ttl ? `  TTL ${r.ttl}` : ""}`);
      const subject = encodeURIComponent(`DNS setup for ${this.domain}`);
      const body = encodeURIComponent(
        `Please add these DNS records for ${this.domain}:\n\n${lines.join("\n")}\n\nOnce added, the connection completes automatically.`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    }

    this.shared = true;
    // Enrich the shared event with the minted link + job id so an integrator can
    // deliver it however it wants (the SDK re-dispatches customdomain:shared).
    this.post("customdomain:shared", { domain: this.domain, ...(link ? { link, jobId } : {}) });
    this.setScreen("done-shared");
  }

  /**
   * Build the server-stored prefill for a share link: the branding + config a
   * resumed flow needs to render exactly like this session (WS4-F5). The share
   * request stamps the target domain server-side, so it is omitted here.
   */
  private sharePrefill(): Record<string, unknown> {
    const o = this.opts;
    const prefill: Record<string, unknown> = {};
    if (o.whiteLabel) prefill.whiteLabel = o.whiteLabel;
    if (o.locale) prefill.locale = o.locale;
    if (o.applicationName) prefill.applicationName = o.applicationName;
    if (o.forceSubdomain) prefill.forceSubdomain = o.forceSubdomain;
    if (o.supportForSubdomains !== undefined) prefill.supportForSubdomains = o.supportForSubdomains;
    if (o.defaultSubdomain) prefill.defaultSubdomain = o.defaultSubdomain;
    if (o.hostRequired) prefill.hostRequired = o.hostRequired;
    if (o.manualSetupDocumentation) prefill.manualSetupDocumentation = o.manualSetupDocumentation;
    if (o.enableDkim) prefill.enableDkim = o.enableDkim;
    if (o.enableEmail) prefill.enableEmail = o.enableEmail;
    if (o.managed) prefill.managed = o.managed;
    return prefill;
  }

  // ---- provider list ----

  private async openProviderList() {
    if (!this.providerCatalog.length) {
      try {
        const res = await this.api.listProviders();
        this.providerCatalog = res.providers;
      } catch {
        this.providerCatalog = [];
      }
    }
    this.setScreen("provider-list");
  }

  // ---- buy (Sell) ----

  private async buySearch() {
    const q = (this.root.getElementById("buy-q") as HTMLInputElement | null)?.value.trim().toLowerCase();
    if (!q) return;
    this.buyBusy = true;
    this.render();
    try {
      const res = await this.api.registrarSearch(q, { searchType: this.opts.searchType });
      this.buyResults = (res.results || []).map((r) => ({
        domain: r.domain,
        available: r.available,
        price: r.price_cents != null ? formatPrice(r.price_cents, r.currency) : undefined,
      }));
    } catch (err) {
      const e = this.fromApiError(err);
      const msg = e.code === "GenericError" && err instanceof ApiError && err.status === 503 ? t("buy.disabled") : e.details || t("buy.disabled");
      this.setNotice(msg, "error");
      this.buyResults = [];
    }
    this.buyBusy = false;
    this.render();
  }

  /**
   * WS4-F6: the user picked an available domain to BUY. Previously this dumped
   * the domain straight into connect analysis (`analyze()`) — a connect flow for
   * a domain nobody owns yet, so the buy use case never actually purchased.
   * Instead, enter the purchase rail: hold the chosen domain + price and render
   * the checkout step (registrant email → initiate a real checkout). Connect
   * only happens AFTER the domain is registered (fulfillment), never before.
   */
  private buyPick(domain: string) {
    const chosen = this.buyResults.find((r) => r.domain === domain && r.available);
    if (!chosen) return;
    this.buyChosen = { domain, price: chosen.price };
    this.buyCheckoutStarted = false;
    this.notice = "";
    this.render();
  }

  /** Return from the checkout step to the search results. */
  private buyBack() {
    this.buyChosen = null;
    this.buyCheckoutStarted = false;
    this.notice = "";
    this.render();
  }

  /**
   * WS4-F6: initiate the purchase for the chosen domain. Collects the
   * registrant email (ICANN requires a real registrant contact), then calls the
   * Sell rail's checkout endpoint, which records a durable order and returns an
   * embedded Stripe session. On success we surface that session to the host via
   * `customdomain:purchase` (the host mounts Stripe payment + calls fulfill, which
   * auto-connects the domain) and show the payment-pending state.
   *
   * DEFERRED (reported): the widget's self-contained/CSP-locked iframe cannot load
   * Stripe.js, so it can neither mount Embedded Checkout nor call
   * POST /v1/registrar/fulfill itself — payment collection, fulfillment, and the
   * post-fulfillment connect are handed to the host via the emitted session.
   */
  private async buyCheckout() {
    if (!this.buyChosen || this.buyCheckoutBusy) return;
    const email = (this.root.getElementById("buy-email") as HTMLInputElement | null)?.value.trim() || "";
    if (!isEmail(email)) {
      this.setNotice(t("buy.checkout.invalidEmail"), "error");
      return;
    }
    const domain = this.buyChosen.domain;
    this.buyCheckoutBusy = true;
    this.notice = "";
    this.render();
    try {
      const session = await this.api.checkoutDomain({
        domain,
        buyer: { email },
        // The host may redirect back here after payment; the widget document URL
        // is a valid absolute return target the host can override.
        return_url: typeof location !== "undefined" ? location.href : this.api.origin(),
      });
      this.buyCheckoutStarted = true;
      // Hand the checkout session to the host so it can mount payment (Stripe
      // Embedded Checkout needs the client_secret) and, once paid, finalize via
      // POST /v1/registrar/fulfill — which registers and connects the domain.
      this.post("customdomain:purchase", {
        domain,
        sessionId: session.id,
        clientSecret: session.client_secret,
        url: session.url,
      });
    } catch (err) {
      const e = this.fromApiError(err);
      const msg =
        err instanceof ApiError && err.status === 503 ? t("buy.disabled") : e.details || t("buy.disabled");
      this.setNotice(msg, "error");
    }
    this.buyCheckoutBusy = false;
    this.render();
  }

  // ---- teardown / exit ----

  private requestClose() {
    const midFlow = ["enter-domain", "analysis", "authorize", "manual", "existing", "dkim", "email", "provider-list", "unsupported", "progress", "setup"].includes(
      this.screen
    );
    if (midFlow && this.connection?.status !== "live") {
      this.exitConfirm = true;
      this.render();
      return;
    }
    this.teardown();
  }

  private teardown() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.stopMarquee();
    if (this.darkMq && this.darkListener) this.darkMq.removeEventListener("change", this.darkListener);
    try {
      this.popup?.close();
    } catch {
      /* popup already gone */
    }
    if (this.opts.whiteLabel?.delegateClose || this.cp().useCustomExitConfirmation) {
      // The host owns dismissal (incumbent onEntriRequestClose semantics).
      this.post("customdomain:request-close", { lastStatus: SCREEN_STATUS[this.screen] });
      return;
    }
    this.post("customdomain:close", {
      lastStatus: SCREEN_STATUS[this.screen],
      shared: this.shared,
      manualScreenDisabled: this.manualDisabled(),
    });
  }

  // ---- marquee ----

  private startMarquee() {
    this.stopMarquee();
    this.marqueeTimer = setInterval(() => {
      this.marqueeIndex = (this.marqueeIndex + 1) % ANALYSIS_ICON_SET.length;
      const row = this.root.querySelector(".icon-marquee");
      if (row) row.innerHTML = this.marqueeTiles();
    }, 420);
  }

  private stopMarquee() {
    if (this.marqueeTimer) clearInterval(this.marqueeTimer);
    this.marqueeTimer = undefined;
  }

  private marqueeTiles(): string {
    return ANALYSIS_ICON_SET.map((id, i) => {
      const spotted = i === this.marqueeIndex;
      const state = this.analysisStep >= 2 && this.check?.provider === id ? "finished" : spotted ? "initial" : "inactive";
      return `<div class="tile ${spotted ? "spot" : ""}">${providerIcon(id, state)}</div>`;
    }).join("");
  }

  // ---- rendering ----

  private render() {
    // Mount the persistent chrome (stylesheet + modal shell + logo) exactly once;
    // subsequent renders only swap the .screen body. Re-injecting the whole tree
    // every step re-parsed the (large) stylesheet and reloaded the logo <img>,
    // which is what produced the visible flashing between analysis steps / polls.
    if (!this.shellMounted) {
      this.mountShell();
      this.shellMounted = true;
    }
    const centered = ["analysis", "setup", "progress", "done-auto", "done-manual", "done-shared", "intro"].includes(this.screen);
    const screenEl = this.root.querySelector(".screen") as HTMLElement | null;
    if (!screenEl) return;
    screenEl.className = `screen${this.renderDirection === "back" ? " back" : ""}${centered ? " centered" : ""}`;
    screenEl.innerHTML = this.body();
    // The exit-confirm overlay is the only dynamic node outside the screen body.
    const modal = this.root.querySelector(".modal") as HTMLElement | null;
    const wrap = this.root.getElementById("je-exit-wrap");
    if (this.exitConfirm) {
      if (!wrap && modal) modal.insertAdjacentHTML("beforeend", `<div id="je-exit-wrap" style="display:contents">${this.exitOverlay()}</div>`);
    } else if (wrap) {
      wrap.remove();
    }
    this.wire();
    this.focusPrimary();
  }

  private mountShell() {
    const closeSvg = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>`;
    this.root.innerHTML = `
      <style id="je-style">${styles(tokensToCSS(this.tokens))}</style>
      <div class="root">
        <div class="backdrop ${this.opts.whiteLabel?.embedded ? "embedded" : ""}" role="presentation">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="je-title" aria-live="off">
            <div class="sheet-handle" aria-hidden="true"></div>
            ${
              this.cp().hideCloseButton
                ? ""
                : `<button id="x" class="icon-close" aria-label="${esc(t("a11y.close"))}">${slotIcon("close", closeSvg)}</button>`
            }
            ${this.tokens["logo-url"] ? `<img class="brand-logo" src="${esc(this.tokens["logo-url"])}" alt="">` : ""}
            <div class="screen"></div>
            <div class="footer">${esc(t("footer.powered"))}${
              this.cp().showEntriToS ? `<div class="tos-notice">${esc(t("footer.tos"))}</div>` : ""
            }</div>
          </div>
        </div>
      </div>`;
    this.wireShell();
  }

  // Wire the persistent shell nodes (close button + modal keyboard trap) exactly
  // once. wire() runs on every render for the body; re-binding these would stack
  // duplicate listeners since these nodes are never re-created.
  private wireShell() {
    this.root.getElementById("x")?.addEventListener("click", () => this.requestClose());
    const modal = this.root.querySelector(".modal") as HTMLElement | null;
    modal?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        modal.querySelectorAll<HTMLElement>("button, input, [tabindex]:not([tabindex='-1'])")
      ).filter((el) => !el.hasAttribute("disabled"));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = (this.root as unknown as Document).activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  private exitOverlay(): string {
    return `<div class="overlay" role="alertdialog" aria-labelledby="je-exit-title">
      <h2 id="je-exit-title">${esc(t("exit.title"))}</h2>
      <p>${esc(t("exit.body"))}</p>
      <div class="row">
        <button id="exit-stay" class="secondary">${esc(t("exit.stay"))}</button>
        <button id="exit-leave">${esc(t("exit.leave"))}</button>
      </div>
    </div>`;
  }

  private body(): string {
    switch (this.screen) {
      case "intro":
        return `<h2 id="je-title">${esc(t("a11y.dialog"))}</h2>
          <div class="progress">${loadingSlot()}</div>`;

      case "enter-domain": {
        const forceSub = !!this.opts.forceSubdomain;
        const subFields = this.useSubdomain
          ? `<label for="sub">${esc(t("enter.subdomain.label"))}</label>
             <input type="text" id="sub" placeholder="${esc(t("enter.subdomain.placeholder"))}"
               value="${esc(this.subdomain)}" autocomplete="off" spellcheck="false"/>`
          : "";
        const subToggle =
          this.opts.supportForSubdomains === false && !forceSub
            ? ""
            : forceSub
              ? subFields // forced: no toggle, subdomain input is mandatory
              : `<label class="toggle"><input type="checkbox" id="sub-toggle" ${this.useSubdomain ? "checked" : ""}/>
                   <span>${esc(t("enter.subdomain.toggle"))}</span></label>
                 ${subFields}`;
        const enterHeading = this.opts.applicationName
          ? t("enter.title.app", { APP: this.opts.applicationName })
          : t("enter.title");
        return `<div class="lead-ico">${slotIcon("domain", ICON_DEFAULTS.domain)}</div>
          <h2 id="je-title">${esc(enterHeading)}</h2>
          <p>${esc(t("enter.body"))}</p>
          ${this.notice ? `<p class="notice ${this.noticeKind}" aria-live="polite">${esc(this.notice)}</p>` : ""}
          <label for="d">${esc(t("enter.label"))}</label>
          <input type="text" id="d" placeholder="${esc(t("enter.placeholder"))}" value="${esc(this.domain)}"
            autocomplete="off" spellcheck="false" inputmode="url"/>
          ${subToggle}
          <button id="go">${esc(t("action.continue"))}</button>`;
      }

      case "analysis": {
        const steps = [t("analysis.step.dns"), t("analysis.step.provider"), t("analysis.step.records")];
        const checklist = this.cp().hideProgressIndicator
          ? ""
          : `<div class="checklist" aria-live="polite">
            ${steps
              .map((label, i) => {
                const state = this.analysisStep > i ? "done" : this.analysisStep === i ? "active" : "";
                const icon =
                  this.analysisStep > i
                    ? tickCircle()
                    : this.analysisStep === i
                      ? `<div class="spinner mini-spin"></div>`
                      : `<span class="dot"></span>`;
                return `<div class="check-item ${state}"><span class="check-icon">${icon}</span><span>${esc(label)}</span></div>`;
              })
              .join("")}
          </div>`;
        return `<h2 id="je-title">${esc(t("analysis.title", { DOMAIN: this.domain }))}</h2>
          <div class="icon-marquee" aria-hidden="true">${this.marqueeTiles()}</div>
          ${checklist}`;
      }

      case "authorize": {
        const provider = providerDisplayName(this.check?.provider || this.check?.authoritative_dns_provider || "");
        const isOAuth = !!this.check?.oauth_available;
        const waiting = !!this.popup && isOAuth;
        const bodyKey = isOAuth ? "login.body" : "login.dc.body";
        const ctaKey = isOAuth ? "login.cta" : "login.dc.cta";
        return `<h2 id="je-title">${esc(t("login.title", { DOMAIN: this.domain }))}</h2>
          <div class="provider-hero">
            <div class="tile">${providerIcon(this.check?.provider || "unknown", "initial")}</div>
            <span class="name">${esc(provider)}<span class="sub">${esc(this.domain)}</span></span>
          </div>
          <p>${esc(t(bodyKey, { PROVIDER: provider }))}</p>
          <p class="fineprint">
            <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 1a2.8 2.8 0 0 0-2.8 2.8V5H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-.2V3.8A2.8 2.8 0 0 0 6 1Zm1.6 4H4.4V3.8a1.6 1.6 0 1 1 3.2 0V5Z"/></svg>
            ${esc(t("login.permission"))}</p>
          ${
            waiting
              ? `<div class="progress">${loadingSlot()}
                 <span aria-live="polite">${esc(t("login.waiting", { PROVIDER: provider }))}</span></div>`
              : `<button id="oauth">${esc(t(ctaKey, { PROVIDER: provider }))}</button>`
          }
          ${
            this.cp().providerLogin?.changeProvider?.hide
              ? ""
              : `<button id="go-manual" class="link">${esc(t("login.manual"))}</button>`
          }`;
      }

      case "twofa":
        // Mode D branch (credential login) — screen exists for parity; the rail
        // is allowlist-gated server-side and not yet reachable.
        return `<h2 id="je-title">${esc(t("twofa.title"))}</h2>
          <p>${esc(t("twofa.body"))}</p>
          <label for="code">${esc(t("twofa.label"))}</label>
          <input type="text" id="code" inputmode="numeric" autocomplete="one-time-code"/>
          <button id="go">${esc(t("action.continue"))}</button>`;

      case "existing": {
        const conflicts = this.check?.record_conflicts || [];
        // When the provider would silently drop an automated write to manual
        // past its conflict limit, tell the user to clear the records first and
        // relabel the action (skipTarget routes it straight to manual).
        const fallback = !!this.check?.will_fallback_to_manual;
        const provider =
          providerDisplayName(this.check?.provider || this.check?.authoritative_dns_provider || "") ||
          t("existing.provider_generic");
        const body = fallback
          ? t("existing.fallback.body", { PROVIDER: provider, LIMIT: this.check?.conflict_tolerance ?? 0 })
          : t("existing.body", { DOMAIN: this.domain });
        const warnIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5l9 16H3l9-16z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>`;
        return `<h2 id="je-title">${esc(t("existing.title"))}</h2>
          <div class="warn-callout">${warnIcon}<p>${esc(body)}</p></div>
          <div class="conflict-label">${esc(t("existing.label"))} · ${conflicts.length}</div>
          <div class="conflict-group">
          ${conflicts
            .map(
              (c) =>
                `<div class="conflict"><div class="conflict-head">${esc(c.type)} ${esc(c.host)}</div>` +
                `<div class="conflict-line"><span class="lbl">${esc(t("existing.current"))}</span> <code>${esc(c.existing)}</code></div>` +
                `<div class="conflict-line"><span class="lbl">${esc(t("existing.desired"))}</span> <code>${esc(c.desired)}</code></div></div>`
            )
            .join("")}
          </div>
          <button id="existing-go">${esc(t(fallback ? "existing.fallback.confirm" : "existing.confirm"))}</button>`;
      }

      case "setup": {
        const steps = [t("setup.step.write"), t("setup.step.confirm"), t("setup.step.propagate")];
        const checklist = this.cp().hideProgressIndicator
          ? ""
          : `<div class="checklist" aria-live="polite">
            ${steps
              .map((label, i) => {
                const state = this.setupStep > i ? "done" : this.setupStep === i ? "active" : "";
                const icon =
                  this.setupStep > i
                    ? tickCircle()
                    : this.setupStep === i
                      ? `<div class="spinner mini-spin"></div>`
                      : `<span class="dot"></span>`;
                return `<div class="check-item ${state}"><span class="check-icon">${icon}</span><span>${esc(label)}</span></div>`;
              })
              .join("")}
          </div>`;
        return `<h2 id="je-title">${esc(t("setup.title", { DOMAIN: "" })).replace(/\s+/g, " ").trim()}</h2>
          ${domainHero(this.domain, { quiet: true })}
          ${checklist}
          <p class="fineprint">${esc(t("setup.hint"))}</p>`;
      }

      case "progress": {
        const status = this.connection?.status ?? "pending";
        const label = status === "propagating" ? t("progress.found") : t("progress.looking");
        return `<h2 id="je-title">${esc(t("progress.title", { DOMAIN: "" })).replace(/\s+/g, " ").trim()}</h2>
          ${domainHero(this.domain, { quiet: true })}
          <div class="progress">${loadingSlot()}
          <span aria-live="polite">${esc(label)}</span></div>
          <p>${esc(t("progress.hint"))}</p>`;
      }

      case "manual": {
        const guide = this.opts.manualSetupDocumentation;
        const provider = providerDisplayName(this.check?.provider || "");
        const live = this.connection?.status === "live";
        const done = live ? this.records.length : 0;
        const hideRecords = !!this.cp().recordsPreview?.hide;
        const forward = this.cp().forwardLink;
        return `<div class="lead-ico">${slotIcon("dns", ICON_DEFAULTS.dns)}</div>
          <h2 id="je-title">${esc(t("manual.title"))}</h2>
          ${this.notice ? `<p class="notice ${this.noticeKind}" aria-live="polite">${esc(this.notice)}</p>` : ""}
          <p>${esc(t("manual.body", { DOMAIN: this.domain }))}</p>
          ${
            hideRecords
              ? ""
              : `<div class="tracker" aria-live="polite">${esc(t("manual.progress", { DONE: done, TOTAL: this.records.length }))}</div>
                 <div class="records stagger">${this.records.map((r, i) => this.recordCard(r, i, live)).join("")}</div>`
          }
          ${guide ? `<button id="doc" class="secondary">${esc(t("manual.guide", { PROVIDER: provider }))}</button>` : ""}
          ${
            this.controlPanelUrl
              ? `<button id="control-panel" class="secondary">${esc(t("manual.controlPanel"))}</button>`
              : ""
          }
          <button id="verify">${esc(t("manual.verify"))}</button>
          ${
            forward?.hide
              ? ""
              : `<button id="share" class="link"><span class="b-ico">${slotIcon("share", ICON_DEFAULTS.share)}</span>${esc(forward?.label || t("manual.share"))}</button>`
          }`;
      }

      case "provider-list": {
        const q = this.providerFilter;
        const list = this.providerCatalog.filter((p) => !q || p.id.includes(q) || providerDisplayName(p.id).toLowerCase().includes(q));
        return `<h2 id="je-title">${esc(t("providers.title"))}</h2>
          <p>${esc(t("providers.body"))}</p>
          <label for="pq">${esc(t("providers.search"))}</label>
          <input type="text" id="pq" value="${esc(q)}" autocomplete="off"/>
          <div class="plist">
            ${list
              .slice(0, 40)
              .map(
                (p) =>
                  `<button data-provider="${esc(p.id)}"><span class="tile">${providerIcon(p.id, "initial")}</span>${esc(providerDisplayName(p.id))}</button>`
              )
              .join("")}
          </div>
          ${
            this.cp().gotoManualLink?.hide
              ? ""
              : `<button id="go-manual" class="link">${esc(t("providers.other"))}</button>`
          }`;
      }

      case "unsupported": {
        const provider = providerDisplayName(this.check?.provider || "");
        return `<h2 id="je-title">${esc(t("unsupported.title", { PROVIDER: provider }))}</h2>
          <p>${esc(t("unsupported.body"))}</p>
          <button id="go-manual"><span class="b-ico">${slotIcon("manual", ICON_DEFAULTS.manual)}</span>${esc(t("unsupported.cta"))}</button>`;
      }

      case "dkim":
        return `<h2 id="je-title">${esc(t("dkim.title"))}</h2>
          <p>${esc(t("dkim.body", { DOMAIN: this.domain }))}</p>
          <div class="records stagger">${this.dkimRecords.map((r, i) => this.recordCard(r, i, false)).join("")}</div>
          <button id="dkim-go">${esc(t("dkim.continue"))}</button>`;

      case "email":
        return `<h2 id="je-title">${esc(t("email.title"))}</h2>
          <p>${esc(t("email.body", { DOMAIN: this.domain }))}</p>
          <div class="records stagger">${this.emailRecords.map((r, i) => this.recordCard(r, i, false)).join("")}</div>
          <button id="email-go">${esc(t("email.continue"))}</button>`;

      case "error":
        return `<h2 id="je-title">${esc(this.error?.title || t("error.title"))}</h2>
          <div class="err-mark" aria-hidden="true">${slotIcon("error", "!")}</div>
          <p aria-live="assertive">${esc(this.error?.details || t("error.body.generic"))}</p>
          <button id="retry"><span class="b-ico">${slotIcon("back", ICON_DEFAULTS.back)}</span>${esc(t("action.retry"))}</button>`;

      case "done-auto":
        return `<h2 id="je-title">${esc(t("done.title"))}</h2>
          ${doneMark()}
          ${domainHero(this.domain, { live: true })}
          <p>${esc(t("done.body", { DOMAIN: this.domain }))}</p>
          <button id="done">${esc(this.pendingDomains.length ? t("action.continue") : t("action.done"))}</button>`;

      case "done-manual":
        return `<h2 id="je-title">${esc(t("done.manual.title"))}</h2>
          ${doneMark()}
          ${domainHero(this.domain, { live: true })}
          <p>${esc(t("done.manual.body", { DOMAIN: this.domain }))}</p>
          <button id="done">${esc(this.pendingDomains.length ? t("action.continue") : t("action.done"))}</button>`;

      case "done-shared":
        return `<h2 id="je-title">${esc(t("done.shared.title"))}</h2>
          ${doneMark()}
          <p>${esc(t("done.shared.body", { DOMAIN: this.domain }))}</p>
          <button id="done">${esc(this.pendingDomains.length ? t("action.continue") : t("action.done"))}</button>`;

      case "buy": {
        const noticeHtml = this.notice
          ? `<p class="notice ${this.noticeKind}" aria-live="polite">${esc(this.notice)}</p>`
          : "";
        // WS4-F6: a domain has been chosen — show the checkout step (payment
        // pending after initiation, else the registrant-email form) instead of
        // the search results.
        if (this.buyChosen) {
          const d = this.buyChosen.domain;
          if (this.buyCheckoutStarted) {
            return `<h2 id="je-title">${esc(t("buy.cta", { DOMAIN: d }))}</h2>
              <p>${esc(t("buy.checkout.pending", { DOMAIN: d }))}</p>
              <button id="buy-back">${esc(t("action.back"))}</button>`;
          }
          return `<h2 id="je-title">${esc(t("buy.cta", { DOMAIN: d }))}</h2>
            ${noticeHtml}
            ${this.buyChosen.price ? `<p class="p">${esc(t("buy.price", { PRICE: this.buyChosen.price }))}</p>` : ""}
            <label for="buy-email">${esc(t("buy.checkout.email"))}</label>
            <input type="text" id="buy-email" inputmode="email" autocomplete="email" placeholder="you@example.com" spellcheck="false"/>
            <button id="buy-pay" ${this.buyCheckoutBusy ? "disabled" : ""}>${esc(this.buyCheckoutBusy ? t("buy.checkout.starting") : t("buy.checkout.pay"))}</button>
            <button id="buy-back" class="secondary">${esc(t("action.back"))}</button>`;
        }
        return `<h2 id="je-title">${esc(t("buy.title"))}</h2>
          ${noticeHtml}
          <label for="buy-q">${esc(t("buy.search"))}</label>
          <input type="text" id="buy-q" placeholder="${esc(t("enter.placeholder"))}" autocomplete="off" spellcheck="false"/>
          <button id="buy-go" ${this.buyBusy ? "disabled" : ""}>${esc(this.buyBusy ? t("buy.searching") : t("action.continue"))}</button>
          <div style="margin-top: var(--je-space-lg)">
            ${this.buyResults
              .map((r) =>
                r.available
                  ? `<div class="buy-result"><div><div class="d">${esc(r.domain)}</div>
                     ${r.price ? `<div class="p">${esc(t("buy.price", { PRICE: r.price }))}</div>` : ""}</div>
                     <button data-buy="${esc(r.domain)}">${esc(t("buy.cta", { DOMAIN: "" }))}</button></div>`
                  : `<div class="buy-result"><div class="d">${esc(t("buy.unavailable", { DOMAIN: r.domain }))}</div></div>`
              )
              .join("")}
          </div>`;
      }
    }
  }

  private recordCard(r: DnsRecord, i: number, showStatus: boolean): string {
    // APEXCNAME is the engine's provider-agnostic "CNAME at the apex" type. No
    // DNS panel labels a record that way — hosts spell it ALIAS, ANAME, or a
    // root CNAME (flattening) — so surface the most widely recognized spelling
    // (ALIAS) and explain the alternatives beneath the card.
    const isApexAlias = (r.type || "").toUpperCase() === "APEXCNAME";
    const displayType = isApexAlias ? "ALIAS" : r.type;
    const rows: Array<[string, string]> = [
      [t("manual.record.type"), displayType],
      [t("manual.record.name"), r.host],
      [t("manual.record.value"), r.value],
    ];
    if (r.priority != null) rows.push([t("manual.record.priority"), String(r.priority)]);
    if (r.ttl != null) rows.push([t("manual.record.ttl"), String(r.ttl)]);
    const live = this.connection?.status === "live";
    const status = showStatus
      ? `<div class="rec-status ${live ? "ok" : "wait"}"><span class="pip"></span>${esc(live ? t("manual.record.detected") : t("manual.record.waiting"))}</div>`
      : "";
    const apexHint = isApexAlias ? `<div class="rec-hint">${esc(t("manual.record.apexHint"))}</div>` : "";
    return `<div class="rec">${rows
      .map(
        ([k, v]) => `<div class="rec-row">
          <span class="rec-k">${esc(k)}</span>
          <span class="rec-v" id="rv-${i}-${esc(k.toLowerCase())}">${esc(v)}</span>
          <button class="copy" data-copy="${esc(v)}" aria-label="${esc(t("manual.copy"))} ${esc(k)} ${esc(v)}">${esc(t("manual.copy"))}</button>
        </div>`
      )
      .join("")}${apexHint}${status}</div>`;
  }

  private wire() {
    const q = (id: string) => this.root.getElementById(id) as HTMLElement | null;
    q("go")?.addEventListener("click", () => this.submitDomain());
    q("sub-toggle")?.addEventListener("change", (e) => {
      this.useSubdomain = (e.target as HTMLInputElement).checked;
      const d = this.root.getElementById("d") as HTMLInputElement | null;
      if (d) this.domain = d.value.trim();
      this.render();
    });
    q("oauth")?.addEventListener("click", () => void this.authorize());
    q("go-manual")?.addEventListener("click", () => {
      try {
        this.popup?.close();
      } catch {
        /* popup already gone */
      }
      this.popup = null;
      this.setScreen("manual");
    });
    q("existing-go")?.addEventListener("click", () => {
      this.conflictsAccepted = true;
      this.setScreen(this.routeAfterAnalysis());
    });
    q("dkim-go")?.addEventListener("click", () => {
      this.dkimShown = true;
      this.setScreen(this.nextSetupScreen());
    });
    q("email-go")?.addEventListener("click", () => {
      this.emailShown = true;
      this.setScreen(this.nextSetupScreen());
    });
    q("control-panel")?.addEventListener("click", () => {
      if (this.controlPanelUrl) window.open(this.controlPanelUrl, "_blank", "noopener");
    });
    q("verify")?.addEventListener("click", () => this.startPolling());
    q("share")?.addEventListener("click", () => void this.shareByEmail());
    q("doc")?.addEventListener("click", () => {
      this.post("customdomain:doc-click", { provider: this.check?.provider, domain: this.domain });
      if (this.opts.manualSetupDocumentation) window.open(this.opts.manualSetupDocumentation, "_blank", "noopener");
    });
    q("retry")?.addEventListener("click", () => {
      this.error = undefined;
      if (this.connection) this.setScreen(this.routeAfterAnalysis(), "back");
      else this.setScreen("enter-domain", "back");
    });
    q("done")?.addEventListener("click", () => {
      // Multi-domain: advance to the next queued domain; otherwise finish.
      if (this.pendingDomains.length) this.advanceToNextDomain();
      else this.teardown();
    });
    q("exit-stay")?.addEventListener("click", () => {
      this.exitConfirm = false;
      this.render();
    });
    q("exit-leave")?.addEventListener("click", () => this.teardown());
    q("pq")?.addEventListener("input", (e) => {
      this.providerFilter = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.render();
      (this.root.getElementById("pq") as HTMLInputElement | null)?.focus();
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-provider]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-provider") || "";
        if (this.check) this.check.provider = id;
        this.setScreen("manual");
      });
    });
    q("buy-go")?.addEventListener("click", () => void this.buySearch());
    q("buy-pay")?.addEventListener("click", () => void this.buyCheckout());
    q("buy-back")?.addEventListener("click", () => this.buyBack());
    this.root.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => this.buyPick(btn.getAttribute("data-buy") || ""));
    });
    this.root.querySelectorAll<HTMLButtonElement>("button.copy").forEach((btn) => {
      btn.addEventListener("click", () => void this.copy(btn));
    });
  }

  private focusPrimary() {
    const order = ["exit-stay", "d", "buy-email", "buy-q", "oauth", "existing-go", "dkim-go", "email-go", "go", "verify", "go-manual", "retry", "done", "x"];
    for (const id of order) {
      const el = this.root.getElementById(id) as HTMLElement | null;
      if (el) {
        el.focus();
        return;
      }
    }
  }

  private async copy(btn: HTMLButtonElement) {
    const text = btn.getAttribute("data-copy") || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      this.root.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* give up silently */
      }
      ta.remove();
    }
    const prev = btn.textContent;
    btn.textContent = t("manual.copied");
    setTimeout(() => {
      btn.textContent = prev;
    }, 1200);
  }
}

/** Normalize + validate a domain; IDN → punycode via the URL parser. */
// Two-label public suffixes where the registrable domain is the last THREE
// labels (example.co.uk), so we don't mistake "co" for a subdomain. Not the full
// PSL — just the widely-used ones a customer is likely to connect. PRE-CHECK
// HEURISTIC ONLY: the moment domains:check answers, analyze() adopts the
// server's authoritative full-PSL verdict (check.subdomain) over anything
// derived here, so this list can never poison the DC host for long-tail
// suffixes it doesn't know.
const MULTI_LABEL_TLDS = new Set([
  "co.uk", "org.uk", "me.uk", "gov.uk", "ac.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "net.nz", "org.nz", "co.za", "org.za", "co.jp", "or.jp", "ne.jp",
  "co.kr", "co.in", "com.br", "com.mx", "com.sg", "com.hk", "com.tw", "com.cn",
  "com.tr", "co.il", "co.id", "co.th",
]);

// subdomainOf returns the subdomain label(s) of a hostname, or "" when the input
// is a registrable (apex) domain. "shop.acme.com" -> "shop";
// "www.example.co.uk" -> "www"; "acme.com" -> "".
export function subdomainOf(host: string): string {
  const labels = host.replace(/\.$/, "").split(".");
  if (labels.length < 3) return "";
  const last2 = labels.slice(-2).join(".");
  const registrableLabels = (MULTI_LABEL_TLDS.has(last2) ? 2 : 1) + 1;
  if (labels.length <= registrableLabels) return "";
  return labels.slice(0, labels.length - registrableLabels).join(".");
}

export function normalizeDomain(raw: string): string {
  let d = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (!d || d.length > 253 || !d.includes(".")) return "";
  try {
    d = new URL(`http://${d}`).hostname; // punycodes IDN labels
  } catch {
    return "";
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return "";
  return d;
}

function formatPrice(cents: number, currency?: string): string {
  const amount = (cents / 100).toFixed(2);
  return currency ? `${amount} ${currency.toUpperCase()}` : `$${amount}`;
}

/** Lenient registrant-email check (WS4-F6): one @, a dotted domain, no spaces. */
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Whether a record belongs to the email-setup group (the email-full template):
 * mail routing (MX), sender authorization (SPF), the DKIM selector CNAME, or the
 * DMARC policy TXT. Records the control-plane tags with purpose "email" always
 * qualify; otherwise the record shapes the template emits are recognized.
 */
function isEmailRecord(r: DnsRecord): boolean {
  if (r.purpose === "email") return true;
  const type = (r.type || "").toUpperCase();
  if (type === "MX" || type === "SPFM") return true;
  const host = (r.host || "").toLowerCase();
  if (/(^|\.)_dmarc(\.|$)/.test(host)) return true;
  if (/(^|\.)_domainkey(\.|$)/.test(host)) return true;
  if (type === "TXT" && /(^|[;\s])v=spf1(\s|$)/i.test(r.value || "")) return true;
  return false;
}

/** The connected domain rendered as the visual anchor of the moment. */
function domainHero(domain: string, opts?: { quiet?: boolean; live?: boolean; liveLabel?: string }): string {
  const cls = opts?.quiet ? "domain-hero quiet" : "domain-hero";
  const live = opts?.live ? `<span class="live-row"><span class="pulse"></span>${escT(opts.liveLabel || "Live")}</span><br/>` : "";
  return `<span class="${cls}">${escT(domain)}</span><br/>${live}`;
}
function escT(v: string): string {
  return String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Animated success mark: ring pops, check draws in (overridable via the success slot). */
function doneMark(): string {
  const mark = `<svg class="done-mark" viewBox="0 0 64 64">
      <circle class="done-ring" cx="32" cy="32" r="29"/>
      <path class="done-tick" d="M21.5 33.5l7.2 7.2L43 26.5"/>
    </svg>`;
  return `<div class="done-wrap" aria-hidden="true">${slotIcon("success", mark)}</div>`;
}

/** Small filled-circle check for completed checklist steps. */
function tickCircle(): string {
  return `<span class="tick-circle"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5l2.4 2.4L9.5 4"/></svg></span>`;
}

/**
 * Built-in default marks for the overridable icon slots (WS7-F6). Each renders
 * at its natural site through slotIcon(slot, …), so a whiteLabel.icons override
 * replaces it exactly like close/error/success.
 */
const ICON_DEFAULTS: Record<"domain" | "dns" | "manual" | "share" | "back", string> = {
  domain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.5 2.4 15.5 0 18M12 3c-2.4 2.5-2.4 15.5 0 18"/></svg>`,
  dns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>`,
  manual: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.6 6.7a3.6 3.6 0 0 0 4.6 4.6l-8 8a2.1 2.1 0 0 1-3-3l8-8z"/><path d="M15 4.5l4.5 4.5"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.4 13.3l7.2 4.4M15.6 6.3l-7.2 4.4"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
};

/** The loading spinner, rendered through the overridable "loading" icon slot. */
function loadingSlot(): string {
  return `<span class="load-ico">${slotIcon("loading", `<div class="spinner" role="status"></div>`)}</span>`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Current OS dark-mode preference (used only for whiteLabel.darkMode:"auto"). */
function prefersDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}
