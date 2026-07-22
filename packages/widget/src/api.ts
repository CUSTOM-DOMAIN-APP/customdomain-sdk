/**
 * Typed control-plane client for the widget. All calls are bearer-authorized
 * with the short-lived widget JWT handed over at init. Errors are normalized
 * into {code, message} pairs the state machine maps onto the error catalog.
 */
import type { CheckInfo, Connection, DnsRecord } from "./types";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class Api {
  constructor(
    private base: string,
    private token: string
  ) {}

  origin(): string {
    return new URL(this.base).origin;
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", authorization: `Bearer ${this.token}` };
  }

  private async reqEx<T>(method: string, path: string, body?: unknown): Promise<{ data: T; status: number }> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiError(0, "NetworkError", err instanceof Error ? err.message : "network failure");
    }
    if (res.status === 429) throw new ApiError(429, "RateLimitError", "Too many requests");
    if (res.status === 401) throw new ApiError(401, "SessionError", "Session expired");
    if (!res.ok) {
      let code = `http_${res.status}`;
      let msg = res.statusText;
      try {
        const b = await res.json();
        code = b.code || code;
        msg = b.details || b.title || msg;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, code, msg);
    }
    return { data: (await res.json()) as T, status: res.status };
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await this.reqEx<T>(method, path, body)).data;
  }

  checkDomain(domain: string): Promise<CheckInfo> {
    return this.req<CheckInfo>("POST", "/v1/domains:check", { domain });
  }

  /**
   * Create (or resume) a connection. The control-plane answers 201 for a freshly
   * created connection and 200 when it returns an existing one for the same
   * domain — the resume signal (WS5-7). `resumed` mirrors that so the widget can
   * present an already-live domain as "already connected" rather than firing a
   * fresh success.
   *
   * `endUserRef` (WS6-F3, Side B): the integrator's OWN id for the end user this
   * widget-origin connect is attributed to. When present it is sent as the
   * control-plane's `end_user_ref` field so the console can render "Connected
   * by …" and customer search instead of a bare "Direct". Omitted when unset, so
   * the request body is unchanged (just `{domain}`) for integrators that don't
   * pass it.
   */
  async createConnection(domain: string, endUserRef?: string): Promise<{ connection: Connection; resumed: boolean }> {
    const ref = endUserRef?.trim();
    const body = ref ? { domain, end_user_ref: ref } : { domain };
    const { data, status } = await this.reqEx<Connection>("POST", "/v1/connections", body);
    return { connection: data, resumed: status === 200 };
  }

  getConnection(id: string): Promise<Connection> {
    return this.req<Connection>("GET", `/v1/connections/${encodeURIComponent(id)}`);
  }

  oauthStart(connectionID: string, provider: string, returnOrigin: string): Promise<{ authorize_url: string }> {
    return this.req("POST", `/v1/connections/${encodeURIComponent(connectionID)}/oauth:start`, {
      provider,
      return_origin: returnOrigin,
    });
  }

  domainConnectStart(
    connectionID: string,
    body: {
      service_id?: string;
      host?: string;
      vars?: Record<string, string>;
      /**
       * WS3-F3: opt this connection into the durable Domain Connect ASYNC (managed)
       * rail. When the tenant enables it and the provider advertises async, the
       * control plane holds an encrypted grant and applies the template server-side,
       * so the tenant keeps ongoing authority over the end-user's DNS (a
       * widget-connected domain is no longer a one-shot). Absent async support the
       * control plane transparently falls back to the sync redirect.
       */
      managed?: boolean;
      /** Vetted web origin the async finish page postMessages the outcome to. */
      return_origin?: string;
    }
  ): Promise<{
    /** Sync redirect: the provider-hosted apply URL to redirect/popup the user to. */
    apply_url?: string;
    /** Async (managed) rail: the provider consent URL to popup the user to instead. */
    consent_url?: string;
    dc_provider?: string;
    /** Discovery-provided popup size for the provider's apply UX (px). */
    width?: number;
    height?: number;
    /** Deep-link to the provider's DNS control panel (settingsUrl / urlControlPanel). */
    url_control_panel?: string;
    /** Domain Connect rail the provider was resolved on ("sync" | "async"). */
    rail?: string;
  }> {
    return this.req("POST", `/v1/connections/${encodeURIComponent(connectionID)}/domainconnect:start`, body);
  }

  /**
   * WS4-F5: mint a REAL, resumable share link for the connect flow via
   * POST /v1/sharing/connect. The control plane stores the prefill (branding +
   * target domain) server-side under an opaque token and returns {link, job_id};
   * the widget delivers that link (e.g. by email) so whoever controls DNS can
   * resume the exact flow — replacing the old mailto-with-raw-records dead end
   * that created nothing resumable.
   */
  createSharedFlow(body: {
    domain?: string;
    domains?: string[];
    prefill?: Record<string, unknown>;
  }): Promise<{ link: string; job_id: string }> {
    return this.req("POST", "/v1/sharing/connect", body);
  }

  listProviders(): Promise<{ providers: Array<{ id: string; rail: string; sharing: boolean }> }> {
    return this.req("GET", "/v1/providers");
  }

  records(connectionID: string): Promise<{ records: DnsRecord[] }> {
    return this.req("GET", `/v1/connections/${encodeURIComponent(connectionID)}/records`);
  }

  /**
   * Fire-and-forget, PII-free funnel beacon: which in-modal step the user
   * reached. Uses keepalive so it survives an unload, never throws, never
   * blocks the flow, and carries only bounded step/outcome labels (no domain).
   */
  telemetry(step: string, outcome: string): void {
    try {
      void fetch(`${this.base}/v1/telemetry:connect`, {
        method: "POST",
        keepalive: true,
        headers: this.headers(),
        body: JSON.stringify({ step, outcome }),
      }).catch(() => {});
    } catch {
      /* never let telemetry affect the flow */
    }
  }

  registrarSearch(
    q: string,
    opts?: { searchType?: string }
  ): Promise<{ results?: Array<{ domain: string; available: boolean; price_cents?: number; currency?: string }> }> {
    const st = opts?.searchType ? `&searchType=${encodeURIComponent(opts.searchType)}` : "";
    return this.req("GET", `/v1/registrar/search?q=${encodeURIComponent(q)}${st}`);
  }

  /**
   * WS4-F6: initiate a domain PURCHASE on the Sell rail. The control-plane
   * (POST /v1/registrar/checkout) quotes the domain at the retail price, records
   * a durable order (StateQuoted) BEFORE the buyer can pay, and returns a Stripe
   * checkout session. Because `return_url` is supplied, that session is EMBEDDED
   * (it carries a `client_secret` the host mounts with Stripe.js) — the card is
   * only authorized here; the charge is captured server-side after the registrar
   * actually registers the domain, so a failed registration never costs the
   * buyer. The subsequent POST /v1/registrar/fulfill (host-side, after payment)
   * finalizes and auto-connects the domain.
   *
   * The widget only INITIATES this (creates the order + gets the session). It
   * cannot collect the card itself: Stripe Embedded Checkout needs Stripe.js,
   * which the widget's self-contained/CSP-locked iframe can't load — so the
   * payment mount + fulfill are handed off to the host (see app.ts buyCheckout).
   */
  checkoutDomain(body: {
    domain: string;
    buyer: { name?: string; email: string; country?: string };
    return_url: string;
  }): Promise<{ id?: string; client_secret?: string; url?: string }> {
    return this.req("POST", "/v1/registrar/checkout", body);
  }
}
