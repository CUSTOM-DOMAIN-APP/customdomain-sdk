/**
 * Browser simulation of the widget's two defining journeys, driven through the
 * REAL built bundles (dist/widget.js + the SDK gateway) in real Chromium:
 *
 *   1. flagship OAuth: enter domain → animated analysis → "Authorize with
 *      Cloudflare" → popup consents (stands in for the control-plane callback
 *      page) → setup/progress → live → FINISHED_SUCCESSFULLY + onSuccess.
 *   2. manual fallback: analysis → records table (server's authoritative set)
 *      → copy → verify → live → FINISHED_SUCCESSFULLY_MANUAL.
 *
 * The only fake is the control-plane itself (an in-process stub speaking the
 * real wire shapes); everything the end-user touches is the production bundle.
 *
 * Run: node sim/simulate.mjs   (writes screenshots to sim/shots/)
 */
import http from "node:http";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const widgetJS = readFileSync(join(root, "dist/widget.js"), "utf8");
const sdkJS = readFileSync(join(root, "../sdk/dist/customdomain-sdk.js"), "utf8");
const shotsDir = join(root, "sim/shots");
mkdirSync(shotsDir, { recursive: true });

// ---- stub control-plane + static host, one origin ----
const state = {
  oauthAvailable: true,
  status: "pending", // connection status the stub reports
  pollsUntilLive: 2, // after N GETs while "propagating"/verifying, flip live
  gets: 0,
  oauthStarted: false,
  applied: false,
  resumeLive: false, // when true, POST /v1/connections answers 200 + live (resume signal)
  sharing: null, // records the POST /v1/sharing/connect body the widget minted (WS4-F5)
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "content-type": type });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  // --- static ---
  if (u.pathname === "/") {
    return send(
      200,
      `<!doctype html><html><body>
        <button id="open">Connect domain</button>
        <script>window.__events = []; window.__steps = [];
          for (const ev of ["customdomain:success","customdomain:close","customdomain:step","customdomain:shared","customdomain:doc-click"]) {
            window.addEventListener(ev, (e) => { window.__events.push({ev, detail: e.detail}); if (ev==="customdomain:step") window.__steps.push(e.detail && e.detail.step); });
          }
        </script>
        <script src="/sdk.js"></script>
        <script>
          document.getElementById("open").addEventListener("click", () => {
            window.customdomain.open({
              applicationId: "app_sim", token: "jwt-sim",
              apiBase: location.origin, widgetBase: location.origin,
            });
          });
        </script>
      </body></html>`,
      "text/html"
    );
  }
  if (u.pathname === "/sdk.js") return send(200, sdkJS, "text/javascript");
  if (u.pathname === "/widget") {
    return send(
      200,
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head>
       <body><div id="customdomain-widget"></div>
       <script>window.CUSTOMDOMAIN_API_BASE=${JSON.stringify(`http://localhost:${PORT}`)};</script>
       <script src="/widget.js"></script></body></html>`,
      "text/html"
    );
  }
  if (u.pathname === "/widget.js") return send(200, widgetJS, "text/javascript");
  if (u.pathname.startsWith("/widget-assets/provider-logos/")) {
    // Serve the real shipped brand marks so screenshots match production.
    try {
      const file = u.pathname.split("/").pop();
      const buf = readFileSync(join(root, "host/widget-assets/provider-logos", file));
      res.writeHead(200, { "content-type": file.endsWith(".svg") ? "image/svg+xml" : "image/png" });
      return res.end(buf);
    } catch {
      return send(404, { code: "not_found" });
    }
  }

  // --- stub API (real wire shapes) ---
  if (u.pathname === "/v1/domains:check") {
    return send(200, {
      domain: "acme-store.com",
      provider: "cloudflare",
      setup_type: "automatic",
      supports_automatic: true,
      oauth_available: state.oauthAvailable,
      domain_connect: false,
      registered: true,
      supports_social_login: state.oauthAvailable ? "yes" : "n-a",
      wildcard_support: true,
      caa_support: true,
      spf_override_support: false,
      cname_flattening: true,
    });
  }
  if (u.pathname === "/v1/connections" && req.method === "POST") {
    state.gets = 0;
    if (state.resumeLive) {
      // Existing connection returned for an already-live domain: 200 (not 201)
      // + live status — the resume signal (WS5-7).
      state.status = "live";
      return send(200, connBody());
    }
    state.status = "pending";
    return send(201, connBody());
  }
  if (u.pathname.startsWith("/v1/connections/") && u.pathname.endsWith("oauth:start")) {
    state.oauthStarted = true;
    return send(200, { authorize_url: `http://localhost:${PORT}/fake-authorize`, provider: "cloudflare" });
  }
  if (u.pathname.startsWith("/v1/connections/") && req.method === "GET") {
    state.gets++;
    if ((state.applied || !state.oauthAvailable) && state.gets >= state.pollsUntilLive) {
      state.status = "live";
    } else if (state.applied) {
      state.status = "propagating";
    }
    return send(200, connBody());
  }
  if (u.pathname === "/v1/sharing/connect" && req.method === "POST") {
    // WS4-F5: the widget mints a REAL share link here (replacing the old
    // mailto-with-raw-records dead end). Capture the body so the scenario can
    // assert the prefill (branding + domain) was forwarded, and return the
    // {link, job_id} the control plane would.
    let raw = "";
    req.on("data", (c) => (raw += c));
    return req.on("end", () => {
      try {
        state.sharing = JSON.parse(raw || "{}");
      } catch {
        state.sharing = {};
      }
      send(201, { link: `${ORIGIN}/share/shr_sim`, job_id: "job_sim" });
    });
  }
  if (u.pathname === "/fake-authorize") {
    // Stands in for the provider consent + our callback finish page: posts the
    // exact customdomain:oauth envelope the control-plane callback page posts.
    state.applied = true;
    return send(
      200,
      `<!doctype html><html><body><p>Consent granted (simulated provider)</p>
       <script>
         var target = window.opener;
         if (target) target.postMessage({ type: "customdomain:oauth", payload: { ok: true, connection_id: "con_sim", domain: "acme-store.com", provider: "cloudflare" } }, "*");
         setTimeout(function(){ window.close(); }, 120);
       </script></body></html>`,
      "text/html"
    );
  }
  send(404, { code: "not_found", title: "not found" });
});

function connBody() {
  return {
    id: "con_sim",
    application_id: "app_sim",
    domain: "acme-store.com",
    provider_id: "cloudflare",
    setup_type: state.oauthAvailable ? "automatic" : "manual",
    status: state.status,
    created_at: "2026-07-07T00:00:00Z",
    records: [{ type: "CNAME", host: "acme-store.com", value: "edge.customdomain.ai", ttl: 3600, applied: false }],
  };
}

const PORT = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
const ORIGIN = `http://localhost:${PORT}`;

// ---- drive it ----
// Chromium resolution, in order: explicit CHROMIUM_PATH; this dev box's
// preinstalled binary; else playwright-core's own registry (CI installs a
// version-matched build via `npx playwright install chromium`).
const chromiumPath =
  process.env.CHROMIUM_PATH ||
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch(
  chromiumPath ? { executablePath: chromiumPath } : {}
);
const results = [];
const fail = (msg) => {
  results.push(`FAIL: ${msg}`);
};
const pass = (msg) => {
  results.push(`ok: ${msg}`);
};

async function widgetFrame(page) {
  await page.waitForSelector("iframe");
  // Poll until the iframe has actually navigated to /widget. The element can
  // exist while its frame is still about:blank, so the old one-shot find raced
  // and intermittently threw "iframe not found" in CI (flaky gate).
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const fr = page.frames().find((f) => f.url().includes("/widget"));
    if (fr) return fr;
    await page.waitForTimeout(100);
  }
  throw new Error("widget iframe not found");
}

// Shadow-DOM helpers: the widget renders in an open shadow root on #customdomain-widget.
const q = (sel) => `document.getElementById("customdomain-widget").shadowRoot.querySelector(${JSON.stringify(sel)})`;
async function shadowClick(fr, sel) {
  await fr.waitForFunction(`!!${q(sel)}`, undefined, { timeout: 8000 });
  await fr.evaluate(`${q(sel)}.click()`);
}
async function shadowType(fr, sel, text) {
  await fr.waitForFunction(`!!${q(sel)}`, undefined, { timeout: 8000 });
  await fr.evaluate(`(() => { const el = ${q(sel)}; el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event("input")); })()`);
}
async function shadowText(fr) {
  return fr.evaluate(`document.getElementById("customdomain-widget").shadowRoot.textContent`);
}
async function shot(page, name) {
  await page.waitForTimeout(600); // let the slide-in animation settle
  await page.screenshot({ path: join(shotsDir, name), fullPage: false });
}

// ---------- Scenario 1: flagship OAuth ----------
{
  state.oauthAvailable = true;
  state.applied = false;
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(ORIGIN);
  await page.click("#open");
  const fr = await widgetFrame(page);

  await shadowType(fr, "#d", "acme-store.com");
  await shot(page, "1-enter-domain.png");
  await shadowClick(fr, "#go");

  // Analysis animates, then the authorize screen (LOGIN) appears.
  await fr.waitForFunction(`!!${q("#oauth")}`, undefined, { timeout: 10000 });
  await shot(page, "2-authorize.png");
  const authorizeText = await shadowText(fr);
  if (!authorizeText.includes("Cloudflare")) fail("authorize screen should name the provider");
  else pass("authorize screen names Cloudflare");

  const popupPromise = page.waitForEvent("popup");
  await shadowClick(fr, "#oauth");
  const popup = await popupPromise;
  pass("OAuth popup opened: " + popup.url());

  // Popup posts the oauth result; widget goes setup → progress → live.
  await page.waitForFunction(
    `window.__steps.includes("FINISHED_SUCCESSFULLY")`,
    undefined,
    { timeout: 20000 }
  );
  await shot(page, "3-congratulations.png");
  const events = await page.evaluate("window.__events");
  const steps = await page.evaluate("window.__steps");
  if (!events.some((e) => e.ev === "customdomain:success")) fail("customdomain:success CustomEvent not dispatched");
  else pass("customdomain:success dispatched");
  for (const expected of ["ENTER_DOMAIN", "DOMAIN_ANALYSIS", "LOGIN", "DOMAIN_SETUP", "FINISHED_SUCCESSFULLY"]) {
    if (!steps.includes(expected)) fail(`status ${expected} missing from step stream: ${steps.join(",")}`);
  }
  pass(`OAuth journey statuses: ${steps.join(" → ")}`);
  await page.close();
}

// ---------- Scenario 2: manual fallback ----------
{
  state.oauthAvailable = false;
  state.applied = false;
  state.status = "pending";
  state.gets = 0;
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(ORIGIN);
  await page.click("#open");
  const fr = await widgetFrame(page);

  await shadowType(fr, "#d", "acme-store.com");
  await shadowClick(fr, "#go");

  // Straight to the manual records table.
  await fr.waitForFunction(`!!${q("#verify")}`, undefined, { timeout: 10000 });
  await shot(page, "4-manual-records.png");
  const manualText = await shadowText(fr);
  if (!manualText.includes("edge.customdomain.ai")) fail("manual table must show the authoritative CNAME target");
  else pass("manual table shows the server's authoritative record");
  if (!manualText.includes("CNAME")) fail("manual table must show the record type");

  await shadowClick(fr, "#verify");
  await page.waitForFunction(
    `window.__steps.includes("FINISHED_SUCCESSFULLY_MANUAL")`,
    undefined,
    { timeout: 20000 }
  );
  await shot(page, "5-manual-done.png");
  const steps = await page.evaluate("window.__steps");
  for (const expected of ["ENTER_DOMAIN", "DOMAIN_ANALYSIS", "MANUAL_CONFIGURATION", "IN_PROGRESS", "FINISHED_SUCCESSFULLY_MANUAL"]) {
    if (!steps.includes(expected)) fail(`status ${expected} missing: ${steps.join(",")}`);
  }
  pass(`manual journey statuses: ${steps.join(" → ")}`);
  await page.close();
}

// ---------- Scenario 3: locale + white-label smoke ----------
{
  state.oauthAvailable = false;
  state.status = "pending";
  state.gets = 0;
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(ORIGIN);
  await page.evaluate(`window.customdomain.open({
    applicationId: "app_sim", token: "jwt-sim",
    apiBase: location.origin, widgetBase: location.origin,
    locale: "de",
    whiteLabel: { colors: { primary: "#16a34a" }, hideConfetti: true },
  })`);
  const fr = await widgetFrame(page);
  await fr.waitForFunction(`!!${q("#d")}`, undefined, { timeout: 8000 });
  const text = await shadowText(fr);
  if (!text.includes("Domain") || !(text.includes("verbinden") || text.includes("Verbinde") || text.includes("verbinde"))) {
    fail(`German locale not applied: ${text.slice(0, 120)}`);
  } else pass("German locale renders");
  const primary = await fr.evaluate(
    `getComputedStyle(document.getElementById("customdomain-widget").shadowRoot.querySelector("button#go")).backgroundColor`
  );
  if (primary !== "rgb(22, 163, 74)") fail(`white-label primary not applied: ${primary}`);
  else pass("white-label primary color applied");
  await shot(page, "6-whitelabel-de.png");
  await page.close();
}

// ---------- Scenario 4: multi-domain sequential (CP-PAR-3) ----------
{
  state.oauthAvailable = false;
  state.resumeLive = false;
  state.applied = false;
  state.status = "pending";
  state.gets = 0;
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(ORIGIN);
  await page.evaluate(`window.customdomain.open({
    applicationId: "app_sim", token: "jwt-sim",
    apiBase: location.origin, widgetBase: location.origin,
    prefilledDomain: ["alpha.example.com", "beta.example.com"],
  })`);
  const fr = await widgetFrame(page);

  // Domain 1: analysis → manual → verify → live → congratulations.
  await fr.waitForFunction(`!!${q("#verify")}`, undefined, { timeout: 12000 });
  await shadowClick(fr, "#verify");
  await page.waitForFunction(
    `window.__events.filter((e) => e.ev === "customdomain:success").length >= 1`,
    undefined,
    { timeout: 20000 }
  );
  // Advance to domain 2 via the relabelled "continue" primary on the done screen.
  await shadowClick(fr, "#done");
  await fr.waitForFunction(`!${q("#verify")}`, undefined, { timeout: 12000 }); // analysis for domain 2
  await fr.waitForFunction(`!!${q("#verify")}`, undefined, { timeout: 15000 });
  await shadowClick(fr, "#verify");
  await page.waitForFunction(
    `window.__events.filter((e) => e.ev === "customdomain:success").length >= 2`,
    undefined,
    { timeout: 20000 }
  );

  const events = await page.evaluate("window.__events");
  const successes = events.filter((e) => e.ev === "customdomain:success").map((e) => e.detail);
  if (successes.length !== 2) fail(`multi-domain expected 2 success events, got ${successes.length}`);
  else pass("multi-domain fired a success per domain");
  if (successes[0]?.domain !== "alpha.example.com" || successes[1]?.domain !== "beta.example.com") {
    fail(`multi-domain success domains wrong: ${successes.map((s) => s && s.domain).join(",")}`);
  } else pass("multi-domain per-domain success domains correct");
  const grew = (successes[0]?.processedDomains?.length ?? 0) === 1 && (successes[1]?.processedDomains?.length ?? 0) === 2;
  if (!grew) fail(`processedDomains did not grow: ${JSON.stringify(successes.map((s) => s && s.processedDomains))}`);
  else pass("processedDomains grows as each domain completes");
  const steps = await page.evaluate("window.__events");
  const anyStepHasPending = steps.some((e) => e.ev === "customdomain:step" && e.detail && Array.isArray(e.detail.pendingDomains));
  if (!anyStepHasPending) fail("step events carried no pendingDomains during multi-domain flow");
  else pass("step events carry pendingDomains/processedDomains");
  await page.close();
}

// ---------- Scenario 5: resume of an already-live domain (WS5-7) ----------
{
  state.oauthAvailable = false;
  state.resumeLive = true;
  state.applied = false;
  state.status = "pending";
  state.gets = 0;
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(ORIGIN);
  await page.evaluate(`window.customdomain.open({
    applicationId: "app_sim", token: "jwt-sim",
    apiBase: location.origin, widgetBase: location.origin,
    prefilledDomain: "already-live.example.com",
  })`);
  const fr = await widgetFrame(page);
  await page.waitForFunction(
    `window.__events.some((e) => e.ev === "customdomain:success")`,
    undefined,
    { timeout: 20000 }
  );
  const events = await page.evaluate("window.__events");
  const success = events.find((e) => e.ev === "customdomain:success")?.detail;
  if (!success?.alreadyConnected) fail(`resume did not flag alreadyConnected: ${JSON.stringify(success)}`);
  else pass("resumed already-live domain flags alreadyConnected on success");
  if (success?.domain !== "already-live.example.com") fail(`resume success domain wrong: ${success && success.domain}`);
  else pass("resume success carries the resumed domain");
  state.resumeLive = false;
  await page.close();
}

// ---------- Scenario 6: share/delegate mints a REAL link (WS4-F5) ----------
{
  state.oauthAvailable = false; // straight to the manual screen, where Share lives
  state.resumeLive = false;
  state.applied = false;
  state.status = "pending";
  state.gets = 0;
  state.sharing = null;
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(ORIGIN);
  // Open with white-label branding so we can assert the prefill carries it.
  await page.evaluate(`window.customdomain.open({
    applicationId: "app_sim", token: "jwt-sim",
    apiBase: location.origin, widgetBase: location.origin,
    prefilledDomain: "delegate.example.com",
    whiteLabel: { colors: { primary: "#9333ea" } },
  })`);
  const fr = await widgetFrame(page);

  // Reach the manual screen (Share button lives there) and click Share.
  await fr.waitForFunction(`!!${q("#share")}`, undefined, { timeout: 12000 });
  await shot(page, "7-manual-share.png");
  await shadowClick(fr, "#share");

  // The widget minted a real link and landed on the "link shared" done screen.
  await page.waitForFunction(
    `window.__steps.includes("FINISHED_SUCCESSFULLY_LINK_SHARED")`,
    undefined,
    { timeout: 15000 }
  );
  await shot(page, "8-shared.png");

  // (a) A real POST /v1/sharing/connect fired carrying the domain + branding prefill.
  if (!state.sharing) fail("share did not POST /v1/sharing/connect");
  else pass("share minted a real link via POST /v1/sharing/connect");
  if (state.sharing && state.sharing.domain !== "delegate.example.com") {
    fail(`share prefill missing/incorrect domain: ${JSON.stringify(state.sharing)}`);
  } else pass("share request carries the target domain");
  const brand = state.sharing?.prefill?.whiteLabel?.colors?.primary;
  if (brand !== "#9333ea") fail(`share prefill lost branding: ${JSON.stringify(state.sharing?.prefill)}`);
  else pass("share prefill carries the tenant branding (resumes branded)");

  // (b) The customdomain:shared event surfaced the minted link + job id to the host.
  const events = await page.evaluate("window.__events");
  const shared = events.find((e) => e.ev === "customdomain:shared")?.detail;
  if (!shared) fail("customdomain:shared event not dispatched");
  else pass("customdomain:shared dispatched");
  if (shared?.link !== `${ORIGIN}/share/shr_sim` || shared?.jobId !== "job_sim") {
    fail(`shared event missing minted link/jobId: ${JSON.stringify(shared)}`);
  } else pass("customdomain:shared carries the minted link + job id");
  await page.close();
}

await browser.close();
server.close();

const failures = results.filter((r) => r.startsWith("FAIL"));
writeFileSync(join(shotsDir, "results.txt"), results.join("\n") + "\n");
console.log(results.join("\n"));
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : "\nALL SIMULATIONS PASSED");
process.exit(failures.length ? 1 : 0);
