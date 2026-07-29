# customdomain-js

[![npm](https://img.shields.io/npm/v/customdomain-js?color=1c1917)](https://www.npmjs.com/package/customdomain-js)
[![license](https://img.shields.io/npm/l/customdomain-js?color=1c1917)](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE)

The official custom-domain SDK for [customdomain.ai](https://customdomain.ai) — let your users
connect **their own domain** (`acme.com`, not `acme.yourapp.com`) to your SaaS in one click.
DNS record configuration, provider detection across 63 providers, domain verification, and
SSL certificate issuance all happen behind the scenes; you just render a widget and listen
for one event.

## Install

**Hosted script (recommended — always current, zero build step):**

```html
<script src="https://app.customdomain.ai/widget-assets/customdomain-sdk.js"></script>
```

**Or via npm** (for bundlers / TypeScript):

```sh
npm install customdomain-js
# React apps: npm install @customdomain/react
```

## Quickstart

Mint a short-lived widget token on your server (never ship your API key to the browser),
then open the widget:

```js
window.customdomain.open({
  applicationId: "app_123",
  token: TOKEN_FROM_YOUR_SERVER, // POST /v1/tokens, server-side
  // optional: prefilledDomain, whiteLabel, locale, endUserRef, managed, ...
});

window.addEventListener("customdomain:success", (e) => {
  console.log("connected:", e.detail.domain, "already?", e.detail.alreadyConnected);
});
```

That's it — no DNS provider SDKs, no ACME client, no polling loop. The widget handles apex
domains (via [Domain Connect](https://www.domainconnect.org) or manual `A`/`ALIAS` records),
`www` redirects, and certificate renewal for the lifetime of the connection.

## API (`window.customdomain`)

| Method | Purpose |
|---|---|
| `open(config)` | Open the connect widget |
| `checkDomain(domain)` | Detect provider + authoritative parse verdict |
| `checkRecords(...)` | Check current DNS records |
| `load(config)` / `close()` | Mount inline / close |
| `loadSharedFlow(url)` | Resume a shared "finish setup" link (applies stored branding) |
| `purchaseDomain(...)` | Buy a domain through the flow |

**Events:** `customdomain:success`, `customdomain:close`, `customdomain:step`
(carries `pendingDomains`/`processedDomains` for multi-domain), `customdomain:shared`.

A `window.entri` compatibility shim is included, so migrating off Entri is a one-line
script-tag swap — no code changes.

## Links

- Docs & full API reference: https://app.customdomain.ai/docs
- Repo (source, React bindings, issues): https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk
- License: [Apache-2.0](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE)

---

<sub>Developing: `npm run build` (tsc + esbuild bundle) · `npm run typecheck`. The
build emits `dist/customdomain-sdk.js`, the bundle the app serves as a hosted asset.</sub>
