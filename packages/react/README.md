# @customdomain/react

[![npm](https://img.shields.io/npm/v/@customdomain/react?color=1c1917)](https://www.npmjs.com/package/@customdomain/react)
[![license](https://img.shields.io/npm/l/@customdomain/react?color=1c1917)](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE)

Idiomatic React bindings for [`customdomain-js`](https://www.npmjs.com/package/customdomain-js)
— add one-click custom-domain setup (DNS auto-configuration + automatic SSL) to your React app
with a hook or a component, not a `<script>` tag and a pile of `useEffect`s.

It's a thin wrapper: the vanilla SDK does the real work (renders the widget in an iframe,
drives the postMessage protocol). This package turns that into a `useCustomdomain()` hook and
a `<CustomdomainConnect>` component, surfaces every `customdomain:*` window event as a typed
callback prop, cleans up on unmount, and is SSR-safe (nothing touches `window` outside effects
— safe for Next.js, Remix, and friends).

## Install

```bash
npm install @customdomain/react customdomain-js react react-dom
```

`react` / `react-dom` are peer dependencies; `customdomain-js` (the vanilla SDK)
is a direct dependency and loads automatically when you import this package.

## Usage

Mint a short-lived widget token **server-side** (via `POST /v1/tokens`), pass it
to the client, then mount the component:

```tsx
import { CustomdomainConnect } from "@customdomain/react";
import type { SuccessResult } from "@customdomain/react";

export function ConnectDomain({ token }: { token: string }) {
  return (
    <CustomdomainConnect
      applicationId="app_123"
      token={token}
      // optional: domain="acme.com"
      onSuccess={(result: SuccessResult) => {
        console.log("connected", result.domain, result.jobId);
      }}
      onClose={() => console.log("closed")}
      onStep={(step) => console.log("step", step)}
    />
  );
}
```

`<CustomdomainConnect>` opens the flow as soon as it mounts. Control it with the
`open` prop (`open={false}` closes it) or by unmounting.

### Hook (imperative)

Prefer to open the modal from a click handler? Use the hook:

```tsx
import { useCustomdomain } from "@customdomain/react";

function ConnectButton({ token }: { token: string }) {
  const { open, ready } = useCustomdomain({
    applicationId: "app_123",
    token,
    onSuccess: (r) => console.log("connected", r.domain),
    onShared: (d) => console.log("shared", d),
  });

  return (
    <button disabled={!ready} onClick={() => open()}>
      Connect your domain
    </button>
  );
}
```

## Callback props

Each maps to a native `customdomain:*` window CustomEvent:

| Prop             | Event                        | Payload                       |
| ---------------- | ---------------------------- | ------------------------------ |
| `onSuccess`      | `customdomain:success`       | `SuccessResult`               |
| `onClose`        | `customdomain:close`         | `CloseDetail`                 |
| `onStep`         | `customdomain:step`          | `string` (current step)       |
| `onStepChange`   | `customdomain:step`          | `StepDetail` (full step detail) |
| `onDocClick`     | `customdomain:doc-click`     | event detail                  |
| `onRequestClose` | `customdomain:request-close` | event detail                  |
| `onShared`       | `customdomain:shared`        | event detail                  |

All other props are forwarded to the SDK's `OpenConfig` (`domain`, `whiteLabel`,
`locale`, `container`, `forceManualSetup`, `onError`, …). Types are re-exported
from `customdomain-js`, so your editor autocompletes every option.

## Links

- Docs & full API reference: https://app.customdomain.ai/docs
- Repo (source, vanilla SDK, issues): https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk
- License: [Apache-2.0](https://github.com/CUSTOM-DOMAIN-APP/customdomain-sdk/blob/main/LICENSE)

## Typecheck

```bash
pnpm --filter @customdomain/react typecheck   # tsc --noEmit
```
