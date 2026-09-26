# Changelog

Notable changes to the two packages published from this repo:
[`customdomain-js`](https://www.npmjs.com/package/customdomain-js) and
[`@customdomain/react`](https://www.npmjs.com/package/@customdomain/react). They are versioned
and released in lockstep, so one entry covers both, and the package a change lands in is named on
each line. `@customdomain/widget` is `private: true` and never published; it appears here only
when a change to it alters what an integrator sees through the hosted widget.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
`0.x`, so a minor bump may still carry a breaking type change; those are called out under
**Removed** or **Changed**.

Every version below is on npm with a provenance attestation from this repo's `release.yml`, has a
`vX.Y.Z` tag here, and has a [GitHub release](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/releases)
whose notes are the entry for that version.

## The two repositories

- **This repo** (`CUSTOM-DOMAIN-APP/customdomain-sdk`) is the **npm publishing source**. It
  carries what the product monorepo does not: `publishConfig` with provenance, the tag-driven
  release pipeline, the standalone CI, and the public READMEs.
- **The product monorepo** is where the source is **developed**. Its `packages/sdk`,
  `packages/react` and `packages/widget` are all `"private": true`, so it cannot publish over
  this repo.
- The two are **synced by hand**. Source files are copied across and are expected to be byte
  identical. Editing `packages/sdk/src/index.ts` in the monorepo ships nothing until that edit is
  carried here, tagged, and verified on the registry.

## How this file relates to releases

`.github/workflows/release.yml` publishes on a `v*` tag push (or a non-dry-run
`workflow_dispatch`), verifies the result on the live registry with `scripts/verify-release.sh`,
and then creates the GitHub release. The release notes are this file's section for the version,
extracted by `scripts/release-notes.sh`, so **update this file before you tag**. If the section is
missing, the workflow falls back to notes generated from commits and pull requests.

---

## [0.5.1] (2026-09-26)

Ported byte identical from the product monorepo's `packages/sdk/src` at `07a9358`. `packages/react/src`
is unchanged.

### Changed

- **`customdomain-js`**: both widget iframes (the one `open()` and `purchaseDomain()` create, and the
  one `loadSharedFlow()` creates) now carry `allow="clipboard-write"`, so the widget's Copy buttons
  (DNS records, the AI prompt) write to the clipboard directly from the cross-origin frame instead of
  through a fallback. It is write only: the widget cannot read the clipboard.
- **`customdomain-js`**: the three doc comments that ship in the type definitions (on `OpenConfig`,
  `theme` and `apiBase`) now use the CustomDomain™ brand.
- **`@customdomain/react`**: no source change. It depends on `customdomain-js@0.5.1`.

---

## [0.5.0] (2026-09-26)

Ported byte identical from the product monorepo's `packages/sdk/src` and `packages/react/src`.
Everything here is additive: no type was removed or narrowed.

### Added

- **`customdomain-js`**: `OpenConfig.getToken`, a function that returns a fresh widget token
  (mint it on your server with `POST /v1/tokens`). Widget tokens last about 15 minutes, and a user
  adding DNS records by hand often takes longer. When the widget reports that its token expired
  (the new `customdomain:token-expired` message), the SDK calls `getToken` and hands the result
  back, so the widget refreshes silently instead of stopping. Without `getToken`, or if it throws
  or returns nothing, the SDK answers at once and the widget tells the user they can close the
  window; the connection still finishes on its own once the records appear.
- **`customdomain-js`**: `OpenConfig.wwwRedirect` for root domains. `true` connects the root and
  `www` and redirects the root to `www`; `false` connects the root alone; unset lets the end user
  choose.
- **`customdomain-js`**: `OpenConfig.onFallback`, the `customdomain:fallback` window event and the
  `FallbackDetail` type (`{ reason, provider?, screen?, message? }`). They fire when the widget
  sends the user to copy records by hand instead of a one-click or sign-in flow, and say why:
  `no_end_user_rail`, `conflicts_exceed_tolerance`, `provider_unsupported` or `unknown_provider`.
- **`customdomain-js`**: `CheckDomainResult` now carries the control plane's rail verdict:
  `rails` (a `RailInfo` of `{ available, reason?, caveat? }` for `oauth`, `domainConnect`,
  `apiKey` and `manual`), `recommendedRail`, `endUserAutomatic`, `blockedReason`
  (`unregistered` or `platform_subdomain`), `dashboardUrl` and `nameservers`, each mapped from its
  snake_case wire name in `checkDomain()`. `supportsAutomatic` only ever meant that an adapter
  exists for the provider; `rails` says whether each rail can run for this domain right now.

### Changed

- **`customdomain-js`**: errors the widget reports are now also dispatched as the
  `customdomain:error` window event, `{ code, message, title?, details? }`. The event was
  documented, but a widget error used to reach only `onError`.
- **`customdomain-js`**: the init payload sent to the widget now includes `wwwRedirect` and
  `canRefreshToken` (true when `getToken` is set).
- **`@customdomain/react`**: no source change. It depends on `customdomain-js@0.5.0`, so
  `getToken`, `wwwRedirect` and `onFallback` are accepted as props and passed to the SDK. Its
  README now documents `onPurchase` and `purchaseDomain()`, which closes the known gap noted
  under 0.4.0, along with the new props.
- **Both packages**: descriptions and READMEs use the CustomDomain™ brand, and every README ends
  with the same support and license sections.

### Compatibility

- `getToken` and `wwwRedirect` are read by the hosted widget that ships with the next CustomDomain™
  product release. A hosted widget without that support ignores both, so setting them now is safe.
  `onFallback`, `customdomain:fallback`, `customdomain:error` and the `checkDomain` rail fields
  work with the hosted widget and API live today.

---

## [0.4.1] (2026-08-18)

Published from `5665302`, tag `v0.4.1`.

### Fixed

- **`customdomain-js`**: `checkRecords()` read a response shape the control plane never sent. It
  looked for a top-level `observed` array and an `in_sync` field, so every record came back
  `ok: false` and `inSync: false` even on a fully propagated domain. It now reads each record's
  own `observed` values and the boolean `drift`, and still accepts the older shape.

### Changed

- **`customdomain-js`**: the `dnsRecords` documentation now explains root domains: a `CNAME` is
  not allowed at a zone root, flattening providers accept your hostname there anyway, and
  providers without flattening (GoDaddy, Namecheap) need `A` records, a subdomain, or the reverse
  proxy edge. `POST /v1/domains:check` returns `integration_warnings` with code
  `supplied_apex_unrealizable` when this applies.
- **Both packages**: the npm `homepage` points at the product page, the keywords were extended,
  and the READMEs show monthly downloads.

---

## [0.4.0] (2026-07-28)

Published from `c3a612e`, tag `v0.4.0`. Everything here already existed in the monorepo and had
never reached npm; this release is the hand sync catching up. Source files were ported byte
identical.

### Added

- **`customdomain-js`**: `CheckDomainResult` carries the control plane's Public Suffix List parse
  of the checked domain: `subdomain`, `registrableDomain`, `publicSuffix`. These are the
  authoritative split, and exist so a client never has to guess one; the hand-maintained suffix
  lists they replaced produced wrong Domain Connect hosts and illegal root records on multi-label
  suffixes (`.co.uk`, `.s3.amazonaws.com`). `subdomain` is `""` when the checked domain *is* the
  registrable root: a verdict, not a missing value, so test it with `=== ""` rather than for
  falsiness.
- **`customdomain-js`**: the rest of the pre-flight the server already returned but the type
  omitted: `conflictTolerance`, `willFallbackToManual`, `apexSupported`, `apexMessage`. All seven
  new fields are mapped from their snake_case wire names in `checkDomain()`.
- **`customdomain-js`**: `WhiteLabel.fontUrl`, a stylesheet URL loaded into the widget iframe so a
  self-hosted `@font-face` is available to the widget's Shadow DOM. The widget already consumed it
  and the SDK forwards `whiteLabel` whole, so it always *worked* at runtime; it was simply
  inexpressible in TypeScript without a cast.
- **`@customdomain/react`**: the buy-a-domain rail, which was **absent from this wrapper
  entirely** while the SDK it wraps already dispatched `customdomain:purchase`. The
  `PurchaseInitiated` payload type is re-exported from the SDK, `onPurchase` is wired to the
  `customdomain:purchase` window event (previously dropped silently for every React consumer),
  and `purchaseDomain()` starts the flow. The last one is not a convenience: `open()` could not
  reach the buy screen at all, because the SDK gates it on a `purchase` flag that is not a member
  of `OpenConfig`.
- **Parity gates (both packages, type only)**: `packages/sdk/src/whitelabel-parity.assert.ts`
  asserts that every white-label key the widget reads is expressible on the SDK's `WhiteLabel`;
  `packages/react/src/sdk-parity.assert.ts` asserts that the React wrapper re-exports the SDK's
  purchase payload type and can both receive and start the purchase flow. They compile as part of
  each package's build, so a surface that drifts out of sync fails CI in the repo where publishing
  actually happens.
- **`@customdomain/widget`** (private; reaches users as the hosted `widget.js`): a failed or timed
  out connection shows the reason the control plane recorded (`error_code`, `error_message`)
  instead of generic timeout copy, falling back to that copy when there is no message.

### Changed

- **`@customdomain/react`**: `open()` and the new `purchaseDomain()` share one `sdkConfig()`
  helper, and the wrapper-only callbacks (stripped before the config reaches the SDK so window
  events do not fire twice) live in a named `WRAPPER_ONLY_KEYS` constant. No behavior change to
  `open()`.

### Known gap (closed in 0.5.0)

- The React README in this repo did not document `onPurchase` or `purchaseDomain()`.

---

## [0.3.0] (2026-07-22)

Published from `fb4b049`, tag `v0.3.0`. A **packaging and documentation release**: the source
files under `packages/sdk/src` and `packages/react/src` are byte identical to 0.2.0. No public API
changed.

### Added

- `release.yml` creates a GitHub release after a successful publish; `v0.3.0` was the first one.
- READMEs written for an npm audience, `llms.txt`, the hero images, and search keywords in both
  manifests.

---

## [0.2.0] (2026-07-22)

Published from `1055c8f`, tag `v0.2.0` (the tag was added on 2026-09-26, pointing at the commit
recorded in the npm provenance attestation). This was the first version published to npm, and the
first from this repo; the source changes in it were developed in the monorepo (`b3287ef`), where
the version bump from 0.1.0 is visible.

### Added

- **`customdomain-js`**: the purchase rail: a `customdomain:purchase` window event, the
  `PurchaseInitiated` payload type (`domain`, `sessionId`, `clientSecret`, `url`), and the handoff
  it represents. The widget cannot mount Stripe.js inside its own iframe, so it creates the
  checkout session on the server and hands it to the host, which mounts Embedded Checkout and then
  finalizes with `POST /v1/registrar/fulfill`.
- **`customdomain-js`**: `OpenConfig.endUserRef`, the integrator's own identifier for the end user
  a connect belongs to, sent to the control plane as `end_user_ref` so the console can show who
  connected a domain. Distinct from `userId`, which is only echoed back on step events.
- **`customdomain-js`**: `OpenConfig.managed`, which opts the Domain Connect flow into the durable
  asynchronous rail (ongoing DNS authority) instead of a one-shot connect. The control plane falls
  back to the synchronous redirect when the provider or deployment cannot do async, so enabling it
  never breaks a connect. Defaults to `false`.
- **`customdomain-js`**: `SuccessResult.alreadyConnected` (a resume of a live domain rather than a
  fresh connect), plus `processedDomains` and `pendingDomains` for multi-domain flows.
- **Repository**: `.github/workflows/release.yml`, which publishes both packages with `--provenance`.
  `@customdomain/react`'s `customdomain-js: workspace:*` dependency is rewritten to the concrete
  published version by `pnpm publish` (plain `npm publish` would not).
- **Repository**: `.github/workflows/ci.yml`, a recursive build and typecheck, plus a behavior
  gate that drives the real built bundles through headless Chromium (both connect journeys,
  locale, white-label theming, multi-domain, resume).
- **Both packages**: `publishConfig: { access: "public", provenance: true }` in both manifests, and `repository`,
  `homepage` and `bugs` pointing at `CUSTOM-DOMAIN-APP/customdomain-sdk`.

### Changed

- **`customdomain-js`**: `prefilledDomain` is forwarded to the widget **whole** (string or array);
  previously only the first entry survived, which silently truncated multi-domain flows.
- **`customdomain-js`**: `loadSharedFlow()` posts the init payload on `customdomain:ready`, so a
  resumed shared flow renders with the tenant's branding. `open()` and `loadSharedFlow()` share one
  `buildInitPayload()` so the two entry points cannot drift.

### Removed

Breaking for TypeScript consumers who referenced them (both were type level only):

- **`customdomain-js`**: `DNSRecord.fallbackValue`.
- **`customdomain-js`**: `OpenConfig.applicationUrl`.

---

## Earlier

`packages/sdk`, `packages/react` and `packages/widget` first appear in the monorepo on 2026-07-12,
already at version 0.1.0. Version 0.1.0 was never published to npm, and there is no usable history
before that point, so no 0.1.0 entry is reconstructed here.

[0.5.1]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/releases/tag/v0.2.0
