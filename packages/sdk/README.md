# customdomain-js

The official JavaScript SDK for [customdomain.ai](https://customdomain.ai) — let your
users connect their own custom domain to your app in one click, with automatic DNS,
domain verification, and SSL. It opens the embeddable widget and streams the connect
lifecycle back to you as events.

## Install

**Hosted script (recommended — always current, no build step):**

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

A `window.entri` compatibility shim is included for drop-in migration from Entri.

## Links

- Docs: https://app.customdomain.ai/docs
- Issues: https://github.com/CUSTOM-DOMAIN-APP/customdomain-js/issues
- License: Apache-2.0

---

<sub>Developing: `npm run build` (tsc + esbuild bundle) · `npm run typecheck`. The
build emits `dist/customdomain-sdk.js`, the bundle the app serves as a hosted asset.</sub>
