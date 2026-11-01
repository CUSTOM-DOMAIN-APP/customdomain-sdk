# @customdomain/react

[![npm](https://img.shields.io/npm/v/@customdomain/react?style=flat&color=1c1917)](https://www.npmjs.com/package/@customdomain/react)
[![downloads](https://img.shields.io/npm/dm/@customdomain/react?style=flat&color=1c1917&label=downloads%2Fmonth)](https://www.npmjs.com/package/@customdomain/react)
[![docs](https://img.shields.io/badge/docs-docs.customdomain.ai-1c1917?style=flat)](https://docs.customdomain.ai/docs/widget-sdk/overview)
[![license](https://img.shields.io/badge/license-Apache--2.0-1c1917?style=flat)](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE)

React bindings for [`customdomain-js`](https://www.npmjs.com/package/customdomain-js), the
[CustomDomain™](https://customdomain.ai) SDK. Add one-click custom domain setup (DNS configured
for the user, verification, automatic TLS) to your React app with a hook or a component, not a
`<script>` tag and a pile of `useEffect`s.

[Website](https://customdomain.ai) · [Docs](https://docs.customdomain.ai/docs) · [Console](https://app.customdomain.ai) · [Widget and SDK reference](https://docs.customdomain.ai/docs/widget-sdk/reference) · [Changelog](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/CHANGELOG.md)

It is a thin wrapper. The vanilla SDK does the real work (it renders the widget in an iframe and
drives its message protocol). This package turns that into a `useCustomdomain()` hook and a
`<CustomdomainConnect>` component, surfaces every `customdomain:*` window event as a typed
callback prop, cleans up on unmount, and is SSR safe: nothing touches `window` outside effects,
so it works in Next.js, Remix and friends.

## Install

```bash
npm install @customdomain/react customdomain-js react react-dom
```

`react` and `react-dom` are peer dependencies. `customdomain-js` is a direct dependency, pinned to
the release published alongside this package, and loads automatically when you import it.

The package ships an ES module build and a CommonJS build, each with type declarations and
source maps, so `import` and `require` both resolve with types. It needs Node 18 or newer for
server rendering and declares `sideEffects: false`, so bundlers can tree shake it.

## Usage

Mint a short-lived widget token on your server with `POST /v1/tokens`, pass it to the client,
then mount the component:

```tsx
import { CustomdomainConnect } from "@customdomain/react";
import type { SuccessResult } from "@customdomain/react";

export function ConnectDomain({ token }: { token: string }) {
  return (
    <CustomdomainConnect
      applicationId="app_123"
      token={token}
      // Optional: return a fresh token when the first one expires mid-setup. When the widget names
      // the domain the user typed it arrives as ctx.domain (see the getToken row under "Callback props").
      getToken={() =>
        fetch("/api/customdomain/token", { method: "POST" })
          .then((r) => r.json())
          .then((body) => body.token)
      }
      onSuccess={(result: SuccessResult) => {
        console.log("connected", result.domain, result.jobId);
      }}
      onClose={() => console.log("closed")}
      onStep={(step) => console.log("step", step)}
    />
  );
}
```

`<CustomdomainConnect>` opens the flow as soon as it mounts. Control it with the `open` prop
(`open={false}` closes it) or by unmounting.

### Hook

Prefer to open the widget from a click handler? Use the hook:

```tsx
import { useCustomdomain } from "@customdomain/react";

function ConnectButton({ token }: { token: string }) {
  const { open, ready } = useCustomdomain({
    applicationId: "app_123",
    token,
    wwwRedirect: true,
    onSuccess: (r) => console.log("connected", r.domain),
    onFallback: (d) => console.log("manual setup because", d.reason),
  });

  return (
    <button disabled={!ready} onClick={() => open()}>
      Connect your domain
    </button>
  );
}
```

## Callback props

Each maps to a native `customdomain:*` window event:

| Prop | Event | Payload |
|---|---|---|
| `onSuccess` | `customdomain:success` | `SuccessResult` |
| `onClose` | `customdomain:close` | `CloseDetail` |
| `onStep` | `customdomain:step` | `string` (the current step) |
| `onStepChange` | `customdomain:step` | `StepDetail` (the full step detail) |
| `onDocClick` | `customdomain:doc-click` | event detail |
| `onRequestClose` | `customdomain:request-close` | event detail |
| `onShared` | `customdomain:shared` | event detail |
| `onPurchase` | `customdomain:purchase` | `PurchaseInitiated` |
| `onRemoved` | `customdomain:removed` | `RemovedResult` |

Every other prop is passed straight to the SDK's `OpenConfig`, including `domain`, `whiteLabel`,
`locale`, `container`, `forceManualSetup`, `endUserRef`, and these:

| Prop | What it does |
|---|---|
| `getToken` | Returns a fresh widget token when the current one expires in the middle of a setup, so long manual setups never stop. It receives a `TokenRequest` (`{ domain?, reason }`): `reason` is `"expired"`, or `"bind"` when the widget says it needs a token bound to the `domain` the user typed, which you mint with that `domain` and your own `end_user_ref`. The hosted widget does not send the domain or `"bind"` yet, so until it does the request is `{ reason: "expired" }`. A function with no parameter still works. See [Tokens for the domain the user typed](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/packages/sdk/README.md#tokens-for-the-domain-the-user-typed). |
| `wwwRedirect` | Root domains only: `true` connects the root and `www` and redirects the root to `www`; `false` connects the root alone; unset lets the user choose. |
| `onError` | Receives a `CustomDomainError` when the widget shows an error (also dispatched as `customdomain:error`). |
| `onFallback` | Receives a `FallbackDetail` (`{ reason, provider?, screen?, message? }`) when the widget sends the user to copy records by hand (also dispatched as `customdomain:fallback`). |
| `mode` | `"connect"` (the default), `"remove"` (what `removeDomain()` sets) or `"reconnect"`. See [Reconnecting a domain](#reconnecting-a-domain). |
| `connectionId` | For a removal or a reconnect: the connection, when you kept its id. Otherwise the domain is looked up. |

Every public type is re-exported from `customdomain-js`, so your editor autocompletes every option:
`OpenConfig`, `TokenRequest`, `WhiteLabel`, `DNSRecord`, `DNSRecordType`, `SetupType`, `SuccessResult`, `StepDetail`,
`CloseDetail`, `FallbackDetail`, `PurchaseInitiated`, `RemovedResult`, `CheckDomainResult`, `RailInfo`,
`IntegrationWarning`, `ManagedDnsAvailability` and `CheckRecordsResult`, plus the `CustomDomain` class
and `CustomDomainError`.

## Selling domains

`purchaseDomain()` opens the widget on the buy-a-domain screen. It is the only way in: the SDK
gates that screen on a `purchase` flag that is not part of `OpenConfig`, so `open()` cannot
reach it.

When the user picks a domain, the widget creates a checkout session on the server and hands it to
`onPurchase`. The widget cannot mount Stripe.js inside its own iframe, so payment is yours to
render (Embedded Checkout with `clientSecret`, or send the user to `url` for a hosted session).
Finalize with `POST /v1/registrar/fulfill`, which registers the domain and connects it.

```tsx
const { purchaseDomain, ready } = useCustomdomain({
  applicationId: "app_123",
  token,
  onPurchase: ({ domain, clientSecret }) => mountStripeCheckout(domain, clientSecret),
});

<button disabled={!ready} onClick={() => purchaseDomain()}>Buy a domain</button>;
```

`<CustomdomainConnect>` is the connect flow only; use the hook to sell.

## Removing a domain

`removeDomain()` opens the widget on the removal flow for a connected domain, the way
`purchaseDomain()` opens the buy screen; it sets `mode: "remove"` for you. Pass the
`connectionId` you kept in the hook options (or as an override), or the domain as `domain` /
`prefilledDomain`. Mint the token for that domain and end user, with `POST /v1/tokens`.

The widget shows the DNS records that were added, asks whether to remove or keep them, and
reports what happened to `onRemoved` (`RemovedResult`): `records` is `removed`, `partly_removed`,
`kept`, `manual`, `in_use` or `not_needed`, with the `removed`, `restored` and `leftInPlace`
record lists. The widget stays up on its summary until the user closes it.

```tsx
const { removeDomain, ready } = useCustomdomain({
  applicationId: "app_123",
  token, // minted for this domain and end user
  onRemoved: ({ domain, records }) => console.log(domain, records),
});

<button disabled={!ready} onClick={() => removeDomain({ connectionId })}>Remove domain</button>;
```

## Reconnecting a domain

When a domain is connected with secure sign-in, CustomDomain™ makes a lasting API key at the DNS
provider where the provider allows it. When that key nears its end, or the provider stops accepting
it, `open({ mode: "reconnect" })` opens straight on the sign-in that renews it: one sign-in, a new
key, no DNS record changes. Pass the `connectionId` you kept, or the domain as `domain` /
`prefilledDomain`, and mint the token for that domain and end user. `onSuccess` receives
`setupType: "reconnect"` and `reconnected: true`, so check `reconnected` before you treat it as a
new domain.

```tsx
const { open, ready } = useCustomdomain({
  applicationId: "app_123",
  token, // minted for this domain and end user
  onSuccess: (r) => {
    if (r.reconnected) console.log(`${r.domain}: access renewed`);
  },
});

<button disabled={!ready} onClick={() => open({ mode: "reconnect", connectionId })}>Reconnect</button>;
```

More on lasting API keys: [Secure sign-in](https://docs.customdomain.ai/docs/guides/secure-sign-in#reconnect).

## Nameserver moves

The three nameserver methods, `getNameserverMove`, `startNameserverMove` and `rollbackNameservers`,
are methods of the SDK instance, not of the hook: a call needs the end user's widget token, not a
modal. Reach them through the `CustomDomain` class this package re-exports, and import their types
(`NameserverMove`, `NameserverMoveState`, `NameserverConsent`, `NameserverRollbackTarget`,
`NameserverMoveErrorCode` and the rest) from here. `startNameserverMove` requires the end user's
consent. Everything about them is in the
[SDK README](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/packages/sdk/README.md#nameserver-moves).

```tsx
import { CustomDomain, type NameserverMove } from "@customdomain/react";

const sdk = new CustomDomain();

async function startMove(connectionId: string, token: string): Promise<NameserverMove> {
  // Only after your page showed the end user the words of this consent text.
  return sdk.startNameserverMove(connectionId, { id: "nsm-consent", version: "3" }, { token });
}
```

## White-label logos

`whiteLabel.logoDark` is a separate logo for dark mode, and `whiteLabel.logoPlate` shows the light
`logo` on a small light plate in dark mode when you have no `logoDark`. Both are part of the
`WhiteLabel` type.

## Support

- **Docs:** [docs.customdomain.ai](https://docs.customdomain.ai/docs)
- **Questions and ideas:** [GitHub Discussions](https://github.com/CUSTOM-DOMAIN-APP/docs/discussions)
- **Bugs and corrections:** [open an issue](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/issues) on the SDK repository
- **Service status:** [status.customdomain.ai](https://status.customdomain.ai)
- **Account and billing:** connect@customdomain.ai
- **Security:** report privately to security@customdomain.ai, never in a public issue. Policy: [app.customdomain.ai/security](https://app.customdomain.ai/security)

## License

[Apache-2.0](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE). CustomDomain™ is a product of EverJust Company.
