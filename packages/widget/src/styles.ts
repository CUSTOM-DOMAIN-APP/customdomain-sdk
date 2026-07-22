/**
 * The widget stylesheet. Every value a tenant could reasonably restyle reads a
 * --je-* token (see theme.ts); layout scaffolding stays hardcoded. The design
 * language: calm depth (blurred backdrop, layered key+ambient shadows), a
 * tight type ramp with negative tracking on headings, 12/20px radii, and
 * restrained motion (one entrance pop, 0.35s screen slides, drawn-in checks).
 */
export function styles(tokenCSS: string): string {
  return `
:host { all: initial; }
.root { ${tokenCSS} }
* { box-sizing: border-box; }
.backdrop {
  position: fixed; inset: 0; background: var(--je-color-backdrop);
  -webkit-backdrop-filter: blur(var(--je-backdrop-blur)) saturate(1.15);
  backdrop-filter: blur(var(--je-backdrop-blur)) saturate(1.15);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--je-font-family); z-index: 2147483647;
  animation: backdrop-in .3s ease;
}
@keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }
.modal {
  position: relative; background: var(--je-color-surface); color: var(--je-color-text);
  border-radius: var(--je-modal-radius); padding: var(--je-modal-padding);
  width: min(var(--je-modal-width), 92vw); max-height: var(--je-modal-max-height);
  min-height: min(var(--je-modal-min-height), 86vh);
  overflow-y: auto; overflow-x: hidden; box-shadow: var(--je-shadow-modal);
  display: flex; flex-direction: column; line-height: var(--je-line-height);
  animation: modal-pop .42s cubic-bezier(.22,1,.36,1);
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
@keyframes modal-pop {
  from { opacity: 0; transform: translateY(14px) scale(.975); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.sheet-handle { display: none; }
.icon-close {
  position: absolute; top: 14px; right: 14px; z-index: 2;
  width: 32px; height: 32px; padding: 0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: transparent; color: var(--je-color-text-muted);
  font-size: 16px; line-height: 1; border: 0; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.icon-close:hover { background: var(--je-color-surface-sunken); color: var(--je-color-text); }
.icon-close svg { width: 14px; height: 14px; display: block; }
.screen { animation: slide-in var(--je-motion-duration) var(--je-motion-ease); display: flex; flex-direction: column; flex: 1; }
.screen.centered { align-items: center; text-align: center; justify-content: center; }
.screen.centered p { max-width: 320px; }
/* leading screen glyph (icon slots: domain, dns, …) */
.lead-ico { width: 38px; height: 38px; margin: 0 0 var(--je-space-sm); color: var(--je-color-primary); }
.lead-ico svg, .lead-ico img { width: 100%; height: 100%; display: block; }
.screen.centered .lead-ico { margin-left: auto; margin-right: auto; }
/* inline button glyph (icon slots: back, manual, share) */
.b-ico { display: inline-flex; width: 16px; height: 16px; margin-right: 8px; vertical-align: -3px; }
.b-ico svg, .b-ico img { width: 100%; height: 100%; }
/* the connected domain is the hero of the moment */
.domain-hero {
  display: inline-block; margin: var(--je-space-sm) auto var(--je-space-lg);
  font-size: 21px; font-weight: var(--je-font-weight-bold); letter-spacing: -0.02em;
  color: var(--je-color-text); word-break: break-all; position: relative; padding-bottom: 6px;
}
.domain-hero::after {
  content: ""; position: absolute; left: 8%; right: 8%; bottom: 0; height: 3px; border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--je-color-success), transparent);
  transform: scaleX(0); animation: hero-sweep .6s .25s cubic-bezier(.22,1,.36,1) forwards;
}
.domain-hero.quiet::after { background: linear-gradient(90deg, transparent, var(--je-color-border-strong), transparent); }
@keyframes hero-sweep { to { transform: scaleX(1); } }
.live-row { display: inline-flex; align-items: center; gap: 7px; margin: 0 auto var(--je-space-md); font-size: var(--je-font-size-sm); font-weight: var(--je-font-weight-semibold); color: var(--je-color-success); }
.live-row .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--je-color-success); box-shadow: 0 0 0 0 rgba(22,163,74,.45); animation: live-pulse 1.8s ease infinite; }
@keyframes live-pulse { 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } }
/* staggered entrances for list-y content */
.stagger > * { opacity: 0; animation: rise .4s var(--je-motion-ease) forwards; }
.stagger > *:nth-child(1) { animation-delay: .05s; } .stagger > *:nth-child(2) { animation-delay: .12s; }
.stagger > *:nth-child(3) { animation-delay: .19s; } .stagger > *:nth-child(4) { animation-delay: .26s; }
.stagger > *:nth-child(n+5) { animation-delay: .32s; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .stagger > * { animation: none; opacity: 1; } .domain-hero::after { animation: none; transform: scaleX(1); } }
@keyframes slide-in {
  from { opacity: 0; transform: translateX(var(--je-motion-slide-distance)); }
  to { opacity: 1; transform: translateX(0); }
}
.screen.back { animation-name: slide-back; }
@keyframes slide-back {
  from { opacity: 0; transform: translateX(calc(-1 * var(--je-motion-slide-distance))); }
  to { opacity: 1; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .screen, .screen.back, .modal, .backdrop, .done-ring, .done-tick, .tick { animation: none !important; }
  .spinner { animation-duration: 1.6s; }
}
h2 {
  margin: 0 0 var(--je-space-xs); padding-right: 34px;
  font-size: var(--je-font-size-h2); font-weight: var(--je-font-weight-bold);
  letter-spacing: -0.02em; color: var(--je-color-text);
}
p { color: var(--je-color-text-secondary); margin: 0 0 var(--je-space-lg); font-size: var(--je-font-size-md); line-height: 1.55; }
label { display: block; font-size: var(--je-font-size-sm); font-weight: var(--je-font-weight-semibold); color: var(--je-color-text-secondary); margin-bottom: var(--je-space-xs); }
input[type="text"] {
  width: 100%; padding: var(--je-input-padding);
  font-size: var(--je-input-font-size); font-family: inherit; color: var(--je-color-text);
  border: 1px solid var(--je-input-border); border-radius: var(--je-input-radius);
  background: var(--je-input-bg); margin-bottom: var(--je-space-md);
  transition: border-color .15s ease, box-shadow .15s ease;
}
input[type="text"]:hover { border-color: var(--je-color-border-strong); }
input[type="text"]::placeholder { color: var(--je-input-placeholder); }
input[type="text"]:focus-visible {
  outline: none; border-color: var(--je-color-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--je-color-focus-ring) 14%, transparent);
}
button {
  width: 100%; padding: var(--je-button-padding); border: 0; border-radius: var(--je-button-radius);
  cursor: pointer; background: var(--je-color-primary); color: var(--je-color-primary-contrast);
  background-image: linear-gradient(to bottom, rgba(255,255,255,.14), rgba(255,255,255,0));
  box-shadow: var(--je-shadow-button), inset 0 1px 0 rgba(255,255,255,.16);
  font-size: var(--je-button-font-size); font-weight: var(--je-button-font-weight); font-family: inherit;
  letter-spacing: -0.005em;
  transition: background-color .15s ease, transform .15s ease, box-shadow .15s ease, filter .15s ease;
}
button:hover { background-color: var(--je-color-primary-hover); transform: translateY(-1px); box-shadow: var(--je-shadow-button-hover), inset 0 1px 0 rgba(255,255,255,.16); }
button:active { transform: translateY(0) scale(.995); filter: brightness(.97); }
button:focus-visible { outline: none; box-shadow: 0 0 0 4px color-mix(in srgb, var(--je-color-focus-ring) 30%, transparent); }
button.secondary {
  background: var(--je-button-secondary-bg); background-image: none; color: var(--je-button-secondary-color);
  border: 1px solid var(--je-button-secondary-border); box-shadow: 0 1px 2px rgba(9,12,20,.04);
}
button.secondary:hover { background: var(--je-color-surface-raised); }
button.link {
  background: none; background-image: none; box-shadow: none; color: var(--je-color-link);
  margin-top: var(--je-space-2xs); font-weight: var(--je-font-weight-medium); font-size: var(--je-font-size-sm);
}
button.link:hover { background: none; color: var(--je-color-text); transform: none; box-shadow: none; }
button:disabled { opacity: .55; cursor: default; transform: none; }
.row { display: flex; gap: var(--je-space-sm); }
.row > button { flex: 1; }
.spinner {
  width: var(--je-spinner-size); height: var(--je-spinner-size); flex: none;
  border: 2.5px solid var(--je-spinner-track); border-top-color: var(--je-color-primary);
  border-radius: 50%; animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
/* loading icon slot wrapper (holds the default spinner or a tenant override) */
.load-ico { display: inline-flex; width: var(--je-spinner-size); height: var(--je-spinner-size); flex: none; align-items: center; justify-content: center; }
.load-ico img { width: 100%; height: 100%; object-fit: contain; }
.progress { display: flex; align-items: center; gap: var(--je-space-sm); margin-bottom: var(--je-space-lg); color: var(--je-color-text-secondary); font-size: var(--je-font-size-base); }
.notice {
  background: var(--je-color-warning-bg); border: 1px solid var(--je-color-warning-border); color: var(--je-color-warning);
  border-radius: var(--je-radius-md);
  padding: var(--je-space-sm) var(--je-space-md); font-size: var(--je-font-size-sm); line-height: 1.5;
  margin-bottom: var(--je-space-md);
}
/* typed notice variants — informational / error / success surfaces */
.notice.info { background: var(--je-color-info-bg); border-color: var(--je-color-border-strong); color: var(--je-color-text-secondary); }
.notice.error { background: var(--je-color-error-bg); border-color: var(--je-color-error); color: var(--je-color-error); }
.notice.success { background: var(--je-color-success-bg); border-color: var(--je-color-success); color: var(--je-color-success); }
/* toggle (subdomain) */
.toggle { display: flex; align-items: center; gap: var(--je-space-sm); margin-bottom: var(--je-space-md); cursor: pointer; }
.toggle input { accent-color: var(--je-color-primary); width: 16px; height: 16px; margin: 0; }
.toggle span { font-size: var(--je-font-size-sm); color: var(--je-color-text-secondary); }
/* analysis checklist */
.checklist { display: grid; gap: var(--je-space-md); margin: var(--je-space-lg) 0 var(--je-space-xl); }
.check-item { display: flex; align-items: center; gap: var(--je-space-md); font-size: var(--je-font-size-md); color: var(--je-color-text-muted); transition: color .3s ease; }
.check-item.active { color: var(--je-color-text); font-weight: var(--je-font-weight-medium); }
.check-item.done { color: var(--je-color-text-secondary); }
.check-icon { width: var(--je-checklist-icon-size); height: var(--je-checklist-icon-size); flex: none; display: flex; align-items: center; justify-content: center; }
.check-icon .dot { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--je-color-border); }
.check-icon .tick-circle {
  width: 22px; height: 22px; border-radius: 50%; background: var(--je-color-success);
  display: flex; align-items: center; justify-content: center;
  animation: tick-pop .3s cubic-bezier(.22,1,.36,1);
}
@keyframes tick-pop { from { transform: scale(.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.check-icon .tick-circle svg { width: 11px; height: 11px; }
.check-icon .mini-spin { width: 18px; height: 18px; border-width: 2px; }
.icon-marquee { display: flex; gap: var(--je-space-sm); justify-content: center; margin: var(--je-space-xl) 0; }
.icon-marquee .tile {
  width: var(--je-provider-icon-size); height: var(--je-provider-icon-size);
  transition: opacity .35s ease, transform .35s cubic-bezier(.22,1,.36,1), box-shadow .35s ease;
  border-radius: 11px;
}
.icon-marquee .tile.spot { transform: scale(1.18) translateY(-2px); box-shadow: var(--je-shadow-raised); }
/* provider hero on LOGIN */
.provider-hero {
  display: flex; align-items: center; gap: var(--je-space-md);
  margin: var(--je-space-md) 0 var(--je-space-lg); padding: var(--je-space-md);
  border: 1px solid var(--je-color-border); border-radius: var(--je-radius-md);
  background: var(--je-color-surface-raised);
}
.provider-hero .tile { width: 44px; height: 44px; flex: none; }
.provider-hero .name { font-weight: var(--je-font-weight-semibold); color: var(--je-color-text); font-size: var(--je-font-size-md); letter-spacing: -0.01em; }
.provider-hero .sub { display: block; font-weight: var(--je-font-weight-normal); font-size: var(--je-font-size-xs); color: var(--je-color-text-muted); margin-top: 2px; }
.fineprint { display: flex; align-items: center; gap: 6px; font-size: var(--je-font-size-xs); color: var(--je-color-text-muted); margin: var(--je-space-sm) 0 var(--je-space-md); }
.fineprint svg { width: 12px; height: 12px; flex: none; }
/* records */
.records { margin: 0 0 var(--je-space-lg); display: grid; gap: var(--je-space-sm); width: 100%; }
.rec {
  border: 1px solid var(--je-record-border); border-radius: var(--je-record-radius);
  padding: var(--je-space-md) var(--je-space-lg); background: var(--je-record-bg);
  display: grid; gap: 7px;
}
.rec-row { display: flex; align-items: center; gap: var(--je-space-sm); }
.rec-k {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em;
  font-weight: var(--je-font-weight-semibold); color: var(--je-color-text-muted);
  width: 58px; flex: none;
}
.rec-v { font-family: var(--je-font-family-mono); font-size: var(--je-record-mono-size); color: var(--je-color-text); word-break: break-all; flex: 1; }
.rec-hint { font-size: var(--je-font-size-xs); color: var(--je-color-text-muted); margin-top: 2px; line-height: 1.4; }
.rec-status { display: flex; align-items: center; gap: 6px; font-size: var(--je-font-size-xs); font-weight: var(--je-font-weight-semibold); margin-top: 2px; }
.rec-status .pip { width: 7px; height: 7px; border-radius: 50%; }
.rec-status.ok { color: var(--je-color-success); }
.rec-status.ok .pip { background: var(--je-color-success); }
.rec-status.wait { color: var(--je-color-text-muted); }
.rec-status.wait .pip { background: var(--je-color-border-strong); animation: pulse 1.6s ease infinite; }
@keyframes pulse { 50% { opacity: .35; } }
.copy {
  width: auto; flex: none; padding: 5px 11px; font-size: var(--je-font-size-xs);
  font-weight: var(--je-font-weight-semibold); background: var(--je-color-surface); background-image: none;
  color: var(--je-button-secondary-color); border: 1px solid var(--je-button-secondary-border);
  border-radius: var(--je-radius-sm); box-shadow: 0 1px 2px rgba(9,12,20,.04);
}
.copy:hover { background: var(--je-color-surface); box-shadow: var(--je-shadow-raised); transform: translateY(-1px); }
.tracker {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: var(--je-font-size-sm); font-weight: var(--je-font-weight-medium);
  color: var(--je-color-text-secondary); margin-bottom: var(--je-space-md);
  padding: 5px 12px; border-radius: var(--je-radius-pill);
  background: var(--je-color-surface-sunken);
}
/* provider list */
.plist { display: grid; gap: var(--je-space-xs); margin: var(--je-space-md) 0; max-height: 300px; overflow-y: auto; padding: 2px; }
.plist button {
  display: flex; align-items: center; gap: var(--je-space-md); text-align: left;
  background: var(--je-color-surface); background-image: none; box-shadow: none; color: var(--je-color-text);
  border: 1px solid var(--je-color-border); font-weight: var(--je-font-weight-medium);
  padding: 10px 14px;
}
.plist button:hover { background: var(--je-color-surface-raised); transform: none; box-shadow: var(--je-shadow-raised); }
.plist .tile { width: 28px; height: 28px; flex: none; }
/* conflicts */
/* One amber lead callout carries the warning; the record list itself is a
   neutral sunken container so the eye separates "the warning" from "the data". */
.warn-callout { display: flex; gap: var(--je-space-sm); align-items: flex-start;
  background: var(--je-color-warning-bg); border: 1px solid var(--je-color-warning-border); color: var(--je-color-warning);
  border-radius: var(--je-radius-md); padding: var(--je-space-sm) var(--je-space-md);
  font-size: var(--je-font-size-sm); line-height: 1.5; margin-bottom: var(--je-space-md); }
.warn-callout svg { flex: none; width: 18px; height: 18px; margin-top: 1px; }
.warn-callout p { margin: 0; }
.conflict-label { font-size: var(--je-font-size-xs); text-transform: uppercase; letter-spacing: .04em;
  color: var(--je-color-text-secondary); margin-bottom: var(--je-space-sm); }
.conflict-group { border: 1px solid var(--je-color-border); background: var(--je-color-surface-sunken);
  border-radius: var(--je-radius-md); max-height: 240px; overflow-y: auto; margin-bottom: var(--je-space-lg); }
.conflict { padding: var(--je-space-sm) var(--je-space-md); border-bottom: 1px solid var(--je-color-border);
  font-size: var(--je-font-size-sm); line-height: 1.5; }
.conflict:last-child { border-bottom: none; }
.conflict-head { font-family: var(--je-font-family-mono); font-size: var(--je-font-size-xs);
  color: var(--je-color-text-secondary); margin-bottom: 3px; }
.conflict-line { display: flex; gap: var(--je-space-sm); align-items: baseline; }
.conflict-line .lbl { flex: none; width: 62px; font-size: var(--je-font-size-xs); color: var(--je-color-text-secondary); }
/* Existing values can be a long comma-separated list of A/AAAA IPs — wrap at
   sensible boundaries inside the row instead of chopping mid-token. */
.conflict code { font-family: var(--je-font-family-mono); font-size: var(--je-font-size-xs);
  color: var(--je-color-text); overflow-wrap: anywhere; word-break: break-word; }
/* done / error marks */
.done-wrap { display: flex; justify-content: center; margin: var(--je-space-lg) 0 var(--je-space-xl); }
.done-mark { width: 64px; height: 64px; }
.done-ring {
  fill: var(--je-color-success-bg);
  stroke: var(--je-color-success); stroke-width: 2;
  transform-origin: center; animation: tick-pop .45s cubic-bezier(.22,1,.36,1);
}
.done-tick {
  stroke: var(--je-color-success); stroke-width: 3.4; fill: none;
  stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 30; stroke-dashoffset: 30;
  animation: tick-draw .45s .18s cubic-bezier(.22,1,.36,1) forwards;
}
@keyframes tick-draw { to { stroke-dashoffset: 0; } }
.err-mark {
  width: 56px; height: 56px; margin: var(--je-space-md) auto var(--je-space-lg);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--je-color-error-bg);
  color: var(--je-color-error); font-size: 26px; font-weight: var(--je-font-weight-bold);
  animation: tick-pop .35s cubic-bezier(.22,1,.36,1);
}
/* footer */
.footer {
  display: var(--je-footer-display); margin-top: var(--je-space-xl);
  padding-top: var(--je-space-md); border-top: 1px solid var(--je-color-divider);
  text-align: center; font-size: 11px; letter-spacing: .01em; color: #98a2b3;
}
.tos-notice { margin-top: var(--je-space-2xs); font-size: 10px; color: var(--je-color-text-muted); }
.brand-logo { display: block; margin: 0 auto var(--je-space-md); height: var(--je-logo-height); max-width: 60%; object-fit: contain; }
/* exit-confirm overlay */
.overlay {
  position: absolute; inset: 0; z-index: 3; background: var(--je-color-surface);
  border-radius: var(--je-modal-radius); padding: var(--je-modal-padding);
  display: flex; flex-direction: column; justify-content: center;
  animation: modal-pop .35s cubic-bezier(.22,1,.36,1);
}
/* buy */
.buy-result {
  display: flex; align-items: center; justify-content: space-between; gap: var(--je-space-md);
  border: 1px solid var(--je-color-border); border-radius: var(--je-radius-lg);
  padding: var(--je-space-md) var(--je-space-lg); margin-bottom: var(--je-space-sm);
  background: var(--je-color-surface); transition: box-shadow .15s ease;
}
.buy-result:hover { box-shadow: var(--je-shadow-raised); }
.buy-result .d { font-weight: var(--je-font-weight-semibold); letter-spacing: -0.01em; }
.buy-result .p { color: var(--je-color-text-secondary); font-size: var(--je-font-size-sm); margin-top: 2px; }
.buy-result button { width: auto; padding: 8px 16px; font-size: var(--je-font-size-sm); }
/* embedded mode: flat panel filling the host container, no dim/backdrop */
.backdrop.embedded { position: absolute; background: transparent; -webkit-backdrop-filter: none; backdrop-filter: none; align-items: stretch; justify-content: stretch; animation: none; }
.backdrop.embedded .modal { width: 100%; max-height: none; height: 100%; border-radius: 0; box-shadow: none; animation: none; }
/* mobile bottom sheet */
@media (max-width: 640px) {
  .backdrop { align-items: flex-end; }
  .modal { width: 100%; border-radius: var(--je-modal-mobile-radius); max-height: 94vh; padding: 22px 20px 24px; animation-name: sheet-up; }
  @keyframes sheet-up { from { opacity: 0; transform: translateY(48px); } to { opacity: 1; transform: translateY(0); } }
  .sheet-handle { display: block; width: 36px; height: 4px; border-radius: 999px; background: var(--je-color-border-strong); margin: 0 auto 14px; }
}
`;
}
