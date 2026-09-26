# customdomain-js

[![npm](https://img.shields.io/npm/v/customdomain-js?style=flat&color=1c1917)](https://www.npmjs.com/package/customdomain-js)
[![downloads](https://img.shields.io/npm/dm/customdomain-js?style=flat&color=1c1917&label=downloads%2Fmonth)](https://www.npmjs.com/package/customdomain-js)
[![docs](https://img.shields.io/badge/docs-docs.customdomain.ai-1c1917?style=flat)](https://docs.customdomain.ai/docs/widget-sdk/overview)
[![license](https://img.shields.io/badge/license-Apache--2.0-1c1917?style=flat)](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE)

The official JavaScript SDK for [CustomDomain™](https://customdomain.ai). Let your users connect
**their own domain** (`acme.com`, not `acme.yourapp.com`) to your SaaS in one click. Provider
detection across 63 DNS providers, the DNS records, domain verification and the TLS certificate
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

## Quickstart

Mint a short-lived widget token on your server with `POST /v1/tokens` (never ship an API key to
the browser), then open the widget:

```js
import { customdomain } from "customdomain-js";

customdomain.open({
  applicationId: "app_123",
  token: tokenFromYourServer,
  // Optional: return a fresh token when the first one expires in the middle of a setup.
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
| `open(config)` | Open the connect widget. Returns `{ close }`. |
| `checkDomain(domain, { token })` | Pre-flight a domain: provider, which connection rails can run, root-domain support, record conflicts, and the Public Suffix List split. |
| `checkRecords(domain, { token, dnsRecords })` | Check a record set against live public DNS. |
| `purchaseDomain(config)` | Open the widget on the buy-a-domain screen. |
| `loadSharedFlow(url, config?)` | Resume a shared "finish setup" link with your branding. |
| `load()` | Resolves when the SDK is ready, for parity with the hosted loader. |
| `close()` | Close the widget. |

## Options

The ones most integrations use. The full list is in the
[widget and SDK reference](https://docs.customdomain.ai/docs/widget-sdk/reference).

| Option | Type | What it does |
|---|---|---|
| `applicationId` (required) | `string` | Your public application id. |
| `token` (required) | `string` | A widget token minted on your server with `POST /v1/tokens`. |
| `getToken` | `() => string \| Promise<string>` | Returns a fresh widget token. Widget tokens last about 15 minutes, and a user adding DNS records by hand often takes longer. With `getToken` the widget refreshes silently instead of stopping; without it, the widget tells the user they can close the window, and the connection still finishes on its own once the records appear. |
| `wwwRedirect` | `boolean` | Root domains only. `true` connects the root and `www` and redirects the root to `www`; `false` connects the root alone; leave it unset to let the user choose. |
| `domain` / `prefilledDomain` | `string` / `string \| string[]` | Pre-fill the domain. An array runs a multi-domain flow. |
| `dnsRecords` | `DNSRecord[] \| Record<string, DNSRecord[]>` | Records to apply. Omit it to use the authoritative record set for the connection. |
| `whiteLabel` | `WhiteLabel` | Colors, fonts, logo, copy, icons and dark mode, so the flow reads as your product. |
| `locale` | `string` | UI language. |
| `endUserRef` | `string` | Your id for this customer. Stored on the connection and shown in the console. |
| `container` | `string` | CSS selector to render inside your page instead of as a modal. |
| `onSuccess`, `onClose`, `onStepChange`, `onError`, `onFallback` | functions | Callbacks, delivered in addition to the window events below. |

## Events

Every callback also arrives as a window `CustomEvent`, so you can listen from anywhere.

| Window event | Callback | Detail |
|---|---|---|
| `customdomain:success` | `onSuccess` | `{ jobId, domain, setupType, provider?, alreadyConnected?, processedDomains?, pendingDomains? }` |
| `customdomain:close` | `onClose` | `{ lastStatus?, error?, shared?, manualScreenDisabled? }` |
| `customdomain:step` | `onStepChange` | `{ step, domain?, provider?, user?, pendingDomains?, processedDomains?, error? }` |
| `customdomain:error` | `onError` | `{ code, message, title?, details? }`. `onError` receives a `CustomDomainError`. |
| `customdomain:fallback` | `onFallback` | `{ reason, provider?, screen?, message? }`. Fires when the widget sends the user to copy records by hand instead of a one-click or sign-in flow. `reason` is one of `no_end_user_rail`, `conflicts_exceed_tolerance`, `provider_unsupported`, `unknown_provider`. |
| `customdomain:purchase` | none | `{ domain, sessionId?, clientSecret?, url? }`: mount Stripe Embedded Checkout with `clientSecret`, then finalize with `POST /v1/registrar/fulfill`. |
| `customdomain:shared` | none | A shared setup link was created. |
| `customdomain:request-close` | none | The user asked to close while `whiteLabel.delegateClose` is set; call `close()` when you are ready. |
| `customdomain:doc-click` | none | The user opened a documentation link. |

## Pre-flight with `checkDomain`

`checkDomain` tells you what will happen before a user starts. Besides the provider and the
record conflicts, it returns:

- `rails`: for each connection rail (`oauth`, `domainConnect`, `apiKey`, `manual`), whether it can
  run for this domain right now, and why not when it cannot.
- `recommendedRail` and `endUserAutomatic`: the rail the widget will pick, and whether it needs
  nothing typed by the end user.
- `blockedReason`: set when no rail can connect the domain (`unregistered`, `platform_subdomain`).
- `dashboardUrl` and `nameservers`: a deep link into the provider's DNS panel, and the observed
  nameserver delegation.
- `subdomain`, `registrableDomain`, `publicSuffix`: the authoritative Public Suffix List split.
  `subdomain` is `""` when the domain is the registrable root, so test it with `=== ""`.

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
