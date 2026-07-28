/**
 * Compile-time gate: every white-label key the WIDGET actually reads must be
 * expressible on the SDK's `WhiteLabel` type.
 *
 * P6.8 · L8: `whiteLabel` is forwarded to the widget whole, so a key the SDK's
 * type omits still works at runtime — which is exactly why `fontUrl` went
 * missing here for a whole release while the widget consumed it
 * (packages/widget/src/theme.ts:208 declares it, app.ts:149 applies it,
 * theme.ts:320-335 loads the stylesheet). Nothing broke; a TypeScript
 * integrator simply could not write it without a cast, and the fix ledger
 * recorded the feature as shipped.
 *
 * The list below mirrors `WhiteLabelConfig` in packages/widget/src/theme.ts
 * (:197-240) — the widget's own tenant-facing theming input. Type-only, no
 * runtime behavior; it is compiled by `tsc -p tsconfig.json`, which is the
 * package's build, so a dropped key fails CI rather than shipping quietly.
 *
 * Adding a white-label key to the widget? Add it here and to `WhiteLabel` in
 * the same change. (A structural import of the widget's type would be stricter,
 * but packages/widget is not a dependency of the SDK and pulling it in would
 * move this package's emitted `dist` layout.)
 */
import type { WhiteLabel } from "./index";

/** The key names packages/widget/src/theme.ts:197-240 accepts. */
type WidgetWhiteLabelKeys =
  | "colors"
  | "font"
  | "fontUrl"
  | "borderRadius"
  | "logo"
  | "hideLogo"
  | "hideConfetti"
  | "tokens"
  | "screens"
  | "delegateClose"
  | "embedded"
  | "customCopy"
  | "icons"
  | "darkMode"
  | "darkTokens"
  | "googleFont"
  | "customProperties";

/** Compiles only when every member of Keys is a key of T. */
type Covers<T, Keys extends keyof T> = Keys extends keyof T ? true : never;

const _sdkCoversEveryWidgetKey: Covers<WhiteLabel, WidgetWhiteLabelKeys> = true;
void _sdkCoversEveryWidgetKey;

export type {};
