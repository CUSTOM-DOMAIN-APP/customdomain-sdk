/**
 * White-label theming (spec §1.8): every visual decision in the widget reads a
 * CSS custom property from this token surface, so a tenant restyles the whole
 * flow by overriding tokens — no CSS surgery. The token set mirrors incumbent's
 * whiteLabel config (colors/fonts/spacing/behavior) and is applied per-mount
 * onto the widget's Shadow-DOM host.
 */

/** The full token surface with defaults ("facelift" look). */
export const TOKENS: Record<string, string> = {
  // ---- color: brand ----
  "color-primary": "#1c1917",
  "color-primary-hover": "#292524",
  "color-primary-contrast": "#ffffff",
  "color-accent": "#a8a29e",
  // ---- color: surfaces ----
  "color-backdrop": "rgba(28,25,23,.55)",
  "color-surface": "#ffffff",
  "color-surface-raised": "#fafaf9",
  "color-surface-sunken": "#f5f5f4",
  "color-border": "#e7e5e4",
  "color-border-strong": "#d6d3d1",
  "color-divider": "#f5f5f4",
  // ---- color: text ----
  "color-text": "#1c1917",
  "color-text-secondary": "#57534e",
  "color-text-muted": "#79716b",
  // Link-styled affordances (button.link). Muted by default to match the calm
  // design; the quick-keys (resolveTokens) repoint it at the brand colour when a
  // tenant supplies colors.primary, so branded links come for free.
  "color-link": "#79716b",
  // ---- color: feedback ----
  "color-success": "#16a34a",
  "color-success-bg": "#f0fdf4",
  "color-error": "#dc2626",
  "color-error-bg": "#fef2f2",
  "color-warning": "#b45309",
  "color-warning-bg": "#fef9c3",
  "color-warning-border": "#fde047",
  "color-info-bg": "#f0f9ff",
  "color-focus-ring": "#1c1917",
  // ---- typography ----
  "font-family": "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  "font-family-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "font-size-xs": "11px",
  "font-size-sm": "13px",
  "font-size-base": "14px",
  "font-size-md": "15px",
  "font-size-h2": "20px",
  "font-weight-normal": "400",
  "font-weight-medium": "500",
  "font-weight-semibold": "600",
  "font-weight-bold": "700",
  "line-height": "1.5",
  // ---- spacing ----
  "space-2xs": "4px",
  "space-xs": "6px",
  "space-sm": "10px",
  "space-md": "14px",
  "space-lg": "18px",
  "space-xl": "24px",
  // ---- radii ----
  "radius-sm": "8px",
  "radius-md": "12px",
  "radius-lg": "20px",
  "radius-pill": "999px",
  // ---- elevation ----
  "shadow-modal": "0 1px 2px rgba(28,25,23,.05), 0 8px 24px rgba(28,25,23,.10), 0 32px 80px rgba(28,25,23,.22)",
  "shadow-raised": "0 1px 2px rgba(9,12,20,.05), 0 4px 12px rgba(9,12,20,.06)",
  // ---- modal geometry (taller than wide) ----
  "modal-min-height": "520px",
  "modal-width": "420px",
  "modal-max-height": "92vh",
  "modal-padding": "32px",
  "modal-radius": "20px",
  "modal-mobile-radius": "20px 20px 0 0",
  // ---- buttons ----
  "button-radius": "12px",
  "button-padding": "13px 18px",
  "button-font-size": "15px",
  "button-font-weight": "600",
  "button-secondary-bg": "#ffffff",
  "button-secondary-color": "#44403c",
  "button-secondary-border": "#d6d3d1",
  // ---- inputs ----
  "input-radius": "12px",
  "input-padding": "13px 15px",
  "input-font-size": "15px",
  "input-border": "#d6d3d1",
  "input-bg": "#ffffff",
  "input-placeholder": "#a8a29e",
  // ---- record cards / tables ----
  "record-bg": "#fafaf9",
  "record-border": "#e7e5e4",
  "record-radius": "14px",
  "record-mono-size": "13px",
  // ---- progress / analysis ----
  "spinner-size": "22px",
  "spinner-track": "#e7e5e4",
  "checklist-icon-size": "28px",
  "provider-icon-size": "40px",
  // ---- motion ----
  "motion-duration": "0.35s",
  "motion-ease": "cubic-bezier(.4,0,.2,1)",
  "motion-slide-distance": "24px",
  // ---- depth extras ----
  "backdrop-blur": "10px",
  "shadow-button": "0 1px 2px rgba(9,12,20,.18)",
  "shadow-button-hover": "0 2px 8px rgba(9,12,20,.22)",
  // ---- brand chrome ----
  "logo-url": "",
  "logo-height": "26px",
  "footer-display": "block", // set to "none" to hide the powered-by footer
  "confetti-display": "block", // set to "none" to disable confetti
};

/**
 * Dark-mode overlay: only the tokens that differ from the light defaults. Merged
 * over TOKENS when dark mode is active (whiteLabel.darkMode). Tenant color/font
 * overrides still apply on top, and whiteLabel.darkTokens can fine-tune the
 * dark surface specifically.
 */
export const DARK_TOKENS: Record<string, string> = {
  "color-primary": "#fafaf9",
  "color-primary-hover": "#e7e5e4",
  "color-primary-contrast": "#1c1917",
  "color-accent": "#78716c",
  "color-backdrop": "rgba(0,0,0,.65)",
  "color-surface": "#1c1917",
  "color-surface-raised": "#292524",
  "color-surface-sunken": "#0c0a09",
  "color-border": "#44403c",
  "color-border-strong": "#57534e",
  "color-divider": "#292524",
  "color-text": "#fafaf9",
  "color-text-secondary": "#d6d3d1",
  "color-text-muted": "#a8a29e",
  "color-link": "#a8a29e",
  "color-success": "#22c55e",
  "color-success-bg": "#14261a",
  "color-error": "#f87171",
  "color-error-bg": "#2a1414",
  "color-warning": "#f59e0b",
  "color-warning-bg": "#2a2410",
  "color-warning-border": "#4d4212",
  "color-info-bg": "#0c2230",
  "color-focus-ring": "#fafaf9",
  "button-secondary-bg": "#292524",
  "button-secondary-color": "#e7e5e4",
  "button-secondary-border": "#57534e",
  "input-border": "#57534e",
  "input-bg": "#292524",
  "input-placeholder": "#78716c",
  "record-bg": "#292524",
  "record-border": "#44403c",
  "spinner-track": "#44403c",
};

import type { CustomCopy } from "./i18n";
import type { IconSlot } from "./icons";

/** Structured Google Font request (whiteLabel.googleFont). */
export interface GoogleFont {
  family: string;
  weights?: Array<number | string>;
  display?: string;
}

/**
 * Granular UI toggles (incumbent customProperties parity). Each hides/tweaks an
 * optional affordance without touching the token surface.
 */
export interface CustomProperties {
  /** Hide the modal's close (X) button. */
  hideCloseButton?: boolean;
  /** Hide the animated checklist stepper (reinterpretation of the progress bar). */
  hideProgressIndicator?: boolean;
  /** Host owns exit confirmation: post request-close instead of the built-in overlay. */
  useCustomExitConfirmation?: boolean;
  /** Show a Terms-of-Service line in the footer. */
  showEntriToS?: boolean;
  /** Login screen: hide the "set up manually / change provider" escape. */
  providerLogin?: { changeProvider?: { hide?: boolean } };
  /** Manual screen: hide the DNS records preview. */
  recordsPreview?: { hide?: boolean };
  /** Manual screen: the "forward to a colleague" link. */
  forwardLink?: { hide?: boolean; url?: string; label?: string };
  /** Provider-list screen: hide the "go to manual setup" link. */
  gotoManualLink?: { hide?: boolean };
}

/**
 * WhiteLabelConfig is the tenant-facing theming input (EntriConfig.whiteLabel-
 * compatible superset): quick keys map onto tokens; `tokens` overrides any raw
 * token; `screens.disable` hides optional screens (customProperties parity).
 */
export interface WhiteLabelConfig {
  colors?: {
    primary?: string;
    primaryHover?: string;
    background?: string;
    text?: string;
    success?: string;
    error?: string;
    [k: string]: string | undefined;
  };
  font?: string;
  fontUrl?: string; // note: external fonts require the host CSP to allow them
  borderRadius?: string;
  logo?: string;
  hideLogo?: boolean;
  hideConfetti?: boolean;
  /** Raw token overrides — full ~90-token surface. */
  tokens?: Record<string, string>;
  /** customProperties parity: per-screen disables. */
  screens?: { disable?: string[] };
  /**
   * Delegate closing to the host (incumbent onEntriRequestClose semantics): the
   * widget never tears itself down; it posts a request-close message and the
   * host decides (must call close()).
   */
  delegateClose?: boolean;
  /**
   * Embedded mode: render as a flat, full-bleed panel inside the host's
   * container instead of a fullscreen modal (incumbent embeddedMode).
   */
  embedded?: boolean;
  /** Per-screen/per-locale copy overrides (see i18n.setCustomCopy). */
  customCopy?: CustomCopy;
  /** Icon slot overrides (https:/data:image URL or inline SVG), keyed by slot. */
  icons?: Partial<Record<IconSlot, string>>;
  /** Dark theme mode: "disabled" (default) | "enabled" | "auto" (follows the OS). */
  darkMode?: "disabled" | "enabled" | "auto";
  /** Raw token overrides applied only when dark mode is active. */
  darkTokens?: Record<string, string>;
  /** Load a Google Font into the widget iframe and use it as the base family. */
  googleFont?: GoogleFont;
  /** Granular UI toggles (incumbent customProperties parity). */
  customProperties?: CustomProperties;
}

/**
 * Resolve a WhiteLabelConfig (plus legacy {accent} themes) into token values.
 * `prefersDark` (the OS preference) is consulted only for darkMode:"auto".
 */
export function resolveTokens(
  wl?: WhiteLabelConfig,
  legacy?: Record<string, string>,
  prefersDark?: boolean
): Record<string, string> {
  const mode = wl?.darkMode || "disabled";
  const isDark = mode === "enabled" || (mode === "auto" && !!prefersDark);
  const out: Record<string, string> = { ...TOKENS, ...(isDark ? DARK_TOKENS : {}) };
  if (legacy?.accent) {
    out["color-primary"] = legacy.accent;
    out["color-primary-hover"] = legacy.accent;
    out["color-link"] = legacy.accent;
  }
  if (wl?.colors) {
    const c = wl.colors;
    if (c.primary) {
      out["color-primary"] = c.primary;
      out["color-link"] = c.primary;
      out["color-primary-hover"] = c.primaryHover || c.primary;
    }
    if (c.background) out["color-surface"] = c.background;
    if (c.text) out["color-text"] = c.text;
    if (c.success) out["color-success"] = c.success;
    if (c.error) out["color-error"] = c.error;
  }
  if (wl?.font) out["font-family"] = wl.font;
  else if (wl?.googleFont?.family) out["font-family"] = `'${wl.googleFont.family}', ${out["font-family"]}`;
  if (wl?.borderRadius) {
    out["radius-md"] = wl.borderRadius;
    out["button-radius"] = wl.borderRadius;
    out["input-radius"] = wl.borderRadius;
    // The Settings corner-radius preview implies the modal corners follow too
    // (WS7-F7): carry the override onto the modal radius so preview == reality.
    out["modal-radius"] = wl.borderRadius;
  }
  if (wl?.logo) out["logo-url"] = wl.logo;
  if (wl?.hideLogo) out["footer-display"] = "none";
  if (wl?.hideConfetti) out["confetti-display"] = "none";
  for (const [k, v] of Object.entries(wl?.tokens || {})) {
    if (k in out && typeof v === "string") out[k] = v;
  }
  if (isDark) {
    for (const [k, v] of Object.entries(wl?.darkTokens || {})) {
      if (k in out && typeof v === "string") out[k] = v;
    }
  }
  return out;
}

/**
 * Inject a Google Fonts <link> into the widget's own iframe document so the
 * requested family is available to the Shadow-DOM content (@font-face declared
 * at document level crosses the shadow boundary). Idempotent per family. Subject
 * to the widget page's own CSP (fonts.googleapis.com / fonts.gstatic.com).
 */
export function loadGoogleFont(font?: GoogleFont, doc: Document = typeof document !== "undefined" ? document : (undefined as unknown as Document)): void {
  if (!font?.family || !doc) return;
  const family = font.family.trim();
  if (!/^[\w .-]+$/.test(family)) return; // family names only; no URL/CSS injection
  const weights = (font.weights && font.weights.length ? font.weights : [400, 600, 700]).join(";");
  const display = /^[a-z-]+$/i.test(font.display || "") ? font.display : "swap";
  const id = `je-gfont-${family.replace(/\W+/g, "-").toLowerCase()}`;
  if (doc.getElementById(id)) return;
  const href =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}` +
    `:wght@${weights}&display=${display}`;
  const link = doc.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  (doc.head || doc.documentElement).appendChild(link);
}

/**
 * Load a tenant-supplied stylesheet URL (whiteLabel.fontUrl) into the widget's
 * iframe document so any @font-face it declares is available to the Shadow-DOM
 * content — the same mechanism as loadGoogleFont, but for a self-hosted or
 * third-party font CSS. https-only and idempotent per URL. The family itself is
 * still selected via whiteLabel.font. Subject to the widget page's own CSP.
 */
export function loadFontUrl(url?: string, doc: Document = typeof document !== "undefined" ? document : (undefined as unknown as Document)): void {
  if (!url || !doc) return;
  const href = url.trim();
  if (!/^https:\/\//i.test(href)) return; // only https stylesheet URLs
  let key: string;
  try {
    key = new URL(href).href;
  } catch {
    return;
  }
  const id = `je-fonturl-${hashId(key)}`;
  if (doc.getElementById(id)) return;
  const link = doc.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  (doc.head || doc.documentElement).appendChild(link);
}

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Render tokens as a CSS custom-property block for the shadow host. */
export function tokensToCSS(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([k, v]) => `--je-${k}: ${v};`)
    .join("\n");
}
