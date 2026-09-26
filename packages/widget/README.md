# @customdomain/widget

The embeddable CustomDomain™ connect modal: a Shadow DOM UI that a platform drops into its app so
its end users can connect (or buy) their own domains. It builds to a single minified IIFE bundle.

This package is `private: true` and never published. End users get the widget as the hosted
`https://app.customdomain.ai/widget-assets/widget.js`, which is built from the product repository.
The copy here exists so this repo's CI can drive the real SDK bundle against a real widget in
headless Chromium.

## Layout

- `src/`: the widget source (entry `src/index.ts`).
- `host/`: the provider logos the widget loads (`widget-assets/`), plus the built `widget.js`
  after a build.
- `sim/`: `simulate.mjs`, a headless simulation that serves the real built bundles to Chromium.

## Build, typecheck, simulate

```bash
pnpm --filter @customdomain/widget build      # esbuild bundle
pnpm --filter @customdomain/widget typecheck  # tsc --noEmit
pnpm --filter @customdomain/widget sim        # node sim/simulate.mjs
# or from this directory: npm run build / typecheck / sim
```

`build` emits `dist/widget.js` and copies it to `host/widget.js`.

The widget specification is maintained in the private product repository.
