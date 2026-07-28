# Changelog

Notable changes to the two packages published from this repo — [`customdomain-js`](https://www.npmjs.com/package/customdomain-js)
and [`@customdomain/react`](https://www.npmjs.com/package/@customdomain/react). They are
versioned and released in lockstep, so one entry covers both; the package a change lands in
is named on each line. `@customdomain/widget` is `private: true` and never published — it
appears here only when a change to it alters what an integrator sees through the hosted
widget.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
`0.x`, so a minor bump may still carry a breaking type change — those are called out under
**Removed** / **Changed**.

## The two repositories

- **This repo** (`CUSTOM-DOMAIN-APP/customdomain-sdk`) is the **npm publishing source**. It
  carries what the monorepo does not: `publishConfig` with provenance, the `v*`-tag release
  pipeline, the standalone CI, and the public-facing READMEs.
- **The `custom-domains` monorepo** (`/home/user/custom-domains`) is where the source is
  **developed**. Its `packages/sdk`, `packages/react` and `packages/widget` are all
  `"private": true`, and its own publish workflow was deleted precisely so it cannot publish
  over this repo.
- The two are **hand-synced**. There is no automation between them: source files are copied
  across by a human (or an agent) and are expected to be byte-identical. Editing
  `packages/sdk/src/index.ts` in the monorepo ships nothing until that edit is carried here
  and tagged. Every entry below that reads "developed in the monorepo" is an instance of that
  gap.

## How this file relates to releases

`.github/workflows/release.yml` publishes on a `v*` tag push (or a non-dry-run
`workflow_dispatch`) and creates the GitHub Release with `gh release create --generate-notes`
— **the release notes are generated from commits and PRs, not from this file**. Nothing in CI
reads `CHANGELOG.md`. It exists for humans reading the repo or the npm page, and is
maintained by hand; a release will succeed whether or not it was updated.

## On the accuracy of the older entries

This repo's history before 0.4.0 is **a single squashed commit** (`fb4b049`, 2026-07-22),
which lands the entire tree at once. It preserves no record of how 0.1.0 → 0.2.0 → 0.3.0
happened. The 0.3.0 and 0.2.0 entries below are therefore **reconstructed** — from the
monorepo's `packages/` history, from file-content comparison between the two repos, and from
the monorepo's own audit docs. They are labelled where the evidence is thin, and where
something is genuinely unknown it says so instead of guessing.

---

## [0.4.0] — unreleased

Version bumped in both `package.json` files (`373f686`), but **not tagged and not published**.
The newest tag in this repo is `v0.3.0`, and `release.yml` only fires on a `v*` tag push, so
npm `latest` is still 0.3.0 for both packages. Tagging is a deliberate human step.

Everything here already existed in the monorepo and had never reached npm; this release is the
hand-sync catching up. Source files were ported byte-identical.

### Added

- **`customdomain-js`** — `CheckDomainResult` now carries the control plane's
  Public-Suffix-List parse of the checked domain: `subdomain`, `registrableDomain`,
  `publicSuffix`. These are the authoritative split, and exist so a client never has to guess
  one — the hand-maintained suffix lists they replaced produced wrong Domain Connect hosts and
  illegal apex records on multi-label suffixes (`.co.uk`, `.s3.amazonaws.com`). `subdomain` is
  `""` when the checked domain *is* the registrable apex: a verdict, not a missing value, so
  test it with `=== ""` rather than for falsiness.
- **`customdomain-js`** — the rest of the pre-flight the server already returned but the type
  omitted: `conflictTolerance`, `willFallbackToManual`, `apexSupported`, `apexMessage`. All
  seven new fields are mapped from their `snake_case` wire names in `checkDomain()`.
- **`customdomain-js`** — `WhiteLabel.fontUrl`, a stylesheet URL loaded into the widget iframe
  so a self-hosted `@font-face` is available to the widget's Shadow DOM. The widget has
  consumed this since WS7-F5 and the SDK forwards `whiteLabel` whole, so it always *worked* at
  runtime — it was simply inexpressible in TypeScript without a cast.
- **`@customdomain/react`** — the buy-a-domain rail, which was **absent from this wrapper
  entirely** while the SDK it wraps already dispatched `customdomain:purchase` and the widget
  already drove the flow. Three additions close it: the `PurchaseInitiated` payload type is
  re-exported from the SDK, `onPurchase` is wired to the `customdomain:purchase` window event
  (previously dropped silently for every React consumer), and `purchaseDomain()` starts the
  flow. The last one is not a convenience: `open()` could not reach the buy screen at all,
  because the SDK gates it on a `purchase` flag that is not a member of `OpenConfig`, so React
  consumers had no route in.
- **Parity gates (both packages, type-only)** — `packages/sdk/src/whitelabel-parity.assert.ts`
  and `packages/react/src/sdk-parity.assert.ts`. The first asserts that every white-label key
  the widget reads is expressible on the SDK's `WhiteLabel`; the second asserts that the React
  wrapper re-exports the SDK's purchase payload type (not a structural look-alike) and can
  both receive and start the purchase flow. They are compiled by each package's own `tsc`,
  which is that package's build — so a surface that drifts out of sync now **fails CI in the
  repo where publishing actually happens**, rather than shipping quietly. Both were verified to
  bite: deleting `fontUrl` from `WhiteLabel` fails the SDK typecheck with TS2344 rather than
  compiling vacuously.
- **`@customdomain/widget`** (private; reaches users as the hosted `widget.js`) —
  `Connection.error_code` / `error_message` passthrough. A failed or timed-out connection now
  shows the human-readable reason the control plane recorded, instead of the generic timeout
  copy; when the control plane set no message, it falls back to that copy, so nothing regresses.

### Changed

- **`@customdomain/react`** — `open()`'s body was factored into a shared `sdkConfig()` helper
  used by both `open()` and the new `purchaseDomain()`, and the wrapper-only callback list
  (stripped before the config reaches the SDK, to avoid double-firing events delivered through
  window listeners) moved to a named `WRAPPER_ONLY_KEYS` constant. No behavior change to
  `open()`.

### Known gap

- `packages/react/README.md` in **this** repo does not yet document `onPurchase` /
  `purchaseDomain()`; the monorepo's copy does. The 0.4.0 sync deliberately touched only source
  files, because the standalone READMEs carry npm-facing content the monorepo's do not and a
  blind copy would clobber it.

---

## [0.3.0] — 2026-07-22

The first release published from **this** repo, and — as far as the two repos' contents show —
a **packaging release only**. `packages/sdk/src/index.ts`, `packages/sdk/src/compat.ts` and
`packages/react/src/index.tsx` at this repo's root commit are md5-identical to the monorepo's
copies at the same date, which are the 0.2.0 sources. No public API changed.

> **Reconstructed, with a gap.** No commit in either repo records the 0.2.0 → 0.3.0 bump: this
> repo's root commit already contains 0.3.0, and the monorepo's `packages/*/package.json` still
> say 0.2.0 to this day. The dating comes from the `v0.3.0` tag and the root commit; the "no
> source change" claim is from direct file comparison, not from a changelog anyone wrote at the
> time.

### Added

- Standalone repo scaffolding: pnpm workspace, `LICENSE`, `llms.txt`, hero assets.
- `.github/workflows/release.yml` — publishes both packages on a `v*` tag with
  `--provenance` (npm Trusted Publishing preferred, `NPM_TOKEN` as the fallback), then creates
  the GitHub Release with auto-generated notes. `@customdomain/react`'s `customdomain-js:
  workspace:*` dependency is rewritten to the concrete published version by `pnpm publish`
  (plain `npm publish` would not).
- `.github/workflows/ci.yml` — recursive build + typecheck, plus a behavior gate that drives
  the real built bundles through headless Chromium (both connect journeys, locale, white-label
  theming, multi-domain, resume).
- READMEs rewritten for an npm audience: badges, a concrete "their own domain, not a subdomain
  of yours" framing, and the Entri migration shim described as a one-line script-tag swap.

### Changed

- `repository` / `homepage` / `bugs` in both manifests now point at
  `CUSTOM-DOMAIN-APP/customdomain-sdk` (previously the retired `custom-domain-app/customdomain-js`).
- `publishConfig: { access: "public", provenance: true }` lives here, and only here.
- In the monorepo (not shipped, but the other half of the split): `packages/sdk` and
  `packages/react` were marked `"private": true` and its stale `publish-packages.yml` was
  deleted, so the monorepo can no longer publish over this repo by accident.

---

## [0.2.0] — 2026-07-21

Developed in the monorepo (`b3287ef`, part of a large core-product audit-and-fix pass); shipped
to npm from this repo. This is the release the purchase rail and the multi-domain / shared-flow
work landed in.

> **Reconstructed** from the monorepo's `packages/sdk` diff for that commit. The version bump
> from 0.1.0 → 0.2.0 is visible there; what is *not* visible anywhere is whether 0.2.0 was ever
> published to npm — see the note at the end of this entry.

### Added

- **`customdomain-js`** — the purchase rail: a seventh window event `customdomain:purchase`,
  the `PurchaseInitiated` payload type (`domain`, `sessionId`, `clientSecret`, `url`), and the
  handoff it represents. The widget cannot mount Stripe.js inside its own iframe, so it creates
  the checkout session server-side and hands it to the host, which mounts Embedded Checkout and
  then finalizes via `POST /v1/registrar/fulfill`.
- **`customdomain-js`** — `OpenConfig.endUserRef`: the integrator's own identifier for the end
  user a connect belongs to, forwarded to the control plane as `end_user_ref` so the console can
  render "Connected by …" instead of a bare "Direct". Distinct from `userId`, which is only
  echoed back on step events.
- **`customdomain-js`** — `OpenConfig.managed`: opts the Domain Connect flow into the durable
  async rail (ongoing DNS authority) instead of a one-shot connect. The control plane falls back
  to the sync redirect when the provider or deployment cannot do async, so enabling it never
  breaks a connect. Defaults to `false`.
- **`customdomain-js`** — `SuccessResult.alreadyConnected` (distinguishes a resume of a
  live domain from a fresh connect), plus `processedDomains` / `pendingDomains` for
  multi-domain flows.

### Changed

- **`customdomain-js`** — `prefilledDomain` is now forwarded to the widget **whole** (string or
  array); previously only the first entry survived, which silently truncated multi-domain flows.
  The first entry is still what resolves the top-level domain and its record set.
- **`customdomain-js`** — `loadSharedFlow()` now posts the init payload on
  `customdomain:ready`, so a resumed shared flow renders with the tenant's branding instead of
  unbranded defaults. `open()` and `loadSharedFlow()` were refactored onto one
  `buildInitPayload()` so the two entry points cannot drift.

### Removed

Breaking for TypeScript consumers who referenced them (both were type-level only):

- **`customdomain-js`** — `DNSRecord.fallbackValue`.
- **`customdomain-js`** — `OpenConfig.applicationUrl`.

### Unverified

Whether 0.2.0 reached npm cannot be determined from either repo. There is no `v0.2.0` tag here
(the only tag is `v0.3.0`) and no tags at all in the monorepo. The monorepo's own
`publish-packages.yml` — the workflow that would have published it — was found stale at v0.2.0
and deleted, described at the time as "a downgrade below the version now live on npm via
customdomain-sdk's own release pipeline", which suggests something above 0.2.0 was already
published by then. Treat 0.2.0 as a development milestone rather than a confirmed npm release.

---

## Earlier

`packages/sdk`, `packages/react` and `packages/widget` first appear in the monorepo at
`78a337a` (2026-07-12) already at version 0.1.0, added wholesale inside a commit whose subject
is about unrelated Terraform work. There is no usable history before that point in either repo,
so no 0.1.0 entry is reconstructed here — inventing one would be pretending to precision that
does not exist.

[0.4.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/releases/tag/v0.3.0
