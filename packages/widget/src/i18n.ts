/**
 * Runtime i18n (spec §1.8): flat key→string bundles per locale, {VAR}
 * substitution, en fallback. Locale selection follows the incumbent's config `locale`
 * key with pt→pt-br aliasing. Bundles for the non-English locales live in
 * locales.ts to keep this module readable.
 */

export type Strings = Record<string, string>;

/** English is the source-of-truth bundle; every other locale falls back to it. */
export const EN: Strings = {
  // chrome
  "footer.powered": "Powered by Customdomain",
  "footer.tos": "By continuing you agree to the Terms of Service.",
  "a11y.dialog": "Connect your domain",
  "a11y.close": "Close",
  "action.cancel": "Cancel",
  "action.back": "Back",
  "action.continue": "Continue",
  "action.done": "Done",
  "action.retry": "Try again",
  "action.close": "Close",
  // exit confirm
  "exit.title": "Leave domain setup?",
  "exit.body": "Your domain isn't connected yet. If you leave now, you can come back and finish later.",
  "exit.stay": "Keep setting up",
  "exit.leave": "Leave",
  // ENTER_DOMAIN
  "enter.title": "Connect your domain",
  "enter.title.app": "Connect your domain to {APP}",
  "enter.body": "Enter the domain you want to connect.",
  "enter.label": "Domain",
  "enter.placeholder": "yourdomain.com",
  "enter.subdomain.toggle": "Use a subdomain",
  "enter.subdomain.label": "Subdomain",
  "enter.subdomain.placeholder": "app",
  "enter.subdomain.required": "A subdomain is required. Enter one to continue.",
  "enter.invalid": "That doesn't look like a valid domain. Check for typos and try again.",
  // DOMAIN_ANALYSIS
  "analysis.title": "Checking {DOMAIN}…",
  "analysis.step.dns": "Looking up your DNS",
  "analysis.step.provider": "Identifying your provider",
  "analysis.step.records": "Preparing your records",
  // LOGIN (OAuth authorize)
  "login.title": "Connect {DOMAIN}",
  "login.body": "Your domain is managed at {PROVIDER}. Authorize once and we'll add the DNS records for you — no copy-paste.",
  "login.permission": "We only get one-time permission to update DNS records.",
  "login.cta": "Authorize with {PROVIDER}",
  "login.waiting": "Finish signing in to {PROVIDER} in the popup…",
  "login.manual": "Set up manually instead",
  "login.dc.cta": "Continue at {PROVIDER}",
  "login.dc.body": "{PROVIDER} supports one-click setup. We'll send you to {PROVIDER} to approve the changes, then bring you back.",
  // LOGIN_2FA (Mode D branch, gated)
  "twofa.title": "Enter your verification code",
  "twofa.body": "Your provider asked for a second factor. Enter the code from your authenticator app, SMS, or email.",
  "twofa.label": "Verification code",
  // EXISTING_RECORDS
  "existing.title": "Existing records found",
  "existing.provider_generic": "This provider",
  "existing.label": "Conflicting records",
  "existing.current": "Currently",
  "existing.desired": "New",
  "existing.body": "The records below on {DOMAIN} conflict with the new setup — continuing will replace them.",
  "existing.confirm": "Replace and continue",
  "existing.fallback.body": "{PROVIDER} switches to manual setup when more than {LIMIT} records conflict. Delete the conflicting records below at your provider and start over, or continue with manual setup now.",
  "existing.fallback.confirm": "Continue with manual setup",
  // DOMAIN_SETUP
  "setup.title": "Setting up {DOMAIN}",
  "setup.step.write": "Adding your DNS records",
  "setup.step.confirm": "Confirming the changes",
  "setup.step.propagate": "Waiting for DNS to update",
  "setup.hint": "This usually takes up to 60 seconds. Keep this window open.",
  // IN_PROGRESS (propagation)
  "progress.title": "Verifying {DOMAIN}",
  "progress.looking": "Looking for your DNS records…",
  "progress.found": "Records found — waiting for DNS to propagate…",
  "progress.hint": "Keep this open — this can take a few minutes while DNS updates.",
  // MANUAL_CONFIGURATION
  "manual.title": "Add these DNS records",
  "manual.body": "Add the records below at your DNS provider for {DOMAIN}, then verify. Changes can take a few minutes to propagate.",
  "manual.copy": "Copy",
  "manual.copied": "Copied",
  "manual.verify": "I've added them — verify",
  "manual.guide": "Open the step-by-step guide for {PROVIDER}",
  "manual.progress": "{DONE} of {TOTAL} records detected",
  "manual.record.type": "Type",
  "manual.record.name": "Name",
  "manual.record.value": "Value",
  "manual.record.priority": "Priority",
  "manual.record.ttl": "TTL",
  "manual.record.detected": "Detected",
  "manual.record.waiting": "Waiting",
  "manual.record.apexHint": "Add this at your domain's root. If your DNS host has no ALIAS type, use ANAME or a root CNAME (some hosts call it “CNAME flattening”).",
  "manual.share": "Email these instructions to someone else",
  "manual.controlPanel": "Open my DNS control panel",
  // PROVIDER_MANUAL_SELECTION
  "providers.title": "Where is your domain managed?",
  "providers.body": "We couldn't identify your DNS provider automatically. Pick it below to get the right instructions.",
  "providers.search": "Search providers",
  "providers.other": "My provider isn't listed",
  // UNSUPPORTED (collapses into PROVIDER_MANUAL_SELECTION status)
  "unsupported.title": "We don't support {PROVIDER} yet",
  "unsupported.body": "You can still connect your domain with the manual steps — or tell your provider you'd like one-click setup.",
  "unsupported.cta": "Continue with manual setup",
  // DKIM_SETUP
  "dkim.title": "Set up email authentication",
  "dkim.body": "Add these records to enable DKIM signing for {DOMAIN}. Your email provider uses them to prove your mail is genuine.",
  "dkim.continue": "Continue to domain records",
  // EMAIL_SETUP (collapses onto the DKIM_SETUP public status)
  "email.title": "Set up email for your domain",
  "email.body": "Add these records to route and authenticate email for {DOMAIN} — inbound mail, sender authorization, and signing are set up together.",
  "email.continue": "Continue to domain records",
  // EXIT_WITH_ERROR
  "error.title": "Something went wrong",
  "error.body.generic": "Please try again.",
  "error.body.timeout": "Your DNS records weren't detected in time. Double-check them and try again.",
  "error.body.session": "Your session expired. Close the window and start again.",
  "error.body.popup": "Your browser blocked the sign-in window. Allow popups and try again, or use manual setup.",
  "error.body.init": "The widget couldn't start. Close it and try again — if this keeps happening, the embed may be misconfigured.",
  "error.body.nameservers": "This domain's nameservers are missing or unusable. Fix its NS records at your registrar, or use manual setup.",
  "error.body.providerAuth": "Your DNS provider rejected the authorization. Try again, or use manual setup.",
  "error.body.planLimit": "You've reached your plan's domain-connection limit. Upgrade your plan to connect more domains.",
  // FINISHED
  "done.title": "Connected!",
  "done.body": "{DOMAIN} is connected and live. It can take up to 48 hours for the change to reach every network worldwide.",
  "done.manual.title": "Records verified",
  "done.manual.body": "{DOMAIN} is set up. It can take up to 48 hours for DNS changes to reach every network worldwide.",
  "done.shared.title": "Instructions sent",
  "done.shared.body": "We opened your email app with the setup instructions for {DOMAIN}. Setup finishes when the records are added.",
  // purchase (Sell)
  "buy.title": "Find your domain",
  "buy.search": "Search for a domain",
  "buy.searching": "Searching…",
  "buy.unavailable": "{DOMAIN} isn't available.",
  "buy.price": "{PRICE} for the first year",
  "buy.cta": "Buy {DOMAIN}",
  "buy.disabled": "Purchases aren't enabled for this app.",
  // purchase checkout (WS4-F6)
  "buy.checkout.email": "Your email",
  "buy.checkout.pay": "Continue to payment",
  "buy.checkout.starting": "Starting checkout…",
  "buy.checkout.invalidEmail": "Enter a valid email so we can send your registration details.",
  "buy.checkout.pending": "Your purchase of {DOMAIN} has started. Complete payment in the secure window to finish — {DOMAIN} connects automatically once it clears.",
  // notices
  "notice.oauth.declined": "Authorization didn't complete. You can add the records manually instead.",
  "notice.oauth.unavailable": "Automatic setup isn't available right now — add the records manually instead.",
  "notice.popup.blocked": "Your browser blocked the setup window. Open your DNS control panel to finish, or add the records below manually.",
};

import { LOCALES } from "./locales";

let current: Strings = EN;
let currentLocale = "en";

/**
 * Tenant copy overrides (whiteLabel.customCopy): { [locale | "*"]: { key: value } }.
 * "*" applies to every locale; a locale-specific bucket wins over it.
 */
export type CustomCopy = Record<string, Strings>;
let customCopy: CustomCopy = {};
let customCopyLocale = "en"; // full requested code, e.g. "es-mx"
let customCopyBase = "en"; // base language, e.g. "es"

/**
 * Set the active locale (incumbent-compatible codes; pt aliases to pt-br). A
 * region variant with no exact bundle (e.g. "es-MX") resolves to its base
 * bundle AND reports the base as the current locale, so customCopy["es"] and the
 * base translations both apply instead of silently collapsing to English.
 */
export function setLocale(locale?: string): string {
  let code = (locale || "en").toLowerCase();
  if (code === "pt") code = "pt-br";
  if (LOCALES[code]) {
    current = LOCALES[code];
    currentLocale = code;
  } else if (code.includes("-") && LOCALES[code.split("-")[0]]) {
    const base = code.split("-")[0];
    current = LOCALES[base];
    currentLocale = base; // align to the base so region variants resolve to it
  } else {
    current = EN;
    currentLocale = "en";
  }
  return currentLocale;
}

/**
 * Install per-locale copy overrides. `loc` is the integrator's requested locale
 * (region variant included). t() reads the exact-region bucket first, then the
 * base-language bucket, then the "*" cross-locale bucket — so customCopy["es"]
 * applies to an "es-MX" session (WS7-F8).
 */
export function setCustomCopy(copy?: CustomCopy, loc?: string): void {
  customCopy = copy || {};
  let code = (loc || currentLocale || "en").toLowerCase();
  if (code === "pt") code = "pt-br";
  customCopyLocale = code;
  customCopyBase = code.includes("-") ? code.split("-")[0] : code;
}

export function locale(): string {
  return currentLocale;
}

/**
 * Translate `key` with {VAR} substitution. Lookup order:
 * customCopy[region] → customCopy[base] → customCopy["*"] → active locale →
 * English → the key.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s =
    customCopy[customCopyLocale]?.[key] ??
    customCopy[customCopyBase]?.[key] ??
    customCopy["*"]?.[key] ??
    current[key] ??
    EN[key] ??
    key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
