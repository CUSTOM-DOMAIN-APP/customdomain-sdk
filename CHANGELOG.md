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

- **This repo** (`CUSTOM-DOMAIN-APP/customdomain-sdk`) is the **only source** of both packages
  and the **npm publishing source**: changes are made here, released here with a `vX.Y.Z` tag,
  and verified on the registry here.
- **The product monorepo** holds no SDK source. Its `packages/sdk` and `packages/react` are the
  published npm tarballs, unpacked by its `scripts/vendor-sdk.sh <version>`, and the hosted
  bundle it serves (`app.customdomain.ai/widget-assets/customdomain-sdk.js`) is a copy of the
  vendored build. A release reaches the hosted bundle only after that script runs there and the
  product deploys.
- Up to 0.5.4 the source was developed in the monorepo and copied here by hand, so the entries
  for those versions say which monorepo commit they were byte identical to.

## How this file relates to releases

`.github/workflows/release.yml` publishes on a `v*` tag push (or a non-dry-run
`workflow_dispatch`), verifies the result on the live registry with `scripts/verify-release.sh`,
and then creates the GitHub release. The release notes are this file's section for the version,
extracted by `scripts/release-notes.sh`, so **update this file before you tag**. If the section is
missing, the workflow falls back to notes generated from commits and pull requests.

---

## [Unreleased]

## [0.5.8] (2026-10-31)

`getToken` is now told what the widget is asking for: the domain the end user typed, and whether
the token ran out or is not bound to that domain. Mint the token for that domain and your user
and the secure sign-in is accepted for it. Nothing was removed, and a `getToken` that takes no
argument works as before; one change to watch for is under **Changed**.

### Added

- **`customdomain-js`**: `OpenConfig.getToken` is now `(ctx?: TokenRequest) => string | Promise<string>`.
  The widget posts `customdomain:token-expired` with `{ domain, reason }` when its token expired
  (`reason: "expired"`) or is not bound to the domain the end user typed (`reason: "bind"`), and
  the SDK calls `getToken` with that as a `TokenRequest`: `{ domain?: string; reason: "expired" |
  "bind" }`. The payload comes from a frame, so it is checked: `domain` is passed only when it is a
  non-empty string of at most 253 characters, and `reason` is `"bind"` only for exactly that word.
  Anything else, including the empty payload an older hosted widget sends, reads as
  `{ reason: "expired" }` with no `domain` key. The call is still answered with `null` when there
  is no `getToken`, and when it throws, rejects or returns no string.
- **`customdomain-js`**: the exported type `TokenRequest`.
- **`@customdomain/react`**: re-exports `TokenRequest`. The `getToken` option of `useCustomdomain()`
  and `<CustomdomainConnect>` is the SDK's own, so it takes the same request, and its README says so.
  It depends on `customdomain-js@0.5.8`.
- **`customdomain-js`**: the doc of `RailInfo.reason` names two reasons that
  `rails.cloudBrowser` (the secure sign-in) gives for the caller rather than the provider:
  `caller_cannot_start` (an agent, a plain API call without the console, or a role that cannot
  write connections) and `token_not_bound` (the widget token is bound to no domain, or only to
  other domains, which is what `getToken` is asked to fix with `reason: "bind"`). The type is
  still `string`.
- **Repository**: runtime tests of the request `getToken` receives (a payload passed through, a
  malformed one, the 253 character limit, a function with no parameter, no `getToken`, a throw or
  a reject) in `packages/sdk/test/sdk.test.mjs`, and compile time asserts in
  `packages/react/src/sdk-parity.assert.ts` that the hook takes the same `getToken`.

### Changed

- **`customdomain-js`**: `getToken` is now always called with one argument, the `TokenRequest`.
  A function with no parameter ignores it. A function whose first parameter means something else
  (a retry count, say) would receive the request in it: TypeScript refuses such a function until
  its first parameter takes a `TokenRequest`, and plain JavaScript gets the object.

## [0.5.7] (2026-10-29)

`loadSharedFlow()` no longer sends the token you pass to a page of someone else's choosing. A
self-hosted deploy whose share link is not on the widget's origin must change one setting, under
**Changed**.

### Security

- **`customdomain-js`**: `loadSharedFlow()` opens only a link on the widget's own origin
  (`config.widgetBase`, else `https://app.customdomain.ai`) and throws a `CustomDomainError` with
  code `InvalidLinkError` for any other origin or scheme, so the token passed in `config` can no
  longer be sent to an attacker chosen page. A tenant hand-off page reads the link from its own
  query string, which anyone can write; before this, a crafted link was framed and then sent the
  token in the widget's init message. The check also refuses a link that is missing, empty or not
  a URL with the same error, and does so before anything is framed or an open modal is closed.

### Changed

- **`customdomain-js`**: a relative link given to `loadSharedFlow()` now resolves against
  `widgetBase` instead of always against the hosted widget, and a link on any other origin now
  throws instead of opening. A self-hosted deploy must serve its share link from the widget origin, which
  means `widgetBase` must be the origin the link is built on. The hosted share links are on
  `app.customdomain.ai`, so a default setup is unaffected.

## [0.5.6] (2026-10-25)

The `checkDomain` answer now names everything `POST /v1/domains:check` sends since the product's
Wave 2 release: the key a secure sign-in makes, the DNS hosting verdict, the kept keys that may act
for the domain, and a second provider. The SDK always passed the answer through, so these were on
the object at runtime; the 0.5.5 types did not name them. Nothing was removed; one union widens,
under **Changed**.

### Added

- **`customdomain-js`**: `RailInfo.key`, on an available `cloudBrowser` rail whose sign-in also
  makes a lasting API key: `rights` (what the key can do beyond DNS: `transfer`, `billing`,
  `account`, or none) and `endsInDays` (`null` for no end date), mapped from `ends_in_days`. The
  types also name `flow` and `managed` on an available `oauth` rail, which the server has sent
  since 0.5.4's answer and the types left out.
- **`customdomain-js`**: `rails.nameservers`, the DNS hosting verdict for the domain (`verdict`:
  `offered`, `offered_first`, `recommended` or `unavailable`, and `reason`), present when the
  application offers DNS hosting. It is distinct from the top level `nameservers`, the delegation
  the detector observed, which is unchanged.
- **`customdomain-js`**: `rails.savedAccess`: `available`, and `accounts`, each a `SavedAccess`
  (the workspace's kept provider keys that may act for the domain, best first), mapped to camel
  case (`accountId`, `providerName`, `ownerKind`, `applicationId`, `keyName`, `keyExpiresAt`,
  `lastUsedAt`). Only an API key caller gets any; a widget token, which is what a browser holds,
  gets `available: false` and no accounts, so a page never shows them.
- **`customdomain-js`**: `alsoProvider` (`provider`, `providerName` and
  `reason: "former_google_domains"`), set when the registrar and the nameservers name two
  providers.
- **`customdomain-js`**: the exported types `RailKey`, `DnsHostingVerdict`, `SavedAccess`,
  `SavedAccessRail` and `AlsoProvider`; `@customdomain/react` re-exports them.
- **Repository**: runtime tests of the new mapping, and of an answer without these fields leaving
  them absent, in `packages/sdk/test/sdk.test.mjs`.
- **Repository**: CI runs on `ubuntu-24.04`. `ubuntu-latest` became 26.04 on 2026-10-25, where
  Playwright 1.54.1 has no Chromium build, so the widget sim could not start.

### Changed

- **`customdomain-js`**: `CheckDomainResult.recommendedRail` also takes `"saved_access"` and
  `"cloud_browser"`, which the server has sent since the cloud browser rail and the Wave 2 release.
  A `switch` over the union that was exhaustive needs the two cases.
- **`@customdomain/react`**: no code change beyond the re-exports; depends on
  `customdomain-js@0.5.6`.

## [0.5.5] (2026-10-21)

The first release made in this repo rather than copied from the product monorepo, which now
vendors each release instead of carrying the source. Nothing was removed or narrowed; one union
widens, under **Changed**.

### Added

- **`customdomain-js`**: `OpenConfig.mode` accepts `"reconnect"`, the hosted widget's mode that
  opens straight on the sign-in that renews the lasting API key CustomDomain™ made at a domain's
  DNS provider: one sign-in, a new key, no DNS change. Address the domain with `connectionId`, or
  as `domain` / `prefilledDomain`, and mint the token for that domain and end user. The SDK always
  forwarded `mode` to the widget, so this worked at runtime; the 0.5.4 types named only
  `"connect"` and `"remove"`, so TypeScript callers had to cast.
- **`customdomain-js`**: `SuccessResult.reconnected`, which the widget sets (`true`) on the
  `customdomain:success` that ends a reconnect, together with `setupType: "reconnect"`.
- **`customdomain-js`**: `CheckDomainResult.advisories`, mapped from `advisories` in the
  `POST /v1/domains:check` answer: warnings that replace nothing, such as a CAA record that blocks
  Let's Encrypt (kind `caa-blocks-letsencrypt`). They never count toward `willFallbackToManual`.
- **`@customdomain/react`**: no new export is needed. The hook's options and `open()`'s overrides
  take the SDK's own `OpenConfig`, so `mode: "reconnect"` and `connectionId` type-check, and
  `onSuccess` receives `reconnected`. Its README shows a reconnect. It depends on
  `customdomain-js@0.5.5`.
- **Both packages**: `packages/sdk/src/open-mode-parity.assert.ts` mirrors the widget's list of
  modes in both directions, and `packages/react/src/sdk-parity.assert.ts` asserts that the hook
  accepts every SDK mode and types `reconnected`. Both are compile time and fail the build on drift.
- **Repository**: runtime tests of the built SDK bundle in `packages/sdk/test/` (Node's test
  runner, no browser): what `open()` hands the widget for a reconnect by id and by domain, the
  reconnect success reaching `onSuccess` and the window event, `removeDomain()` still forcing
  `"remove"`, and the `advisories` mapping. `pnpm -r test` runs them, and `ci.yml` after the typecheck.

### Changed

- **`customdomain-js`**: `SetupType` gains `"reconnect"`. A `switch` over
  `SuccessResult.setupType` that proves exhaustiveness with `never` needs a case for it.
- **Both packages**: the READMEs document `mode`, reconnecting a domain and `reconnected`, and the
  SDK's pre-flight table lists `advisories`.
- **Repository**: `scripts/verify-release.sh` polls the packument the way it polls dist-tags. The
  0.5.2 release run failed on a publish that had landed, because `@customdomain/react`'s packument
  did not list 0.5.2 yet when its dist-tag already did.

### Compatibility

- `mode: "reconnect"` is read by the hosted widget at app.customdomain.ai today.
- `advisories` is filled once the control plane returns it (CUSTOM-DOMAIN-APP/custom-domains#258).
  Until then it is absent and a CAA record that blocks Let's Encrypt still arrives in
  `recordConflicts`, so read both.

## [0.5.4] (2026-10-15)

`packages/sdk/src/index.ts` and `packages/react/src/index.tsx` are byte identical to the product
monorepo's (mirror pull request: CUSTOM-DOMAIN-APP/custom-domains#284). Everything here is additive: no type
was removed or narrowed, and the hosted bundle (`dist/customdomain-sdk.js`) is still built with the
same command.

### Added

- **`customdomain-js`**: `checkDomain` maps every field `POST /v1/domains:check` returns. New on
  `CheckDomainResult`: `detectionError`, `targetMode`, `apexStrategy`, `apexRecordType`,
  `apexTargets`, `integrationWarnings`, `managedDns`, `sandbox` and `rails.cloudBrowser`. New
  exported types `IntegrationWarning` and `ManagedDnsAvailability`.
- **`customdomain-js`**: `checkDomain(domain, { token, dnsRecords })` sends the records you intend
  to write, so conflict detection and `willFallbackToManual` run against them and
  `integrationWarnings` can come back. Without `dnsRecords` the request is unchanged.
- **`customdomain-js`**: `CustomDomainError.status`, the HTTP status of the control plane response
  an error came from (unset for errors raised by the widget or the SDK). The README's "Errors and
  retries" section says which errors are safe to retry.
- **`@customdomain/react`**: re-exports `FallbackDetail`, `RailInfo`, `IntegrationWarning` and
  `ManagedDnsAvailability`.
- **Both packages**: a CommonJS build (`dist/index.cjs` with `dist/index.d.cts`) next to the ESM
  one, an `exports` map that resolves types for `import` and `require`, `engines.node >= 18`, and
  source maps for the JavaScript and the declarations. `@customdomain/react` declares
  `sideEffects: false`. `customdomain-js` does not, because importing it creates the shared
  `customdomain` instance, assigns `window.customdomain` and installs the `window.entri` shim.

### Fixed

- **`customdomain-js`**: the ES module entry (`dist/index.js`) imported `./compat` without a file
  extension, so Node could not load the package without a bundler (server rendering, tests). Both
  packages now ship their ESM and CommonJS entries as single bundled files; `tsc` emits only the
  declarations. The exports map also keeps `customdomain-js/dist/*` reachable for anyone who
  loads the hosted bundle file from `node_modules`.

### Changed

- **`customdomain-js`** README: `checkDomain` and `checkRecords` rows name what they throw and
  resolve to, `load()` says it resolves at once and opens nothing, `container` says it renders a
  flat panel inside a positioned element and implies `whiteLabel.embedded`, and the pre-flight
  section lists every `CheckDomainResult` field.
- **`@customdomain/react`** README lists every re-exported type.

## [0.5.3] (2026-10-14)

`packages/sdk/src/index.ts` is byte identical to the product monorepo's at `7496a97`
([CUSTOM-DOMAIN-APP/custom-domains#264](https://github.com/CUSTOM-DOMAIN-APP/custom-domains/pull/264)).
No type changed.

### Changed

- **`customdomain-js`**: `open()` warns once in the browser console when `dnsRecords` holds records other
  than DKIM ones. Those records were always ignored, silently: the records a customer is shown and checked
  against come from the server (the application's connect target, or `PUT /v1/connections/{id}/records`).
- **`customdomain-js`**: the `dnsRecords` documentation says only DKIM records are used, and its root
  domain note is corrected: a Route 53 alias can only target AWS resources (it cannot take your hostname at a
  root), and Namecheap does have ALIAS. Give the connect target `apex_ipv4` for providers with neither.

## [0.5.2] (2026-10-09)

`packages/sdk/src/index.ts` is byte identical to the product monorepo's at `a5e00d8f`, which
already carried the removal flow and the dark mode logos; the published 0.5.1 types predate them.
`@customdomain/react` gains the matching handler and entry point. Everything here is additive: no
type was removed or narrowed.

### Added

- **`customdomain-js`**: `CustomDomain.removeDomain(config)`, which opens the widget on the removal
  flow for a connected domain. The widget shows the DNS records that were added, asks whether to
  remove or keep them, and asks the user to sign in once more when the access used to connect was
  not kept. Pass `connectionId`, or the domain as `domain` / `prefilledDomain`, and mint the token
  for that domain and end user.
- **`customdomain-js`**: `OpenConfig.mode` (`"connect"` or `"remove"`, which `removeDomain()` sets)
  and `OpenConfig.connectionId`.
- **`customdomain-js`**: `OpenConfig.onRemoved`, the `customdomain:removed` window event and the
  `RemovedResult` type (`{ domain, connectionId?, records, removed, restored, leftInPlace, user? }`).
  They fire when a removal finishes; `records` says what happened to the DNS records
  (`removed`, `partly_removed`, `kept`, `manual`, `in_use` or `not_needed`).
- **`customdomain-js`**: `WhiteLabel.logoDark`, a separate logo for dark mode, and
  `WhiteLabel.logoPlate`, which shows the light `logo` on a small light plate in dark mode when
  there is no `logoDark`. The widget has read both for a while; the published types lacked them,
  so TypeScript integrators needed a cast.
- **`@customdomain/react`**: the `onRemoved` callback prop (`RemovedResult`), the `removeDomain()`
  function on the `useCustomdomain` result, and the `RemovedResult` type re-export.

### Changed

- **Both packages**: the compile time parity checks (`whitelabel-parity.assert.ts` and
  `sdk-parity.assert.ts`) now cover these members. The white-label check also runs in the other
  direction, so a key that is in `WhiteLabel` but not in the widget's list fails the build.
- **Docs**: the provider numbers in the READMEs and `llms.txt` are current: 178 catalogued
  providers, 62 with an automatic write path (55 provider API, 6 OAuth, 1 Domain Connect) and 116
  guided manual, verified against `GET https://api.customdomain.ai/v1/providers/census` on
  2026-10-09. They said 63 and 25. Both READMEs document the removal flow and the dark mode logos.

### Compatibility

- `removeDomain()`, `logoDark` and `logoPlate` are read by the hosted widget. A hosted widget that
  predates them ignores the fields, so setting them is safe.

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

[0.5.5]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/releases/tag/v0.2.0
