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
