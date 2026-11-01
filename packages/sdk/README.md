# customdomain-js

[![npm](https://img.shields.io/npm/v/customdomain-js?style=flat&color=1c1917)](https://www.npmjs.com/package/customdomain-js)
[![downloads](https://img.shields.io/npm/dm/customdomain-js?style=flat&color=1c1917&label=downloads%2Fmonth)](https://www.npmjs.com/package/customdomain-js)
[![docs](https://img.shields.io/badge/docs-docs.customdomain.ai-1c1917?style=flat)](https://docs.customdomain.ai/docs/widget-sdk/overview)
[![license](https://img.shields.io/badge/license-Apache--2.0-1c1917?style=flat)](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE)

The official JavaScript SDK for [CustomDomain™](https://customdomain.ai). Let your users connect
**their own domain** (`acme.com`, not `acme.yourapp.com`) to your SaaS in one click. Provider
detection across 178 DNS and registrar providers, the DNS records, domain verification and the TLS certificate
all happen behind the scenes: you open a widget and listen for one event.

[Website](https://customdomain.ai) · [Docs](https://docs.customdomain.ai/docs) · [Console](https://app.customdomain.ai) · [Widget and SDK reference](https://docs.customdomain.ai/docs/widget-sdk/reference) · [Changelog](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/CHANGELOG.md)

## Install

The hosted script is always current and needs no build step:

```html
<script src="https://app.customdomain.ai/widget-assets/customdomain-sdk.js"></script>
```

Or install from npm for bundlers and TypeScript:

```sh
npm install customdomain-js
# React apps: npm install @customdomain/react
```

The package ships an ES module build and a CommonJS build, each with type declarations and
source maps, so `import` and `require` both resolve with types. It runs in browsers; importing it
on a server needs Node 18 or newer and only creates the `customdomain` instance (nothing touches
`document` until you call `open()`).

## Quickstart

Mint a short-lived widget token on your server with `POST /v1/tokens` (never ship an API key to
the browser), then open the widget:

```js
import { customdomain } from "customdomain-js";

customdomain.open({
  applicationId: "app_123",
  token: tokenFromYourServer,
  // Optional: return a fresh token when the first one expires in the middle of a setup, or a token
  // for the domain the user typed (see "Tokens for the domain the user typed" below).
  getToken: () =>
    fetch("/api/customdomain/token", { method: "POST" })
      .then((r) => r.json())
      .then((body) => body.token),
});

window.addEventListener("customdomain:success", (e) => {
  console.log("connected:", e.detail.domain, "already connected?", e.detail.alreadyConnected);
});
```

No DNS provider SDKs, no ACME client, no polling loop. The widget handles root domains, `www`,
and certificate renewal for the lifetime of the connection.

## Methods

The npm build exports `customdomain` (a ready instance) and the `CustomDomain` class. The hosted
script exposes the same instance as `window.customdomain`.

| Method | Purpose |
|---|---|
| `open(config)` | Open the connect widget, or the flow `mode` names. Returns `{ close }`. |
| `checkDomain(domain, { token, dnsRecords? })` | Pre-flight a domain: provider, which connection rails can run, root-domain support, record conflicts, and the Public Suffix List split. Pass `dnsRecords` to check conflicts against the records you intend to write. Every field is listed under [Pre-flight with `checkDomain`](#pre-flight-with-checkdomain). Throws a `CustomDomainError` with `status` set, see [Errors and retries](#errors-and-retries). |
| `checkRecords(domain, { token, dnsRecords })` | Check a record set against live public DNS. Resolves to `{ domain, inSync, records }`, one entry per record with the values observed. Throws like `checkDomain`. |
| `getNameserverMove(connectionId, { token, apiBase? })` | A connection's nameserver move: its state, the old and new nameservers, what it waits on and what to do next. Resolves `null` when no move was started. See [Nameserver moves](#nameserver-moves). |
| `startNameserverMove(connectionId, consent, { token, apiBase?, copyReviewed? })` | Start the move, or resume the open one, with the consent the end user gave. `consent` (`{ id, version }`) is required by the type and checked when called. |
| `rollbackNameservers(connectionId, target?, { token, apiBase? })` | Move the nameservers back, to `previous` or `registrar_default`; with no target the API chooses. |
| `getConnection(connectionId, { token, apiBase? })` | Read a connection: its identity, status and `dnsHosting`, who runs the domain's DNS. See [Who runs a domain's DNS](#who-runs-a-domains-dns). |
| `purchaseDomain(config)` | Open the widget on the buy-a-domain screen. |
| `removeDomain(config)` | Open the widget on the removal flow for a connected domain. Pass `connectionId`, or the domain as `domain` / `prefilledDomain`. Returns `{ close }`. See [Removing a domain](#removing-a-domain). |
| `loadSharedFlow(url, config?)` | Resume a shared "finish setup" link with your branding. The link must be on the widget's own origin (`config.widgetBase`, or `https://app.customdomain.ai` by default), because the token you pass in `config` is sent to the page it opens. Any other link, a missing one or one that is not a URL included, throws a `CustomDomainError` with code `InvalidLinkError` and opens nothing, so a hand-off page can pass it the `link` query parameter as it arrives. |
| `load()` | Resolves at once: the npm build is ready as soon as it is imported. It exists so code written for the hosted loader (`await customdomain.load()`) runs unchanged. It does not open anything; `open()` does. |
| `close()` | Close the widget. |

## Options

The ones most integrations use. The full list is in the
[widget and SDK reference](https://docs.customdomain.ai/docs/widget-sdk/reference).

| Option | Type | What it does |
|---|---|---|
| `applicationId` (required) | `string` | Your public application id. |
| `token` (required) | `string` | A widget token minted on your server with `POST /v1/tokens`. |
| `getToken` | `(ctx?: TokenRequest) => string \| Promise<string>` | Returns a fresh widget token. Widget tokens last about 15 minutes, and a user adding DNS records by hand often takes longer. With `getToken` the widget refreshes silently instead of stopping; without it, the widget tells the user they can close the window, and the connection still finishes on its own once the records appear. When the widget names the domain the user typed, `ctx` carries it, so you can mint a token bound to that domain; see [Tokens for the domain the user typed](#tokens-for-the-domain-the-user-typed). A function with no parameter works as before. |
| `wwwRedirect` | `boolean` | Root domains only. `true` connects the root and `www` and redirects the root to `www`; `false` connects the root alone; leave it unset to let the user choose. |
| `domain` / `prefilledDomain` | `string` / `string \| string[]` | Pre-fill the domain. An array runs a multi-domain flow. |
| `dnsRecords` | `DNSRecord[] \| Record<string, DNSRecord[]>` | Only DKIM records are used (`purpose: "dkim"`, or a host under `_domainkey`); any other record is ignored, and `open()` says so once in the console. The records a customer is shown come from the server: set where domains point with `PUT /v1/applications/{id}/connect-target`, or one connection's records with `PUT /v1/connections/{id}/records`. |
| `whiteLabel` | `WhiteLabel` | Colors, fonts, logo, copy, icons and dark mode, so the flow reads as your product. |
| `locale` | `string` | UI language. |
| `endUserRef` | `string` | Your id for this customer. Stored on the connection and shown in the console. |
| `container` | `string` | Embedded mode: CSS selector of an element on your page to render inside, as a flat panel, instead of the fullscreen modal. The element must be positioned (the widget fills it with `position: absolute; inset: 0`), and `whiteLabel.embedded` is set for you. `open()` throws when nothing matches the selector. |
| `mode` | `"connect" \| "remove" \| "reconnect"` | The flow the widget opens on. `connect` is the default; `remove` is what `removeDomain()` sets; `reconnect` renews the domain's lasting API key with one sign-in, see [Reconnecting a domain](#reconnecting-a-domain). |
| `connectionId` | `string` | For `remove` and `reconnect`: the connection, when you kept its id. Otherwise the prefilled domain is looked up. |
| `onSuccess`, `onClose`, `onStepChange`, `onError`, `onFallback`, `onRemoved` | functions | Callbacks, delivered in addition to the window events below. |

## Tokens for the domain the user typed

A widget token can be bound to one domain and one end user: `POST /v1/tokens` takes `domain` and
`end_user_ref`. The secure sign-in is refused for a token that is bound to no domain, or only to
other domains: `checkDomain` answers `rails.cloudBrowser.reason: "token_not_bound"`, and starting
the sign-in with that token is refused with a `403` of the same name. The user types the domain
after your page has minted its token, so a widget that knows the domain can ask `getToken` for a
token for it. `getToken` is called with a `TokenRequest`, built from what the widget sends:

| Field | Type | Meaning |
|---|---|---|
| `domain` | `string`, optional | The domain the user typed, which the token should be bound to. Absent when the widget names none (the hosted widget names none yet, see the end of this section); a value that is not a non-empty string of at most 253 characters is dropped. |
| `reason` | `"bind" \| "expired"` | `bind`: the token in use is not bound to `domain`. `expired`: the token ran out; when `domain` is set, mint the new one for it too so it stays bound. Anything else the widget sends reads as `expired`. |

```ts
import { customdomain } from "customdomain-js";

customdomain.open({
  applicationId: "app_123",
  token: tokenFromYourServer,
  endUserRef: user.id,
  // ctx is a TokenRequest (exported by this package), typed optional so that a function with no
  // parameter is accepted too.
  getToken: (ctx) =>
    fetch("/api/customdomain/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: ctx?.domain }), // left out of the JSON when undefined
    })
      .then((r) => r.json())
      .then((body) => body.token),
});
```

Your route mints with `POST /v1/tokens`. Take `domain` from the request, and `end_user_ref` from
your own signed-in session, never from the request body: the browser chooses the domain, and only
your server knows who the user is. The `domain` is only ever a name to bind the token to, so check
it is a hostname before you pass it on.

A `getToken` that takes no argument keeps working: it ignores the request and answers a fresh
token, which is all an expiry needs. A widget that sends no payload, or one the SDK cannot read,
gets `getToken` called with `{ reason: "expired" }`. Until the hosted widget is updated to send the
domain and the reason, that is what it always does, so `getToken` is called with
`{ reason: "expired" }` and never `"bind"`, and a release reaches the hosted bundle only after it
is vendored (see [The two repositories](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/CHANGELOG.md#the-two-repositories)).

## Events

Every callback also arrives as a window `CustomEvent`, so you can listen from anywhere.

| Window event | Callback | Detail |
|---|---|---|
| `customdomain:success` | `onSuccess` | `{ jobId, domain, setupType, provider?, alreadyConnected?, reconnected?, processedDomains?, pendingDomains? }`. After a reconnect, `setupType` is `reconnect` and `reconnected` is `true`. |
| `customdomain:close` | `onClose` | `{ lastStatus?, error?, shared?, manualScreenDisabled? }` |
| `customdomain:step` | `onStepChange` | `{ step, domain?, provider?, user?, pendingDomains?, processedDomains?, error? }` |
| `customdomain:error` | `onError` | `{ code, message, title?, details? }`. `onError` receives a `CustomDomainError`. |
| `customdomain:fallback` | `onFallback` | `{ reason, provider?, screen?, message? }`. Fires when the widget sends the user to copy records by hand instead of a one-click or sign-in flow. `reason` is one of `no_end_user_rail`, `conflicts_exceed_tolerance`, `provider_unsupported`, `unknown_provider`. |
| `customdomain:purchase` | none | `{ domain, sessionId?, clientSecret?, url? }`: mount Stripe Embedded Checkout with `clientSecret`, then finalize with `POST /v1/registrar/fulfill`. |
| `customdomain:removed` | `onRemoved` | `{ domain, connectionId?, records, removed, restored, leftInPlace, user? }`. Fires when a removal started with `removeDomain()` finishes. See [Removing a domain](#removing-a-domain). |
| `customdomain:shared` | none | A shared setup link was created. |
| `customdomain:request-close` | none | The user asked to close while `whiteLabel.delegateClose` is set; call `close()` when you are ready. |
| `customdomain:doc-click` | none | The user opened a documentation link. |

### White-label logos

`whiteLabel.logo` is the logo the widget shows (an `https:` URL or a base64 image). Two more keys
cover dark mode, used when `whiteLabel.darkMode` turns it on:

- `logoDark`: a separate logo for dark mode. When it is set, dark mode shows it instead of `logo`.
- `logoPlate`: for a logo drawn for light pages, with no `logoDark`. Dark mode shows `logo` on a
  small light plate so it stays readable. It has no effect when `logoDark` is set.

```ts
customdomain.open({
  applicationId: "app_123",
  token,
  whiteLabel: {
    darkMode: "auto",
    logo: "https://cdn.example.com/logo-light.svg",
    logoDark: "https://cdn.example.com/logo-dark.svg",
  },
});
```

## Removing a domain

`removeDomain(config)` opens the widget on the removal flow for a domain you connected earlier.
Mint the token for that domain and end user (`POST /v1/tokens` with `domain` and `end_user_ref`):
an end user's token bound to neither cannot remove it. Pass the `connectionId` if you kept it, or
the domain as `domain` / `prefilledDomain`; it is looked up.

The widget shows the DNS records that were added and asks whether to remove or keep them. If the
access used to connect was not kept, it asks the user to sign in once more first. When the removal
finishes, `onRemoved` (and the `customdomain:removed` window event) receives:

| Field | Meaning |
|---|---|
| `domain` | The domain that was removed. |
| `connectionId` | The connection, when known. |
| `records` | What happened to the DNS records: `removed` (every record we added is gone), `partly_removed`, `kept` (the user kept them), `manual` (the user deletes them; the widget listed how), `in_use` (another application still serves the domain) or `not_needed`. |
| `removed`, `restored`, `leftInPlace` | Lists of `{ type, name, value }` records: deleted, put back to their earlier value, and left at the provider. |
| `user` | The `userId` you passed to `open`, echoed back. |

The widget stays on its summary, with any records left for the user to delete, until the user
closes it.

```ts
customdomain.removeDomain({
  applicationId: "app_123",
  token, // minted for this domain and end user
  connectionId,
  onRemoved: (r) => console.log(r.domain, r.records),
});
```

## Reconnecting a domain

When a domain is connected with secure sign-in, CustomDomain™ makes a lasting API key at the DNS
provider where the provider allows it, and keeps it. When that key nears its end, or the provider
stops accepting it, `open({ mode: "reconnect" })` opens straight on the sign-in that renews it: one
sign-in, a new key, and no DNS record changes. Address the domain the way a removal does: the `connectionId` if you
kept it, or the domain as `domain` / `prefilledDomain`. Mint the token for that domain and end user.
A domain with no such key gets a short notice instead.

It ends in the same `onSuccess` (and `customdomain:success`) as a connect, with
`setupType: "reconnect"` and `reconnected: true`, so check `reconnected` before you treat the
success as a new domain.

```ts
customdomain.open({
  applicationId: "app_123",
  token, // minted for this domain and end user
  mode: "reconnect",
  connectionId,
  onSuccess: (r) => {
    if (r.reconnected) console.log(`${r.domain}: access renewed`);
  },
});
```

More on lasting API keys: [Secure sign-in](https://docs.customdomain.ai/docs/guides/secure-sign-in#reconnect).

## Nameserver moves

When your application offers DNS hosting (its `nameserver_migration` setting is `offer` or `prefer`),
an end user can let CustomDomain™ host their domain's DNS by moving its nameservers, with their
consent. The hosted widget shows that offer and runs the move. These three methods drive the same
move from your own page, with the end user's widget token (`POST /v1/tokens` with `domain` and
`end_user_ref`) over the routes the widget calls:

| Method | Route | Resolves |
|---|---|---|
| `getNameserverMove(connectionId, { token })` | `GET /v1/connections/{id}/nameservers` | The `NameserverMove`, or `null` when no move was started (the API answers 404; an unknown connection id reads the same). |
| `startNameserverMove(connectionId, consent, { token, copyReviewed? })` | `POST /v1/connections/{id}/nameservers:migrate` | The move as far as it got. |
| `rollbackNameservers(connectionId, target?, { token })` | `POST /v1/connections/{id}/nameservers:rollback` | The move, `rolled_back` once the move back is made. |

Each also takes `apiBase`, like `checkDomain`. `connectionId` is the id you kept from the connect
(`jobId` of `customdomain:success`).

```ts
// The id and version of the consent text your page showed the end user (see "Consent is required").
const consent = { id: "nsm-consent", version: shownVersion };

let move = await customdomain.startNameserverMove(connectionId, consent, { token });
while (!["active", "failed", "rolled_back"].includes(move.state)) {
  await sleep(10_000);
  move = (await customdomain.getNameserverMove(connectionId, { token })) ?? move;
}
if (move.state === "failed" && move.canRollback) {
  // Or rollbackNameservers(connectionId, "previous" | "registrar_default", { token }).
  await customdomain.rollbackNameservers(connectionId, { token });
}
```

**Consent is required.** `startNameserverMove` takes `{ id, version }`, the id and version of the
consent text the end user agreed to. The move stores them with the time they agreed, never the
person's address, so they must be those of the text your page actually showed. The type requires
them, and the method checks them: a missing consent, or one whose `id` or `version` is blank or not a
string, rejects with a `CustomDomainError` of code `InvalidConsentError` before anything is sent.
The API accepts only a text the hosted widget shows, and answers `400` `invalid_request` for any
other. Today that is id `nsm-consent`, versions `1` to `3`, and the hosted widget shows the newest.
The wording, with the placeholders it fills (your application's name and the domain), and the
versions are published in
[What your users see](https://docs.customdomain.ai/docs/guides/nameserver-migration#what-your-end-user-sees).
Show that text, and send the version of the one you showed.

**Reading a move.** `state` moves through `pending`, `copying`, `needs_review`, `needs_dnssec_off`,
`waiting_ds`, `setting` and `propagating` (a move passes only the ones it needs) to `active`, and
`failed` and `rolled_back` end it too. Poll while it is none of those three.

- `nextStep` is one sentence for the person.
- `nextAction` is the one request that presses the move on, or `null` when nothing is waiting for a
  press: `retry` is `startNameserverMove` again, `rollback` is `rollbackNameservers`, and `sign_in` is
  the registrar sign-in the hosted widget runs, which has no method here.
- A move in `needs_review` has a copy of the domain's records that is not proven complete. Show
  `copyWarnings`, and when the person has checked them call `startNameserverMove` again with
  `copyReviewed: true`. A widget token may send it only for a move already in `needs_review`.

Every field is listed on the exported `NameserverMove` type. One the API did not send is absent, and
the lists, counts and flags read as empty, zero and false.

**Rolling back.** `target` is `previous` (the nameservers the domain had; refused with
`old_dns_gone` once they no longer answer for the zone) or `registrar_default` (the registrar's own
DNS). With none, the API picks: `previous` while the old nameservers still answer, else
`registrar_default` (`rollbackDefault` on the move says which). A widget token may choose the target
but may not send a registrar key.

**Refusals.** Every call rejects with a `CustomDomainError` (`code`, `message`, `details?`,
`status`) when the API refuses; see [Errors and retries](#errors-and-retries). These are the codes a
widget token can get, the `NameserverMoveErrorCode` type, with the calls each applies to (`details`
says more for most of them):

| Code | Status | Calls | Meaning |
|---|---|---|---|
| `invalid_request` | 400 | start, rollback | Start: the consent names a text the hosted widget does not show, or its id or version is not valid. Rollback: a target other than the two. |
| `unauthorized` | 401 | all | The token is missing, malformed, expired or not valid. Get a fresh one. |
| `connections_unavailable` | 402 | start | An end user's token while the workspace is suspended. Nothing was started. The API words it neutrally on purpose: tell the person to try later or contact you. |
| `token_wrong_end_user` | 403 | all | The connection, or the open move, is not this end user's: the token was minted for another end user, or for none while the connection names one, or the move names no connection of theirs. Nothing was read or changed. Mint the token with this domain's `end_user_ref` and call again. |
| `forbidden` | 403 | all | The token is bound to a different domain than the connection's. Start: also the application does not offer DNS hosting. |
| `workspace_suspended` | 403 | start | Only for a token a server mints (an app scoped one). An end user's token reads `connections_unavailable` for the same case. |
| `not_found` | 404 | start, rollback | The connection does not exist or is another application's. Rollback: also no move was started. Start: also the application's DNS host account is gone. `getNameserverMove` reads any 404 as `null`. |
| `conflict` | 409 | start, rollback | The nameservers are being moved for another account or application, the domain's zone is hosted for someone else, the domain already uses the new nameservers, the application's DNS host account no longer holds a usable key, or another change to the move is in progress (try again in a moment). Rollback: also nothing was changed at the registrar to move back, or the old nameservers are not known (choose `registrar_default`). |
| `old_dns_gone` | 409 | rollback | The old nameservers no longer answer for the zone. Choose `registrar_default`. |
| `changed_elsewhere` | 409 | rollback | The registrar lists other nameservers than the move's, so a move back would overwrite someone else's change. |
| `nameserver_migration_unavailable`, `registrar_locks_nameservers`, `zone_host_unsupported` | 422 | start | This domain's nameservers cannot be moved this way, or the application's DNS host cannot create zones. |
| `registrar_refused` | 502 | rollback | The registrar did not accept the old nameservers. Nothing was changed. |
| `service_unavailable` | 503 | all | Nameserver moves are not available on this deployment. |
| `registrar_unconfirmed` | 504 | rollback | The registrar's answer was lost and could not be read back, so it is not known whether the move back happened. Nothing is recorded; try again. |

The `token_wrong_end_user` answers come with the CustomDomain API release of November 2026. An API
from before it answers those calls without them.

The exported types are `NameserverMove`, `NameserverMoveState`, `NameserverRegistrar`,
`NameserverNextAction`, `NameserverRollbackTarget`, `NameserverConsent`, `NameserverMoveErrorCode`
and `ConnectionCallConfig`, and `@customdomain/react` re-exports them.

### Who runs a domain's DNS

`getConnection(connectionId, { token })` reads the connection (`GET /v1/connections/{id}`) with the same
widget token and resolves a small `Connection` view: `id`, `applicationId`, `domain`, `host?` (the
subdomain label, empty or absent for the root), `providerId?`, `setupType`, `status` (`pending`,
`propagating`, `live` or `failed`), `createdAt` and `dnsHosting`. Only those fields come through: the
connection's records, routing and the rest are not in the view. `dnsHosting` says who runs the
domain's DNS, so you can see that a domain is already hosted without asking for its move:

| Field | Meaning |
|---|---|
| `state` | `none`: nothing of CustomDomain's runs the domain's DNS, and no other field is set. `moving`: the zone is being set up or the nameservers are being moved, and the domain is not served from it yet. `hosted`: the nameservers point at the zone, which is what the world resolves. `failed`: the zone never became active, or the domain moved its nameservers away again; someone has to look. |
| `by` | Who runs the DNS: `customdomain` (CustomDomain's own managed DNS), `dns_host` (CustomDomain's account at a DNS host it integrates with; `provider` names it) or `custom` (the platform's own nameservers). Absent when `state` is `none`. |
| `provider` | The DNS host's provider id when `by` is `dns_host`, for example `cloudflare`. |
| `zone` | The zone that is hosted or being set up: the connection's domain or a parent of it (`acme.com` for `shop.acme.com`). |
| `since` | When the domain reached this state. |

`dnsHosting` is absent when the control plane does not send it, so test for it before you read
`state`. A 404 for an unknown connection rejects with a `CustomDomainError` like any other refusal.
The exported types are `Connection` and `ConnectionDnsHosting`, and `@customdomain/react` re-exports them.

## Pre-flight with `checkDomain`

`checkDomain` tells you what will happen before a user starts, without opening the widget. It
calls `POST /v1/domains:check` and maps every field of the answer to camelCase. Pass the records
you intend to write as `dnsRecords` (the same shape as `open({ dnsRecords })`) and the conflict
detection, the `willFallbackToManual` prediction and `integrationWarnings` run against that set
instead of the default edge record.

```ts
const check = await customdomain.checkDomain("acme.com", { token, dnsRecords });
if (check.blockedReason) showCannotConnect(check.blockedReason);
else if (!check.endUserAutomatic) warnManualSteps(check.recommendedRail);
```

Every field of `CheckDomainResult`. Optional fields are absent when the server did not compute them.

| Field | Type | Meaning |
|---|---|---|
| `domain` | `string` | The domain that was checked. |
| `provider` | `string \| null` | Detected DNS provider slug, or `null` when unknown. |
| `setupType` | `SetupType` | The flow the widget would run: `automatic`, `semiautomatic`, `sharedLogin`, `manual` or `purchase`. |
| `supportsAutomatic` | `boolean` | An adapter exists for the provider. It does not say the adapter can run for this domain; read `rails` for that. |
| `oauthAvailable` | `boolean` | The provider has a sign-in rail. |
| `domainConnect` | `boolean` | The provider serves Domain Connect for this domain. |
| `subdomain`, `registrableDomain`, `publicSuffix` | `string` | The authoritative Public Suffix List split. `subdomain` is `""` when the domain is the registrable root, so test it with `=== ""`. |
| `registered` | `boolean` | Whether the registrable domain is registered. |
| `authoritativeDnsProvider` | `string` | The provider serving the zone's authoritative DNS, when it differs from the registrar. |
| `NSSupport` | `{ root?, subdomains? }` | Whether nameserver delegation is possible at the root and for subdomains. |
| `wildcardSupport`, `cnameFlattening`, `spfOverrideSupport`, `caaSupport` | `boolean` | Provider capabilities. |
| `supportsSocialLogin` | `string` | `yes` when the provider's rail signs the user in, `no` when it does not, `n-a` when unknown. |
| `recordConflicts` | `Array<{ kind, host, type, existing, desired }>` | Existing records that clash with the ones to be written. A control plane that does not return `advisories` also lists a `caa-blocks-letsencrypt` entry here: a certificate advisory, not a DNS write clash, which does not count towards the tolerance. |
| `advisories` | `Array<{ kind, host, type, existing, desired }>` | Warnings that replace nothing, such as a CAA record that blocks Let's Encrypt (kind `caa-blocks-letsencrypt`). They never count towards the tolerance. Absent when the control plane does not return the field; then that entry is in `recordConflicts`, so read both. |
| `conflictTolerance` | `number` | How many conflicts the provider's automatic rail tolerates before it stops writing. |
| `willFallbackToManual` | `boolean` | The server's prediction that the one-click rail would quietly become a manual record list for this domain. |
| `apexSupported` | `boolean` | Provider fact: it can host a CNAME-like record at the zone root. |
| `apexMessage` | `string` | This-domain verdict, non-empty exactly when the apply would refuse the record set. Gate warnings on this, not on `apexSupported`. |
| `rails` | `{ oauth, domainConnect, apiKey, manual, cloudBrowser?, nameservers?, savedAccess? }` | Per rail, a `RailInfo`: `available`, a machine `reason` present exactly when it is not, and a `caveat` for an available rail most users still cannot use. An available `oauth` rail also carries `flow` (the sign-in it runs) and `managed` (the connect keeps its credential). `cloudBrowser` is present only when that rail is switched on for your application, and its `reason` can name the caller instead of the provider: `caller_cannot_start` (an agent, a plain API call without the console, or a role that cannot write connections) or `token_not_bound` (the widget token is not bound to this domain, see [Tokens for the domain the user typed](#tokens-for-the-domain-the-user-typed)); when its sign-in also makes a lasting API key, `key` says what the key can do beyond DNS (`rights`) and when it ends (`endsInDays`, `null` for never). `nameservers` is the DNS hosting verdict (`verdict`: `offered`, `offered_first`, `recommended` or `unavailable`, and `reason`), present when the application offers DNS hosting. `savedAccess` lists the kept provider keys that may act for the domain (`available`, `accounts` of `SavedAccess`, best first); a widget token gets `available: false` and no accounts, so a page never shows them. |
| `recommendedRail` | `"saved_access" \| "oauth" \| "domain_connect" \| "cloud_browser" \| "api_key" \| "manual"` | The rail the widget will pick. `saved_access` only reaches an API key caller. |
| `alsoProvider` | `{ provider, providerName, reason: "former_google_domains" }` | Set when the registrar and the nameservers name two providers: a former Google Domains name is Squarespace's now and keeps Google's nameservers, which Google Cloud DNS zones use too. `provider` is then the registrar's. |
| `endUserAutomatic` | `boolean` | True when the recommended rail needs nothing typed by the end user. |
| `blockedReason` | `"unregistered" \| "platform_subdomain"` | Set when no rail can connect the domain at all. |
| `dashboardUrl` | `string` | Best-effort deep link into the provider's DNS panel for this zone. |
| `nameservers` | `string[]` | The nameserver delegation the detector observed. |
| `detectionError` | `"nxdomain" \| "resolver"` | Why provider detection could not finish. `resolver` is transient: check again. |
| `targetMode` | `"edge" \| "custom"` | Where traffic lands: the shared edge, or the custom target your application set. |
| `apexStrategy` | `"alias" \| "a_records" \| "unsupported"` | How a root domain would be pointed at the target. |
| `apexRecordType`, `apexTargets` | `string`, `string[]` | The record type and values that strategy writes. |
| `integrationWarnings` | `IntegrationWarning[]` | Only when you passed `dnsRecords`: records in that set the provider cannot write as given, each `{ code, message }`. The code today is `supplied_apex_unrealizable`. |
| `managedDns` | `ManagedDnsAvailability \| null` | Whether CustomDomain™ can host the zone itself (managed DNS), with a `reason` when it cannot. |
| `sandbox` | `boolean` | True when the token belongs to a test mode application. |

The exported types `CheckDomainResult`, `RailInfo`, `RailKey`, `DnsHostingVerdict`,
`SavedAccess`, `SavedAccessRail`, `AlsoProvider`, `IntegrationWarning` and
`ManagedDnsAvailability` describe this shape, and `@customdomain/react` re-exports them.

## Errors and retries

`checkDomain`, `checkRecords`, `getConnection` and the three nameserver methods throw a
`CustomDomainError` when the control plane answers with an error, and `onError` receives one when the widget reports an error. The class carries `code`,
`message`, `details?` and `status?`.

- `status` is the HTTP status of the response the error came from. It is unset on errors raised
  by the widget (`onError`) or by the SDK itself, such as a `container` that matches nothing or a
  `loadSharedFlow` link on another origin.
- Safe to retry: a `status` of 429 or any 5xx. Wait a moment and send the same call again. A
  network failure never becomes a `CustomDomainError`: `fetch` rejects with a plain `TypeError`,
  which is also safe to retry.
- Not safe to retry as is: any other 4xx. The same request gets the same answer until something
  changes: the token (expired, or minted for another application), the domain, or the records.
- A successful `checkDomain` with `detectionError: "resolver"` is transient too: the DNS lookup
  failed, so check again before telling the user anything.

```ts
import { customdomain, CustomDomainError } from "customdomain-js";

try {
  await customdomain.checkDomain("acme.com", { token });
} catch (err) {
  const transient = err instanceof CustomDomainError ? err.status === 429 || (err.status ?? 0) >= 500 : err instanceof TypeError;
  if (transient) scheduleRetry();
  else showError(err);
}
```

## Migrating from Entri

A `window.entri` compatibility shim is included, so moving over is a one-line script tag swap
with no code changes.

## Support

- **Docs:** [docs.customdomain.ai](https://docs.customdomain.ai/docs)
- **Questions and ideas:** [GitHub Discussions](https://github.com/CUSTOM-DOMAIN-APP/docs/discussions)
- **Bugs and corrections:** [open an issue](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/issues) on the SDK repository
- **Service status:** [status.customdomain.ai](https://status.customdomain.ai)
- **Account and billing:** connect@customdomain.ai
- **Security:** report privately to security@customdomain.ai, never in a public issue. Policy: [app.customdomain.ai/security](https://app.customdomain.ai/security)

## License

[Apache-2.0](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE). CustomDomain™ is a product of EverJust Company.
