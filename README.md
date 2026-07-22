# customdomain-js

Official JavaScript/TypeScript client packages for **[customdomain.ai](https://customdomain.ai)** —
let your users connect their own custom domain to your app in one click, with automatic
DNS, domain verification, and SSL.

| Package | npm | What it is |
|---|---|---|
| [`packages/sdk`](packages/sdk) | [`customdomain-js`](https://www.npmjs.com/package/customdomain-js) | The browser SDK — `window.customdomain`, opens the widget, streams connect events. |
| [`packages/react`](packages/react) | [`@customdomain/react`](https://www.npmjs.com/package/@customdomain/react) | React wrapper around the SDK. |
| [`packages/widget`](packages/widget) | `@customdomain/widget` *(private)* | The embeddable widget UI. Builds to the bundle the SDK loads; not published — served hosted. |

## Install

```html
<!-- Hosted (recommended): always current, no build step -->
<script src="https://app.customdomain.ai/widget-assets/customdomain-sdk.js"></script>
```
```sh
npm install customdomain-js          # or: @customdomain/react
```

See [`packages/sdk/README.md`](packages/sdk/README.md) for the quickstart and API.

## Develop

```sh
pnpm install
pnpm -r build        # build all packages
pnpm -r typecheck
pnpm sim             # drive the real widget bundle through headless Chromium
```

CI (`.github/workflows/ci.yml`) runs typecheck + build + the Chromium sim on every PR.

## Release

Publishing is automated with **npm provenance** (the verifiable "published from this repo"
badge on npmjs.com — our npm↔GitHub link). Bump versions, push a `vX.Y.Z` tag, and
[`.github/workflows/release.yml`](.github/workflows/release.yml) publishes
`customdomain-js` + `@customdomain/react`. Auth is either npm **Trusted Publishing**
(tokenless, preferred) or an `NPM_TOKEN` repo secret — configured on npmjs.com, never in
source. See the workflow header for setup.

## Links

- Product & docs: https://app.customdomain.ai/docs
- License: [Apache-2.0](LICENSE)

> Backend, control-plane, and infrastructure live in a separate private repository. This
> repo contains only the public browser clients.
