# @customdomain/widget

The embeddable custom-domain connect modal — a Shadow-DOM UI a tenant drops into
their app so their end-users connect (or buy) their own domains. Builds to a
single minified IIFE bundle served as a static widget asset.

Package: `@customdomain/widget`. Source in `src/` (entry `src/index.ts`).

## Layout
- `src/` — the widget source.
- `host/` — the iframe host shell (`index.html` + the built `widget.js`).
- `sim/` — `simulate.mjs`, a headless simulation of the real bundle (`shots/` output).

## Build, typecheck, simulate
```bash
pnpm --filter @customdomain/widget build      # esbuild bundle
pnpm --filter @customdomain/widget typecheck  # tsc --noEmit
pnpm --filter @customdomain/widget sim        # node sim/simulate.mjs
# or from this dir: npm run build / typecheck / sim
```
`build` emits `dist/widget.js` and copies it to `host/widget.js` and
`apps/app/public/widget-assets/widget.js`.

Spec: [`PLAN/11-sdk-and-widget.md`](../../PLAN/11-sdk-and-widget.md) ·
[`docs/parity/WIDGET-PRODUCT-SPEC-AND-PLAN.md`](../../docs/parity/WIDGET-PRODUCT-SPEC-AND-PLAN.md).
