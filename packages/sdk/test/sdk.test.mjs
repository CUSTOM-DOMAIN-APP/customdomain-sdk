// Runtime tests for customdomain-js, run against the BUILT bundle (dist/index.js),
// which is what npm ships. `pnpm -r build` first; then `pnpm -r test`.
//
// Node's own test runner and a few lines of DOM stand-in: no jsdom, no browser.
// The stand-in records what open() posts into the widget iframe, and a widget
// message is a MessageEvent dispatched on the stand-in window, from the widget
// origin, exactly as the SDK's origin-checked listener expects.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CustomDomain } from "../dist/index.js";

const WIDGET = "https://widget.test";
let posted;
let events;

function fakeFrame() {
  return {
    style: {},
    attrs: {},
    parentNode: null,
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    contentWindow: {
      postMessage(message, targetOrigin) {
        posted.push({ message, targetOrigin });
      },
    },
  };
}

beforeEach(() => {
  posted = [];
  events = [];
  const win = new EventTarget();
  for (const name of ["customdomain:success", "customdomain:removed"]) {
    win.addEventListener(name, (e) => events.push({ name, detail: e.detail }));
  }
  const body = {
    appendChild(el) {
      el.parentNode = body;
    },
    removeChild(el) {
      el.parentNode = null;
    },
  };
  globalThis.window = win;
  globalThis.document = { body, createElement: () => fakeFrame(), querySelector: () => null };
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.fetch;
});

/** Deliver a message from the widget, as its iframe would. */
function fromWidget(type, payload) {
  window.dispatchEvent(new MessageEvent("message", { data: { type, payload }, origin: WIDGET }));
}

/** The `customdomain:init` the SDK posts once the widget says it is ready. */
function initPayload() {
  fromWidget("customdomain:ready");
  const init = posted.find((p) => p.message.type === "customdomain:init");
  assert.ok(init, "open() posted no customdomain:init");
  assert.equal(init.targetOrigin, WIDGET);
  return init.message.payload;
}

test('open({ mode: "reconnect", connectionId }) hands both to the widget', () => {
  const sdk = new CustomDomain();
  sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET, mode: "reconnect", connectionId: "conn_1" });
  const payload = initPayload();
  assert.equal(payload.config.mode, "reconnect");
  assert.equal(payload.config.connectionId, "conn_1");
  assert.equal(payload.token, "tok");
  sdk.close();
});

test('open({ mode: "reconnect", domain }) works without a connection id: the widget looks the domain up', () => {
  const sdk = new CustomDomain();
  sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET, mode: "reconnect", domain: "acme.com" });
  const payload = initPayload();
  assert.equal(payload.config.mode, "reconnect");
  assert.equal(payload.config.connectionId, undefined);
  assert.equal(payload.domain, "acme.com");
  sdk.close();
});

test("a reconnect's success reaches onSuccess and customdomain:success with reconnected: true", () => {
  const sdk = new CustomDomain();
  const seen = [];
  sdk.open({
    applicationId: "app_1",
    token: "tok",
    widgetBase: WIDGET,
    mode: "reconnect",
    connectionId: "conn_1",
    onSuccess: (r) => seen.push(r),
  });
  // The payload the widget posts at the end of a reconnect (onReconnectResult).
  const detail = {
    jobId: "conn_1",
    domain: "acme.com",
    setupType: "reconnect",
    provider: "godaddy",
    success: true,
    reconnected: true,
  };
  fromWidget("customdomain:success", detail);
  assert.deepEqual(seen, [detail]);
  assert.deepEqual(
    events.filter((e) => e.name === "customdomain:success").map((e) => e.detail),
    [detail]
  );
  sdk.close();
});

test("a message from another origin is ignored", () => {
  const sdk = new CustomDomain();
  const seen = [];
  sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET, mode: "reconnect", onSuccess: (r) => seen.push(r) });
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "customdomain:success", payload: { reconnected: true } },
      origin: "https://elsewhere.test",
    })
  );
  assert.deepEqual(seen, []);
  sdk.close();
});

test('removeDomain() still opens mode "remove", over any mode passed in', () => {
  const sdk = new CustomDomain();
  sdk.removeDomain({ applicationId: "app_1", token: "tok", widgetBase: WIDGET, mode: "reconnect", connectionId: "conn_1" });
  const payload = initPayload();
  assert.equal(payload.config.mode, "remove");
  assert.equal(payload.config.connectionId, "conn_1");
  sdk.close();
});

test("open() without a mode leaves it unset (the widget connects)", () => {
  const sdk = new CustomDomain();
  sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET });
  assert.equal(initPayload().config.mode, undefined);
  sdk.close();
});

test("checkDomain maps advisories and keeps recordConflicts apart", async () => {
  const caa = { kind: "caa-blocks-letsencrypt", host: "@", type: "CAA", existing: '0 issue "digicert.com"', desired: '0 issue "letsencrypt.org"' };
  const clash = { kind: "replace", host: "www", type: "CNAME", existing: "old.example.net", desired: "edge.customdomain.ai" };
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ domain: "acme.com", provider: "cloudflare", setup_type: "automatic", record_conflicts: [clash], advisories: [caa] }),
    };
  };
  const r = await new CustomDomain({ apiBase: "https://api.test" }).checkDomain("acme.com", { token: "tok" });
  assert.equal(requests[0].url, "https://api.test/v1/domains:check");
  assert.deepEqual(r.advisories, [caa]);
  assert.deepEqual(r.recordConflicts, [clash]);
});

test("checkDomain leaves advisories undefined when the control plane does not send it", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ domain: "acme.com", provider: null, setup_type: "manual", record_conflicts: [] }),
  });
  const r = await new CustomDomain({ apiBase: "https://api.test" }).checkDomain("acme.com", { token: "tok" });
  assert.equal(r.advisories, undefined);
  assert.deepEqual(r.recordConflicts, []);
});

test("checkDomain maps the key a secure sign-in makes, the DNS hosting verdict, the kept keys and the second provider", async () => {
  const account = {
    account_id: "pa_1", provider: "namecheap", provider_name: "Namecheap", label: "Namecheap (ops)", how: "secure_sign_in",
    owner_kind: "workspace", scope: "selected", zone: "acme.com", ready: true, status: "active",
    application_id: "app_1", key_name: "customdomain", key_expires_at: "2027-01-01T00:00:00Z", last_used_at: "2026-10-01T00:00:00Z",
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      domain: "acme.com", provider: "namecheap", setup_type: "automatic", record_conflicts: [],
      rails: {
        oauth: { available: false, reason: "provider_has_no_oauth" },
        domain_connect: { available: false, reason: "provider_has_no_domain_connect" },
        api_key: { available: true, caveat: "api_eligibility" },
        manual: { available: true },
        cloud_browser: { available: true, key: { rights: ["account"], ends_in_days: null } },
        nameservers: { verdict: "offered", reason: "application_offers" },
        saved_access: { available: true, accounts: [account] },
      },
      recommended_rail: "saved_access",
      also_provider: { provider: "squarespace", provider_name: "Squarespace", reason: "former_google_domains" },
    }),
  });
  const r = await new CustomDomain({ apiBase: "https://api.test" }).checkDomain("acme.com", { token: "tok" });
  assert.deepEqual(r.rails.cloudBrowser, { available: true, key: { rights: ["account"], endsInDays: null } });
  assert.deepEqual(r.rails.apiKey, { available: true, caveat: "api_eligibility" });
  assert.deepEqual(r.rails.nameservers, { verdict: "offered", reason: "application_offers" });
  assert.equal(r.rails.savedAccess.available, true);
  assert.deepEqual(r.rails.savedAccess.accounts, [{
    accountId: "pa_1", provider: "namecheap", providerName: "Namecheap", label: "Namecheap (ops)", how: "secure_sign_in",
    ownerKind: "workspace", scope: "selected", zone: "acme.com", ready: true, status: "active",
    applicationId: "app_1", keyName: "customdomain", keyExpiresAt: "2027-01-01T00:00:00Z", lastUsedAt: "2026-10-01T00:00:00Z",
  }]);
  assert.equal(r.recommendedRail, "saved_access");
  assert.deepEqual(r.alsoProvider, { provider: "squarespace", providerName: "Squarespace", reason: "former_google_domains" });
});

test("checkDomain leaves the newer rail fields absent when the control plane does not send them", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      domain: "acme.com", provider: "cloudflare", setup_type: "automatic", record_conflicts: [],
      rails: {
        oauth: { available: true, flow: "cloudflare", managed: true },
        domain_connect: { available: false, reason: "provider_has_no_domain_connect" },
        api_key: { available: true },
        manual: { available: true },
      },
      recommended_rail: "oauth",
    }),
  });
  const r = await new CustomDomain({ apiBase: "https://api.test" }).checkDomain("acme.com", { token: "tok" });
  assert.deepEqual(r.rails.oauth, { available: true, flow: "cloudflare", managed: true });
  assert.equal("key" in r.rails.oauth, false);
  assert.equal(r.rails.cloudBrowser, undefined);
  assert.equal(r.rails.nameservers, undefined);
  assert.equal(r.rails.savedAccess, undefined);
  assert.equal(r.alsoProvider, undefined);
  assert.equal(r.recommendedRail, "oauth");
});

// loadSharedFlow() frames a link and then hands the integrator's token to that frame, so the link
// must name the widget's own origin. The tenant hand-off page reads it from its query string
// (`?link=`), which anyone can write.

/** Record every iframe the SDK creates, so a refused link can be shown to have framed nothing. */
function trackFrames() {
  const frames = [];
  document.createElement = () => {
    const f = fakeFrame();
    frames.push(f);
    return f;
  };
  return frames;
}

test("loadSharedFlow frames a link on the widget origin and sends the token only there", () => {
  const frames = trackFrames();
  const sdk = new CustomDomain();
  sdk.loadSharedFlow(`${WIDGET}/share/tok_abc`, { applicationId: "app_1", token: "tok", widgetBase: WIDGET });
  assert.equal(frames.length, 1);
  assert.equal(frames[0].src, `${WIDGET}/share/tok_abc`);
  const payload = initPayload();
  assert.equal(payload.token, "tok");
  sdk.close();
});

test("loadSharedFlow resolves a relative link against the widget origin", () => {
  const frames = trackFrames();
  const sdk = new CustomDomain();
  sdk.loadSharedFlow("/share/tok_abc", { applicationId: "app_1", token: "tok", widgetBase: WIDGET });
  assert.equal(frames[0].src, `${WIDGET}/share/tok_abc`);
  sdk.close();
});

test("loadSharedFlow refuses a link on another origin and never frames it or sends it the token", () => {
  const frames = trackFrames();
  const sdk = new CustomDomain();
  const attacker = "https://evil.test";
  assert.throws(
    () => sdk.loadSharedFlow(`${attacker}/x`, { applicationId: "app_1", token: "tok", widgetBase: WIDGET }),
    (err) => err.name === "CustomDomainError"
  );
  assert.equal(frames.length, 0, "a refused link was framed");
  // Even if that origin posts `ready`, nothing is listening for it.
  window.dispatchEvent(new MessageEvent("message", { data: { type: "customdomain:ready" }, origin: attacker }));
  assert.equal(posted.length, 0, "the token was posted to a refused link");
});

test("loadSharedFlow refuses lookalike origins, a downgrade to http and non-web schemes", () => {
  const frames = trackFrames();
  const sdk = new CustomDomain();
  const cfg = { applicationId: "app_1", token: "tok", widgetBase: WIDGET };
  for (const bad of [
    "https://widget.test.evil.test/share/x",
    "https://widget.test@evil.test/share/x",
    "https://evil.test/https://widget.test/share/x",
    "http://widget.test/share/x",
    "//evil.test/share/x",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "blob:https://widget.test/00000000-0000-0000-0000-000000000000",
  ]) {
    assert.throws(() => sdk.loadSharedFlow(bad, cfg), (err) => err.name === "CustomDomainError", bad);
  }
  assert.equal(frames.length, 0);
});

test("loadSharedFlow refuses a missing link or one that is not a URL with InvalidLinkError", () => {
  const frames = trackFrames();
  const sdk = new CustomDomain();
  const cfg = { applicationId: "app_1", token: "tok", widgetBase: WIDGET };
  // `null` is what URLSearchParams.get("link") returns when the page was opened without one.
  for (const bad of [null, undefined, "", 42, "https://", "//", "http://[", "https://exa mple.test/x"]) {
    assert.throws(
      () => sdk.loadSharedFlow(bad, cfg),
      (err) => err.name === "CustomDomainError" && err.code === "InvalidLinkError",
      String(bad)
    );
  }
  assert.equal(frames.length, 0);
  // The same code for a well formed link on another origin.
  assert.throws(
    () => sdk.loadSharedFlow("https://evil.test/x", cfg),
    (err) => err.name === "CustomDomainError" && err.code === "InvalidLinkError"
  );
  window.dispatchEvent(new MessageEvent("message", { data: { type: "customdomain:ready" }, origin: WIDGET }));
  assert.equal(posted.length, 0, "the token was posted after a refused link");
});

test("loadSharedFlow checks against the hosted widget origin when no widgetBase is given", () => {
  const frames = trackFrames();
  const sdk = new CustomDomain();
  assert.throws(() => sdk.loadSharedFlow("https://evil.test/share/x", { token: "tok" }), (err) => err.name === "CustomDomainError");
  assert.equal(frames.length, 0);
  sdk.loadSharedFlow("https://app.customdomain.ai/share/x", { token: "tok" });
  assert.equal(frames[0].src, "https://app.customdomain.ai/share/x");
  sdk.close();
});

test("a refused loadSharedFlow leaves the modal that is already open running", () => {
  const frames = trackFrames();
  const sdk = new CustomDomain();
  sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET });
  assert.throws(() => sdk.loadSharedFlow("https://evil.test/x", { widgetBase: WIDGET }), (err) => err.name === "CustomDomainError");
  assert.equal(frames[0].parentNode, document.body, "the open modal was torn down by a refused link");
  sdk.close();
});

// getToken(ctx): when the widget's token expires, or is not bound to the domain the end user typed,
// it posts `customdomain:token-expired` with `{ domain, reason }`. The SDK hands the host a
// TokenRequest built from that payload and posts the answer back to the frame as `customdomain:token`.

/** Let the SDK's promise chain around getToken settle (it runs in microtasks). */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** The `customdomain:token` answers the SDK has posted into the widget frame, with where they went. */
const tokenAnswers = () =>
  posted.filter((p) => p.message.type === "customdomain:token").map((p) => ({ payload: p.message.payload, targetOrigin: p.targetOrigin }));

/** Open with a getToken that records its arguments, then deliver one token-expired message. */
async function askForToken(payload, getToken) {
  const calls = [];
  const sdk = new CustomDomain();
  sdk.open({
    applicationId: "app_1",
    token: "tok",
    widgetBase: WIDGET,
    getToken: (...args) => {
      calls.push(args);
      return getToken ? getToken(...args) : "fresh";
    },
  });
  initPayload();
  fromWidget("customdomain:token-expired", payload);
  await settle();
  sdk.close();
  return calls;
}

test("a token-expired message with a domain and reason \"bind\" calls getToken with that object and posts its token back", async () => {
  const calls = await askForToken({ domain: "shop.example.com", reason: "bind" }, () => "tok_bound");
  assert.deepEqual(calls, [[{ domain: "shop.example.com", reason: "bind" }]]);
  assert.deepEqual(tokenAnswers(), [{ payload: { token: "tok_bound" }, targetOrigin: WIDGET }]);
});

test("a getToken that returns a promise is awaited, and reason \"expired\" is passed with its domain", async () => {
  const calls = await askForToken({ domain: "acme.com", reason: "expired" }, async () => "tok_later");
  assert.deepEqual(calls, [[{ domain: "acme.com", reason: "expired" }]]);
  assert.deepEqual(tokenAnswers(), [{ payload: { token: "tok_later" }, targetOrigin: WIDGET }]);
});

test("an empty payload, as the older hosted widget sends, asks for reason \"expired\" and names no domain", async () => {
  const calls = await askForToken({});
  assert.deepEqual(calls, [[{ reason: "expired" }]]);
  assert.equal("domain" in calls[0][0], false, "the request carries a domain key with nothing in it");
  assert.deepEqual(tokenAnswers(), [{ payload: { token: "fresh" }, targetOrigin: WIDGET }]);
});

test("a malformed token-expired payload asks for reason \"expired\" and names no domain", async () => {
  for (const bad of [
    undefined,
    null,
    "shop.example.com",
    42,
    true,
    [],
    ["shop.example.com"],
    { domain: 42, reason: 7 },
    { domain: { host: "shop.example.com" }, reason: { value: "bind" } },
    { domain: ["shop.example.com"], reason: null },
    { domain: null, reason: "BIND" },
    { reason: "rebind" },
    { domain: "", reason: "" },
  ]) {
    posted = [];
    const calls = await askForToken(bad);
    assert.deepEqual(calls, [[{ reason: "expired" }]], JSON.stringify(bad) ?? String(bad));
    assert.equal(tokenAnswers().length, 1, "the host's token was not posted back");
  }
});

test("a domain of 253 characters is passed and one of 254 is dropped, keeping the reason", async () => {
  const longest = `${"a".repeat(241)}.example.com`;
  assert.equal(longest.length, 253);
  assert.deepEqual(await askForToken({ domain: longest, reason: "bind" }), [[{ domain: longest, reason: "bind" }]]);

  const tooLong = `${"a".repeat(242)}.example.com`;
  assert.equal(tooLong.length, 254);
  posted = [];
  const calls = await askForToken({ domain: tooLong, reason: "bind" });
  assert.deepEqual(calls, [[{ reason: "bind" }]]);
  assert.equal("domain" in calls[0][0], false);
  assert.equal(tokenAnswers().length, 1, "the host's token was not posted back");
});

test("a getToken that takes no argument still answers, whatever the widget sent", async () => {
  const sdk = new CustomDomain();
  sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET, getToken: () => "tok_zero" });
  initPayload();
  fromWidget("customdomain:token-expired", { domain: "shop.example.com", reason: "bind" });
  await settle();
  fromWidget("customdomain:token-expired", {});
  await settle();
  assert.deepEqual(tokenAnswers(), [
    { payload: { token: "tok_zero" }, targetOrigin: WIDGET },
    { payload: { token: "tok_zero" }, targetOrigin: WIDGET },
  ]);
  sdk.close();
});

test("without a getToken the widget is told there is no token, and open() says it cannot refresh", async () => {
  const sdk = new CustomDomain();
  sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET });
  assert.equal(initPayload().config.canRefreshToken, false);
  fromWidget("customdomain:token-expired", { domain: "shop.example.com", reason: "bind" });
  await settle();
  assert.deepEqual(tokenAnswers(), [{ payload: { token: null }, targetOrigin: WIDGET }]);
  sdk.close();
});

test("a getToken that throws, rejects or returns no string answers null", async () => {
  for (const getToken of [
    () => {
      throw new Error("boom");
    },
    () => Promise.reject(new Error("boom")),
    () => "",
    () => undefined,
    () => 42,
  ]) {
    posted = [];
    await askForToken({ domain: "shop.example.com", reason: "bind" }, getToken);
    assert.deepEqual(tokenAnswers(), [{ payload: { token: null }, targetOrigin: WIDGET }], String(getToken));
  }
});

test("a payload that throws when it is read still gets a reply, and the next message is still handled", async () => {
  const throwing = () => {
    throw new Error("hostile getter");
  };
  for (const payload of [
    Object.defineProperty({ reason: "bind" }, "domain", { enumerable: true, get: throwing }),
    Object.defineProperty({ domain: "shop.example.com" }, "reason", { enumerable: true, get: throwing }),
    new Proxy({}, { get: throwing }),
  ]) {
    posted = [];
    const calls = [];
    const sdk = new CustomDomain();
    sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET, getToken: (...a) => (calls.push(a), "tok_next") });
    initPayload();
    fromWidget("customdomain:token-expired", payload);
    await settle();
    // The widget waits for exactly one answer. A token (the request was readable after all) or null (it
    // was not) both let it go on; no answer would leave it waiting for a token that never comes.
    const answers = tokenAnswers();
    assert.equal(answers.length, 1, "the widget got no answer to its token request");
    assert.ok(answers[0].payload.token === null || typeof answers[0].payload.token === "string");
    assert.equal(answers[0].targetOrigin, WIDGET);
    assert.ok(calls.length <= 1);

    // The listener is still there for the next, well formed, request.
    fromWidget("customdomain:token-expired", { domain: "shop.example.com", reason: "bind" });
    await settle();
    assert.deepEqual(tokenAnswers().at(-1), { payload: { token: "tok_next" }, targetOrigin: WIDGET });
    assert.deepEqual(calls.at(-1), [{ domain: "shop.example.com", reason: "bind" }]);
    sdk.close();
  }
});

test("a token-expired message from another origin is ignored", async () => {
  const calls = [];
  const sdk = new CustomDomain();
  sdk.open({ applicationId: "app_1", token: "tok", widgetBase: WIDGET, getToken: (...a) => (calls.push(a), "stolen") });
  initPayload();
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "customdomain:token-expired", payload: { domain: "shop.example.com", reason: "bind" } },
      origin: "https://elsewhere.test",
    })
  );
  await settle();
  assert.deepEqual(calls, []);
  assert.deepEqual(tokenAnswers(), []);
  sdk.close();
});

// The nameserver methods: getNameserverMove, startNameserverMove and rollbackNameservers call the routes the
// hosted widget itself calls, with the end user's widget token. A stub fetch records each request and answers
// with a wire shape (snake_case), which the SDK maps to the camelCase view.

/** Answer every fetch with `status` and `body`, and record the requests (`url`, `init`) it was given. */
function stubFetch(status, body) {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: `status ${status}`,
      json: async () => {
        if (body === undefined) throw new SyntaxError("Unexpected end of JSON input");
        return body;
      },
    };
  };
  return requests;
}

const NS_API = "https://api.test";
const NS_CFG = { token: "tok_ns" };
const nsSdk = () => new CustomDomain({ apiBase: NS_API });
const sentBody = (request) => JSON.parse(request.init.body);

/** A move as the API sends it, with every field set. */
const MOVE_WIRE = {
  id: "nsm_1",
  connection_id: "conn_1",
  zone: "acme.com",
  state: "needs_review",
  path: "agent",
  target: "dns_host",
  dns_host: "cloudflare",
  provider: "godaddy",
  registrar: { name: "GoDaddy", provider: "godaddy", iana_id: 146, url: "https://www.godaddy.com", source: "rdap" },
  old_dns_host: "route53",
  old_nameservers: ["ns-1.old.example", "ns-2.old.example"],
  new_nameservers: ["ada.ns.example", "bob.ns.example"],
  observed_nameservers: ["ns-1.old.example", "ns-2.old.example"],
  waiting_for: "copy_review",
  next_step: "Check the copied records, then confirm.",
  next_action: { kind: "rollback", method: "POST", path: "/v1/connections/conn_1/nameservers:rollback", body: { rollback_target: "previous" } },
  failure_code: "registrar_refused",
  failure_detail: "the registrar said no",
  records_copied: 12,
  email_records: 3,
  email_kinds: ["mx", "spf", "dkim"],
  copy_source: "discovery",
  copy_warnings: ["a proxied record was left out"],
  copy_reviewed_at: "2026-10-30T10:05:00Z",
  ds_present: true,
  ds_removed_at: "2026-10-30T10:06:00Z",
  ds_cleared_at: "2026-10-30T10:07:00Z",
  can_rollback: true,
  rollback_path: "agent",
  rollback_targets: ["previous", "registrar_default"],
  rollback_default: "previous",
  rollback_target: "registrar_default",
  rollback_set_at: "2026-10-30T10:08:00Z",
  old_dns_serves: true,
  consent: { id: "nsm-consent", version: "3", at: "2026-10-30T10:00:00Z" },
  actor: "end_user",
  created_at: "2026-10-30T10:00:00Z",
  set_at: "2026-10-30T10:01:00Z",
  active_at: "2026-10-30T10:02:00Z",
  failed_at: "2026-10-30T10:03:00Z",
  rolled_back_at: "2026-10-30T10:04:00Z",
  drifted_at: "2026-10-30T10:09:00Z",
  checked_at: "2026-10-30T10:10:00Z",
  next_check_at: "2026-10-30T10:15:00Z",
  updated_at: "2026-10-30T10:11:00Z",
};

/** The same move as the SDK returns it. */
const MOVE_VIEW = {
  id: "nsm_1",
  connectionId: "conn_1",
  zone: "acme.com",
  state: "needs_review",
  path: "agent",
  target: "dns_host",
  dnsHost: "cloudflare",
  provider: "godaddy",
  registrar: { name: "GoDaddy", provider: "godaddy", ianaId: 146, url: "https://www.godaddy.com", source: "rdap" },
  oldDnsHost: "route53",
  oldNameservers: ["ns-1.old.example", "ns-2.old.example"],
  newNameservers: ["ada.ns.example", "bob.ns.example"],
  observedNameservers: ["ns-1.old.example", "ns-2.old.example"],
  waitingFor: "copy_review",
  nextStep: "Check the copied records, then confirm.",
  nextAction: { kind: "rollback", method: "POST", path: "/v1/connections/conn_1/nameservers:rollback", body: { rollback_target: "previous" } },
  failureCode: "registrar_refused",
  failureDetail: "the registrar said no",
  recordsCopied: 12,
  emailRecords: 3,
  emailKinds: ["mx", "spf", "dkim"],
  copySource: "discovery",
  copyWarnings: ["a proxied record was left out"],
  copyReviewedAt: "2026-10-30T10:05:00Z",
  dsPresent: true,
  dsRemovedAt: "2026-10-30T10:06:00Z",
  dsClearedAt: "2026-10-30T10:07:00Z",
  canRollback: true,
  rollbackPath: "agent",
  rollbackTargets: ["previous", "registrar_default"],
  rollbackDefault: "previous",
  rollbackTarget: "registrar_default",
  rollbackSetAt: "2026-10-30T10:08:00Z",
  oldDnsServes: true,
  consent: { id: "nsm-consent", version: "3", at: "2026-10-30T10:00:00Z" },
  actor: "end_user",
  createdAt: "2026-10-30T10:00:00Z",
  setAt: "2026-10-30T10:01:00Z",
  activeAt: "2026-10-30T10:02:00Z",
  failedAt: "2026-10-30T10:03:00Z",
  rolledBackAt: "2026-10-30T10:04:00Z",
  driftedAt: "2026-10-30T10:09:00Z",
  checkedAt: "2026-10-30T10:10:00Z",
  nextCheckAt: "2026-10-30T10:15:00Z",
  updatedAt: "2026-10-30T10:11:00Z",
};

/** What a move with nothing but its identity reads as: lists empty, counts zero, flags false, the nullable three null. */
const MOVE_BARE_VIEW = {
  id: "nsm_2",
  zone: "acme.com",
  state: "copying",
  path: "manual",
  target: "managed",
  registrar: null,
  oldNameservers: [],
  newNameservers: [],
  observedNameservers: [],
  nextAction: null,
  recordsCopied: 0,
  emailRecords: 0,
  emailKinds: [],
  copyWarnings: [],
  dsPresent: false,
  canRollback: false,
  rollbackTargets: [],
  oldDnsServes: null,
};
const MOVE_BARE_WIRE = { id: "nsm_2", zone: "acme.com", state: "copying", path: "manual", target: "managed" };

const CONSENT = { id: "nsm-consent", version: "3" };

test("getNameserverMove reads GET /v1/connections/{id}/nameservers with the token and maps every field", async () => {
  const requests = stubFetch(200, MOVE_WIRE);
  const move = await nsSdk().getNameserverMove("conn_1", NS_CFG);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${NS_API}/v1/connections/conn_1/nameservers`);
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.headers.authorization, "Bearer tok_ns");
  assert.equal(requests[0].init.body, undefined, "a read sends no body");
  assert.deepEqual(move, MOVE_VIEW);
});

test("getNameserverMove leaves the wire names behind: no snake_case key survives the mapping", async () => {
  stubFetch(200, MOVE_WIRE);
  const move = await nsSdk().getNameserverMove("conn_1", NS_CFG);
  const snake = Object.keys(move).filter((k) => k.includes("_"));
  assert.deepEqual(snake, []);
  assert.deepEqual(Object.keys(move.registrar).filter((k) => k.includes("_")), []);
});

test("getNameserverMove tolerates a move with only its identity: lists empty, counts zero, flags false, optional fields absent", async () => {
  stubFetch(200, MOVE_BARE_WIRE);
  const move = await nsSdk().getNameserverMove("conn_1", NS_CFG);
  assert.deepEqual(move, MOVE_BARE_VIEW);
  for (const absent of ["connectionId", "dnsHost", "provider", "oldDnsHost", "waitingFor", "nextStep", "failureCode", "failureDetail", "copySource", "copyReviewedAt", "dsRemovedAt", "dsClearedAt", "rollbackPath", "rollbackDefault", "rollbackTarget", "rollbackSetAt", "consent", "actor", "createdAt", "setAt", "activeAt", "failedAt", "rolledBackAt", "driftedAt", "checkedAt", "nextCheckAt", "updatedAt"]) {
    assert.equal(absent in move, false, `${absent} is set though the answer had none`);
  }
});

test("getNameserverMove reads a null field as absent, and a registrar with only a name and source", async () => {
  const nulls = Object.fromEntries(Object.keys(MOVE_WIRE).map((k) => [k, null]));
  stubFetch(200, { ...nulls, id: "nsm_3", zone: "acme.com", state: "propagating", path: "api", target: "custom", registrar: { name: "Some Registrar", source: "" } });
  const move = await nsSdk().getNameserverMove("conn_1", NS_CFG);
  assert.deepEqual(move, {
    ...MOVE_BARE_VIEW,
    id: "nsm_3",
    state: "propagating",
    path: "api",
    target: "custom",
    registrar: { name: "Some Registrar", source: "" },
  });

  // An answer with no registrar `source` at all still reads as a string.
  stubFetch(200, { ...MOVE_BARE_WIRE, registrar: { name: "Some Registrar" } });
  assert.deepEqual((await nsSdk().getNameserverMove("conn_1", NS_CFG)).registrar, { name: "Some Registrar", source: "" });
});

test("getNameserverMove maps a next_action that has no body, and one that has", async () => {
  stubFetch(200, { ...MOVE_BARE_WIRE, next_action: { kind: "retry", method: "POST", path: "/v1/connections/conn_1/nameservers:migrate" } });
  const retry = (await nsSdk().getNameserverMove("conn_1", NS_CFG)).nextAction;
  assert.deepEqual(retry, { kind: "retry", method: "POST", path: "/v1/connections/conn_1/nameservers:migrate" });
  assert.equal("body" in retry, false);

  stubFetch(200, { ...MOVE_BARE_WIRE, next_action: { kind: "sign_in", method: "POST", path: "/v1/connections/conn_1/browser:start", body: { purpose: "nameservers", provider: "godaddy" } } });
  assert.deepEqual((await nsSdk().getNameserverMove("conn_1", NS_CFG)).nextAction.body, { purpose: "nameservers", provider: "godaddy" });
});

test("getNameserverMove resolves null when no move was started (404), and rejects for any other refusal", async () => {
  stubFetch(404, { code: "not_found", title: "No nameserver migration was started for this connection." });
  assert.equal(await nsSdk().getNameserverMove("conn_1", NS_CFG), null);

  for (const [status, code] of [[401, "unauthorized"], [403, "token_wrong_end_user"], [500, "internal"], [503, "unavailable"]]) {
    stubFetch(status, { code, title: `title ${status}`, details: `details ${status}` });
    await assert.rejects(
      () => nsSdk().getNameserverMove("conn_1", NS_CFG),
      (err) => err.name === "CustomDomainError" && err.code === code && err.status === status && err.message === `title ${status}` && err.details === `details ${status}`,
      String(status)
    );
  }
});

test("a nameserver call uses cfg.apiBase over the instance's, and the instance's over the hosted default", async () => {
  const requests = stubFetch(200, MOVE_BARE_WIRE);
  await nsSdk().getNameserverMove("conn_1", { token: "t", apiBase: "https://other.test" });
  await nsSdk().getNameserverMove("conn_1", { token: "t" });
  await new CustomDomain().getNameserverMove("conn_1", { token: "t" });
  assert.deepEqual(
    requests.map((r) => r.url),
    [
      "https://other.test/v1/connections/conn_1/nameservers",
      `${NS_API}/v1/connections/conn_1/nameservers`,
      "https://api.customdomain.ai/v1/connections/conn_1/nameservers",
    ]
  );
});

test("a connection id with a slash, a space or a colon stays one path segment, on all three routes", async () => {
  const requests = stubFetch(200, MOVE_BARE_WIRE);
  const id = "conn/1 x:y";
  await nsSdk().getNameserverMove(id, NS_CFG);
  await nsSdk().startNameserverMove(id, CONSENT, NS_CFG);
  await nsSdk().rollbackNameservers(id, NS_CFG);
  assert.deepEqual(
    requests.map((r) => r.url),
    [
      `${NS_API}/v1/connections/conn%2F1%20x%3Ay/nameservers`,
      `${NS_API}/v1/connections/conn%2F1%20x%3Ay/nameservers:migrate`,
      `${NS_API}/v1/connections/conn%2F1%20x%3Ay/nameservers:rollback`,
    ]
  );
});

test("startNameserverMove posts the consent to nameservers:migrate and maps the move (201 and 200 alike)", async () => {
  for (const status of [201, 200]) {
    const requests = stubFetch(status, MOVE_WIRE);
    const move = await nsSdk().startNameserverMove("conn_1", CONSENT, NS_CFG);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `${NS_API}/v1/connections/conn_1/nameservers:migrate`);
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.headers.authorization, "Bearer tok_ns");
    assert.equal(requests[0].init.headers["content-type"], "application/json");
    assert.deepEqual(sentBody(requests[0]), { consent: { id: "nsm-consent", version: "3" } });
    assert.deepEqual(move, MOVE_VIEW);
  }
});

test("startNameserverMove sends copy_reviewed only when copyReviewed is true, and only the consent's id and version", async () => {
  const requests = stubFetch(200, MOVE_BARE_WIRE);
  await nsSdk().startNameserverMove("conn_1", CONSENT, { token: "t", copyReviewed: true });
  await nsSdk().startNameserverMove("conn_1", CONSENT, { token: "t", copyReviewed: false });
  await nsSdk().startNameserverMove("conn_1", CONSENT, { token: "t" });
  assert.deepEqual(sentBody(requests[0]), { consent: CONSENT, copy_reviewed: true });
  assert.deepEqual(sentBody(requests[1]), { consent: CONSENT });
  assert.deepEqual(sentBody(requests[2]), { consent: CONSENT });

  // Anything else on the consent object stays on the caller's side.
  await nsSdk().startNameserverMove("conn_1", { id: "nsm-consent", version: "3", at: "yesterday", note: "x" }, NS_CFG);
  assert.deepEqual(sentBody(requests[3]), { consent: CONSENT });
});

test("startNameserverMove needs the consent: a missing or blank one rejects with InvalidConsentError and sends nothing", async () => {
  const requests = stubFetch(200, MOVE_WIRE);
  for (const bad of [
    undefined,
    null,
    {},
    { id: "nsm-consent" },
    { version: "3" },
    { id: "", version: "3" },
    { id: "nsm-consent", version: "" },
    { id: "   ", version: "3" },
    { id: "nsm-consent", version: "\t" },
    { id: 7, version: "3" },
    { id: "nsm-consent", version: 3 },
    { id: null, version: null },
    "nsm-consent",
    42,
    [],
  ]) {
    await assert.rejects(
      () => nsSdk().startNameserverMove("conn_1", bad, NS_CFG),
      (err) => err.name === "CustomDomainError" && err.code === "InvalidConsentError" && err.status === undefined,
      JSON.stringify(bad) ?? String(bad)
    );
  }
  assert.equal(requests.length, 0, "a call without consent reached the API");
});

test("startNameserverMove surfaces the API's refusals as CustomDomainError with code, status and details", async () => {
  for (const [status, code] of [
    [400, "invalid_request"],
    [403, "token_wrong_end_user"],
    [403, "forbidden"],
    [409, "conflict"],
    [422, "nameserver_migration_unavailable"],
    [422, "registrar_locks_nameservers"],
    [404, "not_found"],
    [503, "unavailable"],
  ]) {
    stubFetch(status, { code, title: `title ${code}`, details: `details ${code}` });
    await assert.rejects(
      () => nsSdk().startNameserverMove("conn_1", CONSENT, NS_CFG),
      (err) => err.name === "CustomDomainError" && err.code === code && err.status === status && err.message === `title ${code}` && err.details === `details ${code}`,
      `${status} ${code}`
    );
  }
});

test("rollbackNameservers with no target posts an empty body to nameservers:rollback and maps the move", async () => {
  const requests = stubFetch(200, MOVE_WIRE);
  const move = await nsSdk().rollbackNameservers("conn_1", NS_CFG);
  assert.equal(requests[0].url, `${NS_API}/v1/connections/conn_1/nameservers:rollback`);
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.authorization, "Bearer tok_ns");
  assert.equal(requests[0].init.headers["content-type"], "application/json");
  assert.equal(requests[0].init.body, "{}");
  assert.deepEqual(move, MOVE_VIEW);
});

test("rollbackNameservers sends rollback_target for a target, and an empty body for none, undefined or blank", async () => {
  const requests = stubFetch(200, MOVE_BARE_WIRE);
  await nsSdk().rollbackNameservers("conn_1", "previous", NS_CFG);
  await nsSdk().rollbackNameservers("conn_1", "registrar_default", NS_CFG);
  await nsSdk().rollbackNameservers("conn_1", undefined, NS_CFG);
  await nsSdk().rollbackNameservers("conn_1", "", NS_CFG);
  await nsSdk().rollbackNameservers("conn_1", null, NS_CFG);
  assert.deepEqual(requests.map(sentBody), [
    { rollback_target: "previous" },
    { rollback_target: "registrar_default" },
    {},
    {},
    {},
  ]);
  // The token and base URL come from the config in every form.
  assert.deepEqual([...new Set(requests.map((r) => r.init.headers.authorization))], ["Bearer tok_ns"]);
  assert.deepEqual([...new Set(requests.map((r) => r.url))], [`${NS_API}/v1/connections/conn_1/nameservers:rollback`]);
});

test("rollbackNameservers surfaces the API's refusals as CustomDomainError, whichever form it was called in", async () => {
  for (const [status, code] of [
    [403, "token_wrong_end_user"],
    [409, "old_dns_gone"],
    [409, "changed_elsewhere"],
    [502, "registrar_refused"],
    [504, "registrar_unconfirmed"],
  ]) {
    stubFetch(status, { code, title: `title ${code}`, details: `details ${code}` });
    const refused = (err) => err.name === "CustomDomainError" && err.code === code && err.status === status && err.details === `details ${code}`;
    await assert.rejects(() => nsSdk().rollbackNameservers("conn_1", NS_CFG), refused, `${code} (no target)`);
    await assert.rejects(() => nsSdk().rollbackNameservers("conn_1", "previous", NS_CFG), refused, `${code} (target)`);
  }
});

test("an error answer that is not JSON still becomes a CustomDomainError with the status in its code", async () => {
  stubFetch(502, undefined);
  for (const call of [
    () => nsSdk().getNameserverMove("conn_1", NS_CFG),
    () => nsSdk().startNameserverMove("conn_1", CONSENT, NS_CFG),
    () => nsSdk().rollbackNameservers("conn_1", NS_CFG),
  ]) {
    await assert.rejects(call, (err) => err.name === "CustomDomainError" && err.code === "http_502" && err.status === 502 && err.message === "status 502");
  }
});
