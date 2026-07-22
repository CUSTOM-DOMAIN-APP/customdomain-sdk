/**
 * Customdomain widget — the iframe-hosted end-user modal (entry point).
 *
 * Runs at app.customdomain.ai/widget inside the SDK's iframe. This file owns
 * the postMessage boundary; everything else lives in the state machine
 * (app.ts). Message security:
 *   - the host origin is pinned from the first trusted init message; later
 *     inbound host messages must match it;
 *   - OAuth outcome messages must come from the control-plane's origin;
 *   - replies always target the pinned host origin, never "*" (after init).
 */
import { WidgetApp } from "./app";
import type { InitPayload, OAuthResult } from "./types";

const API_BASE =
  (window as unknown as { CUSTOMDOMAIN_API_BASE?: string }).CUSTOMDOMAIN_API_BASE || "https://api.customdomain.ai";

// How long the widget waits for the SDK's customdomain:init after posting
// ready. A healthy handshake completes in milliseconds; past this the embed is
// broken (SDK crashed pre-init, host navigated, or /widget opened bare) and the
// intro spinner must give way to a closable error instead of hanging forever.
const INIT_TIMEOUT_MS = 12_000;

class Boundary {
  private hostOrigin = "*";
  private app: WidgetApp;
  private initialized = false;

  constructor(host: HTMLElement) {
    this.app = new WidgetApp(host, (type, payload) => this.post(type, payload));
    window.addEventListener("message", (e) => this.onMessage(e));
    this.post("customdomain:ready");
    setTimeout(() => {
      if (!this.initialized) this.app.initTimedOut();
    }, INIT_TIMEOUT_MS);
  }

  private post(type: string, payload?: unknown) {
    window.parent.postMessage({ type, payload }, this.hostOrigin);
  }

  private onMessage(e: MessageEvent) {
    const { type, payload } = e.data || {};
    if (type === "customdomain:oauth") {
      // Outcome of the provider-authorization popup, posted by the
      // control-plane's callback page. Only the API origin may report it.
      if (e.origin !== new URL(API_BASE).origin) return;
      this.app.onOAuthResult(payload as OAuthResult);
      return;
    }
    if (type !== "customdomain:init") return;
    // Trust the origin of the init message and pin all replies to it. The SDK
    // always targets our exact widget origin, so a same-origin check here plus
    // the pinned reply target keeps this origin-checked end to end.
    if (this.hostOrigin === "*") this.hostOrigin = e.origin;
    else if (e.origin !== this.hostOrigin) return; // reject spoofed re-inits
    if (this.initialized) return; // one init per mount
    this.initialized = true;
    this.app.init(payload as InitPayload, API_BASE);
  }
}

const mount =
  document.getElementById("customdomain-widget") || document.body.appendChild(document.createElement("div"));
new Boundary(mount as HTMLElement);
