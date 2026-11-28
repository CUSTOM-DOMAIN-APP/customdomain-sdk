// Tests for the SDK's HTTP core (resilience): the API date header, timeout, abort signal, retries,
// Idempotency-Key and the request id on errors. Each runs against a real local HTTP server, so the
// built bundle's own fetch is exercised end to end. Run after `pnpm -r build` like the other tests.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { CustomDomain, CustomDomainError } from "../dist/index.js";
import { sendJson, parseRetryAfter, API_VERSION } from "../dist/transport.js";

let server;
let base;
let seen; // requests the fake server received
let script; // (req, res, n) => void, set per test

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw });
      script(req, res, seen.length);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});
beforeEach(() => {
  seen = [];
  script = (_req, res) => json(res, 200, CHECK_OK);
});

const CHECK_OK = { domain: "acme.com", setup_type: "automatic" };
function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}
// A client with a tiny backoff so retry tests stay fast.
const client = (extra = {}) => new CustomDomain({ apiBase: base, retryBaseMs: 5, ...extra });
const dnsRecords = [{ type: "CNAME", host: "www.acme.com", value: "edge.example.net" }];

test("every call sends the API date header, on both public methods and on retries", async () => {
  script = (req, res) => json(res, 200, req.url.includes("monitor") ? { domain: "acme.com", drift: false, records: [] } : CHECK_OK);
  const c = client();
  await c.checkDomain("acme.com", { token: "tok" });
  await c.checkRecords("acme.com", { token: "tok", dnsRecords });
  assert.equal(seen.length, 2);
  for (const r of seen) assert.equal(r.headers["customdomain-version"], API_VERSION);
  assert.match(API_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("the API date can be pinned or switched off on the client", async () => {
  await client({ apiVersion: "2026-11-21" }).checkDomain("acme.com", { token: "tok" });
  await client({ apiVersion: null }).checkDomain("acme.com", { token: "tok" });
  assert.equal(seen[0].headers["customdomain-version"], "2026-11-21");
  assert.equal(seen[1].headers["customdomain-version"], undefined);
});

test("the existing headers and body are unchanged", async () => {
  await client().checkDomain("acme.com", { token: "tok", dnsRecords });
  const r = seen[0];
  assert.equal(r.method, "POST");
  assert.equal(r.url, "/v1/domains:check");
  assert.equal(r.headers.authorization, "Bearer tok");
  assert.equal(r.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(r.body), { domain: "acme.com", records: dnsRecords });
  assert.equal(r.headers["idempotency-key"], undefined);
});

test("timeout: a slow server fails with request_timeout, and a per call value overrides the client default", async () => {
  script = () => {}; // never answers
  const c = client({ timeoutMs: 10_000 });
  const t0 = Date.now();
  await assert.rejects(
    c.checkDomain("acme.com", { token: "tok", timeoutMs: 60, retries: 0 }),
    (e) => e instanceof CustomDomainError && e.code === "request_timeout" && e.status === undefined
  );
  assert.ok(Date.now() - t0 < 5_000);
  const c2 = client({ timeoutMs: 60, retries: 0 });
  await assert.rejects(c2.checkDomain("acme.com", { token: "tok" }), (e) => e.code === "request_timeout");
});

test("timeout: a timed out attempt is retried and the next one can succeed", async () => {
  script = (_req, res, n) => (n === 1 ? undefined : json(res, 200, CHECK_OK));
  const r = await client().checkDomain("acme.com", { token: "tok", timeoutMs: 80 });
  assert.equal(r.domain, "acme.com");
  assert.equal(seen.length, 2);
});

test("abort signal: aborting mid flight rejects with the signal's reason and sends nothing again", async () => {
  script = () => {};
  const ctrl = new AbortController();
  const p = client().checkDomain("acme.com", { token: "tok", signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 50);
  await assert.rejects(p, (e) => e.name === "AbortError");
  assert.equal(seen.length, 1);
});

test("abort signal: an already aborted signal sends nothing, and a custom reason is kept", async () => {
  const ctrl = new AbortController();
  const reason = new Error("user left the page");
  ctrl.abort(reason);
  await assert.rejects(client().checkDomain("acme.com", { token: "tok", signal: ctrl.signal }), (e) => e === reason);
  assert.equal(seen.length, 0);
});

test("abort signal: aborting during the wait between retries stops the retries", async () => {
  script = (_req, res) => json(res, 503, { code: "unavailable", title: "Busy" });
  const ctrl = new AbortController();
  const p = new CustomDomain({ apiBase: base, retryBaseMs: 5_000 }).checkDomain("acme.com", { token: "tok", signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 100);
  await assert.rejects(p, (e) => e.name === "AbortError");
  assert.equal(seen.length, 1);
});

test("retries: a 503 then a 429 then success returns the result after three attempts", async () => {
  script = (_req, res, n) =>
    n === 1 ? json(res, 503, { code: "unavailable", title: "Busy" }) : n === 2 ? json(res, 429, { code: "rate_limited", title: "Slow down" }) : json(res, 200, CHECK_OK);
  const r = await client().checkDomain("acme.com", { token: "tok" });
  assert.equal(r.domain, "acme.com");
  assert.equal(seen.length, 3);
});

test("retries: stops after the configured count and throws the last error", async () => {
  script = (_req, res) => json(res, 500, { code: "internal", title: "Boom" }, { "x-request-id": "req_last" });
  await assert.rejects(
    client().checkDomain("acme.com", { token: "tok", retries: 1 }),
    (e) => e instanceof CustomDomainError && e.status === 500 && e.requestId === "req_last"
  );
  assert.equal(seen.length, 2);
  seen = [];
  await assert.rejects(client().checkDomain("acme.com", { token: "tok" }), (e) => e.status === 500);
  assert.equal(seen.length, 3, "the default is two retries");
});

test("retries: a 4xx other than 429 is never retried", async () => {
  script = (_req, res) => json(res, 401, { code: "unauthorized", title: "Bad token" });
  await assert.rejects(client().checkDomain("acme.com", { token: "tok" }), (e) => e.status === 401 && e.code === "unauthorized");
  assert.equal(seen.length, 1);
});

test("retries: retries: 0 turns them off", async () => {
  script = (_req, res) => json(res, 503, { code: "unavailable", title: "Busy" });
  await assert.rejects(client().checkDomain("acme.com", { token: "tok", retries: 0 }), (e) => e.status === 503);
  assert.equal(seen.length, 1);
});

test("retries: a network error is retried, then the fetch error is thrown unchanged", async () => {
  script = (req) => req.socket.destroy(); // drops the connection
  await assert.rejects(client().checkDomain("acme.com", { token: "tok" }), (e) => e instanceof TypeError);
  assert.equal(seen.length, 3);
});

test("retries: Retry-After is honoured, and one longer than the cap is not waited for", async () => {
  const stamps = [];
  script = (_req, res, n) => {
    stamps.push(Date.now());
    n === 1 ? json(res, 429, { code: "rate_limited", title: "Slow" }, { "retry-after": "1" }) : json(res, 200, CHECK_OK);
  };
  await client().checkDomain("acme.com", { token: "tok" });
  assert.ok(stamps[1] - stamps[0] >= 950, "waited about a second, not the 5 ms backoff");
  seen = [];
  script = (_req, res) => json(res, 429, { code: "reach_quota", title: "Quota" }, { "retry-after": "3600" });
  await assert.rejects(client().checkDomain("acme.com", { token: "tok" }), (e) => e.code === "reach_quota");
  assert.equal(seen.length, 1, "an hour long wait is thrown, not slept");
});

test("parseRetryAfter reads seconds and HTTP dates", () => {
  assert.equal(parseRetryAfter("7"), 7000);
  assert.equal(parseRetryAfter(undefined), undefined);
  assert.equal(parseRetryAfter("soon"), undefined);
  const now = Date.parse("2026-11-28T00:00:00Z");
  assert.equal(parseRetryAfter("Sat, 28 Nov 2026 00:00:10 GMT", now), 10_000);
  assert.equal(parseRetryAfter("Fri, 27 Nov 2026 00:00:00 GMT", now), 0);
});

test("a write is retried only with an Idempotency-Key, and the key is the same on every attempt", async () => {
  script = (_req, res, n) => (n < 3 ? json(res, 503, { code: "unavailable", title: "Busy" }) : json(res, 200, { ok: true }));
  const send = (extra = {}) =>
    sendJson({ url: `${base}/v1/things`, method: "POST", token: "tok", body: { a: 1 }, defaults: { retryBaseMs: 5 }, ...extra });
  // no key: one attempt, no retry
  await assert.rejects(send(), (e) => e.status === 503);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers["idempotency-key"], undefined);
  // caller's key: retried, same key each time
  seen = [];
  assert.deepEqual(await send({ call: { idempotencyKey: "key-123" } }), { ok: true });
  assert.equal(seen.length, 3, "two failures then success");
  assert.deepEqual(new Set(seen.map((r) => r.headers["idempotency-key"])), new Set(["key-123"]));
});

test("a route that accepts Idempotency-Key gets a generated key, reused across retries, and a caller key wins", async () => {
  let n = 0;
  script = (_req, res) => (++n < 3 ? json(res, 502, { code: "bad_gateway", title: "Upstream" }) : json(res, 200, { ok: true }));
  const send = (call) =>
    sendJson({ url: `${base}/v1/registrar/purchase`, method: "POST", token: "tok", body: {}, call, defaults: { retryBaseMs: 5 } });
  await send();
  assert.equal(seen.length, 3);
  const keys = new Set(seen.map((r) => r.headers["idempotency-key"]));
  assert.equal(keys.size, 1);
  assert.ok([...keys][0] && [...keys][0].length >= 16);
  seen = [];
  n = 5;
  await send({ idempotencyKey: "mine" });
  assert.equal(seen[0].headers["idempotency-key"], "mine");
  // the read only checks never get a generated key
  seen = [];
  await client().checkDomain("acme.com", { token: "tok" });
  assert.equal(seen[0].headers["idempotency-key"], undefined);
});

test("a caller supplied Idempotency-Key on checkDomain is sent unchanged", async () => {
  await client().checkDomain("acme.com", { token: "tok", idempotencyKey: "abc" });
  assert.equal(seen[0].headers["idempotency-key"], "abc");
});

test("errors carry the request id from the X-Request-Id header, with code, title, details and status", async () => {
  script = (_req, res) => json(res, 422, { code: "invalid_domain", title: "Not a domain", details: "bad label" }, { "x-request-id": "req_abc123" });
  await assert.rejects(client().checkDomain("acme.com", { token: "tok" }), (e) => {
    assert.ok(e instanceof CustomDomainError);
    assert.equal(e.requestId, "req_abc123");
    assert.equal(e.code, "invalid_domain");
    assert.equal(e.message, "Not a domain");
    assert.equal(e.details, "bad label");
    assert.equal(e.status, 422);
    return true;
  });
});

test("the request id is kept when the error body is not JSON, and unset when the header is absent", async () => {
  script = (_req, res) => {
    res.writeHead(400, { "x-request-id": "req_plain", "content-type": "text/plain" });
    res.end("nope");
  };
  await assert.rejects(client().checkRecords("acme.com", { token: "tok", dnsRecords }), (e) => e.code === "http_400" && e.requestId === "req_plain");
  script = (_req, res) => json(res, 400, { code: "bad", title: "Bad" });
  await assert.rejects(client().checkRecords("acme.com", { token: "tok", dnsRecords }), (e) => e.requestId === undefined);
});
