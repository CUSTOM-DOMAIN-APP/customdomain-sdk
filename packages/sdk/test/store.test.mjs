// 0.6: the setup store, the Svelte and Vue bindings, the test helper and the pinned widget protocol, run against the
// BUILT files (dist/), which is what npm ships. `pnpm -r build` first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSetupStore } from "../dist/store.js";
import { toReadable } from "../dist/svelte.js";
import { simulateSetup } from "../dist/testing.js";
import { useSetupState } from "../dist/vue.js";
import { effectScope } from "vue";

const protocol = JSON.parse(readFileSync(new URL("../protocol/protocol.json", import.meta.url), "utf8"));

test("the store follows a successful setup and still calls the integrator's callbacks", () => {
  const store = createSetupStore();
  const seen = [];
  let changes = 0;
  store.subscribe(() => changes++);
  assert.equal(store.getSnapshot().phase, "idle");
  const config = store.bind({ token: "t", onSuccess: (r) => seen.push(r.domain), onClose: () => seen.push("closed") });
  assert.equal(store.getSnapshot().phase, "open");
  const before = store.getSnapshot();
  simulateSetup(config, { kind: "success" }, { domain: "shop.acme.com", provider: "Cloudflare" });
  const s = store.getSnapshot();
  assert.notEqual(s, before, "a new snapshot object on change");
  assert.equal(s.phase, "success");
  assert.equal(s.result.domain, "shop.acme.com");
  assert.equal(s.step.step, "FINISHED_SUCCESSFULLY");
  assert.deepEqual(seen, ["shop.acme.com", "closed"]);
  assert.ok(changes >= 5);
  assert.throws(() => (s.phase = "x"), "snapshots are frozen");
  store.reset();
  assert.equal(store.getSnapshot().phase, "idle");
});

test("errors, fallbacks and a cancel", () => {
  const store = createSetupStore();
  simulateSetup(store.bind({ token: "t" }), { kind: "error", code: "provider_error", message: "No." }, { domain: "a.com" });
  assert.equal(store.getSnapshot().phase, "closed");
  assert.deepEqual(store.getSnapshot().error, { code: "provider_error", message: "No." });
  simulateSetup(store.bind({ token: "t" }), { kind: "fallback", reason: "provider_unsupported" }, { domain: "a.com" });
  assert.equal(store.getSnapshot().fallback.reason, "provider_unsupported");
  assert.equal(store.getSnapshot().error, undefined, "bind starts a fresh session");
  simulateSetup(store.bind({ token: "t" }), { kind: "cancel" }, { domain: "a.com" });
  assert.equal(store.getSnapshot().phase, "closed");
});

test("the Svelte readable calls back at once, then on change, and unsubscribes", () => {
  const store = createSetupStore();
  const got = [];
  const stop = toReadable(store).subscribe((v) => got.push(v.phase));
  store.bind({ token: "t" });
  stop();
  store.reset();
  assert.deepEqual(got, ["idle", "open"]);
});

test("the Vue ref follows the store and stops with its scope", () => {
  const store = createSetupStore();
  const scope = effectScope();
  const ref = scope.run(() => useSetupState(store));
  store.bind({ token: "t" });
  assert.equal(ref.value.phase, "open");
  scope.stop();
  store.reset();
  assert.equal(ref.value.phase, "open", "no update after the scope ended");
});

test("the simulator speaks the widget's protocol", () => {
  const statuses = new Set(protocol.types.Status);
  const setupTypes = new Set(protocol.types.SetupType);
  for (const outcome of [{ kind: "success" }, { kind: "error", code: "x" }, { kind: "fallback", reason: "provider_unsupported" }, { kind: "cancel" }]) {
    let result;
    const steps = simulateSetup({ token: "t", onSuccess: (r) => (result = r) }, outcome, { domain: "a.com" });
    for (const s of steps) assert.ok(statuses.has(s), `status ${s} is in protocol.json`);
    if (result) {
      assert.ok(setupTypes.has(result.setupType));
      for (const k of Object.keys(result)) assert.ok(k in protocol.events["customdomain:success"].payload, `success key ${k}`);
    }
  }
  assert.ok(new Set(protocol.types.FallbackReason).has("provider_unsupported"));
});
