/**
 * Provider iconography for the DOMAIN_ANALYSIS animation, the authorize hero,
 * and the provider list.
 *
 * Real brand marks are self-hosted under {widget origin}/widget-assets/
 * provider-logos/{id}.(svg|png) (sourced from the Customdomain asset library).
 * Providers without a shipped mark render a monogram tile — initial letter on
 * a brand-adjacent tint. Both forms support the three animation states:
 * initial (idle), inactive (dimmed), finished (green check overlay). A logo
 * that fails to load falls back to the monogram automatically (the <img>
 * removes itself, revealing the monogram beneath).
 */

/** Brand-adjacent tint per provider id (fallback hashes the id to a hue). */
const TINTS: Record<string, string> = {
  cloudflare: "#f6821f",
  godaddy: "#1bdbdb",
  digitalocean: "#0080ff",
  route53: "#ff9900",
  azuredns: "#0078d4",
  gcpdns: "#4285f4",
  namecheap: "#de3723",
  gandi: "#4f5d75",
  ovh: "#123f6d",
  hetzner: "#d50c2d",
  linode: "#02b159",
  vultr: "#007bfc",
  porkbun: "#ef7878",
  dnsimple: "#0ea5e9",
  vercel: "#171717",
  netlify: "#05bdba",
  ionos: "#003d8f",
  namesilo: "#031b4e",
  namecom: "#8927b0",
  dynadot: "#2e9640",
  alidns: "#ff6a00",
  transip: "#0b5394",
  hostinger: "#673de6",
  spaceship: "#394eff",
  openprovider: "#00a672",
};

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function providerTint(id: string): string {
  return TINTS[id] || `hsl(${hashHue(id)}, 55%, 45%)`;
}

/** Human display name from a provider id ("digitalocean" → "DigitalOcean"-ish). */
const DISPLAY: Record<string, string> = {
  cloudflare: "Cloudflare",
  godaddy: "GoDaddy",
  digitalocean: "DigitalOcean",
  route53: "Amazon Route 53",
  azuredns: "Azure DNS",
  gcpdns: "Google Cloud DNS",
  namecheap: "Namecheap",
  dnsmadeeasy: "DNS Made Easy",
  namesilo: "NameSilo",
  namecom: "Name.com",
  cloudns: "ClouDNS",
  luadns: "LuaDNS",
  powerdns: "PowerDNS",
  easydns: "easyDNS",
  dnsimple: "DNSimple",
  vercel: "Vercel",
  netlify: "Netlify",
  ionos: "IONOS",
  alidns: "Alibaba Cloud DNS",
  transip: "TransIP",
  hostinger: "Hostinger",
  spaceship: "Spaceship",
  openprovider: "Openprovider",
  dynadot: "Dynadot",
  desec: "deSEC",
  glesys: "GleSYS",
  njalla: "Njalla",
  bunny: "Bunny DNS",
  constellix: "Constellix",
  dreamhost: "DreamHost",
  gandi: "Gandi",
  hetzner: "Hetzner",
  linode: "Linode",
  ovh: "OVH",
  porkbun: "Porkbun",
  vultr: "Vultr",
};

export function providerDisplayName(id: string): string {
  if (DISPLAY[id]) return DISPLAY[id];
  if (!id) return "your DNS provider";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export type IconState = "initial" | "inactive" | "finished";

/**
 * The provider ids with a shipped brand mark (and its file extension) under
 * /widget-assets/provider-logos/. Keep in sync with that directory.
 */
const REAL_LOGOS: Record<string, "svg" | "png"> = {
  azuredns: "svg",
  cloudflare: "svg",
  desec: "svg",
  digitalocean: "svg",
  dnsimple: "svg",
  gandi: "svg",
  gcpdns: "svg",
  godaddy: "svg",
  hetzner: "svg",
  ionos: "svg",
  linode: "svg",
  namecheap: "svg",
  namecom: "svg",
  netlify: "svg",
  porkbun: "svg",
  route53: "svg",
  squarespace: "svg",
  vercel: "svg",
  vultr: "svg",
  alidns: "png",
  bunny: "png",
  dnsmadeeasy: "png",
  dreamhost: "png",
  dynadot: "png",
  enom: "png",
  hover: "png",
  namebright: "png",
  namesilo: "png",
  ovh: "png",
};

/** URL of a provider's shipped brand mark, or "" when none exists. */
export function providerLogoURL(id: string): string {
  const ext = REAL_LOGOS[id];
  return ext ? `/widget-assets/provider-logos/${id}.${ext}` : "";
}

/**
 * Provider tile in one of the three animation states. Renders the real brand
 * mark over a monogram base — if the image 404s or is blocked, it removes
 * itself and the monogram shows through.
 */
export function providerIcon(id: string, state: IconState): string {
  const tint = providerTint(id);
  const letter = (providerDisplayName(id).charAt(0) || "?").toUpperCase();
  const opacity = state === "inactive" ? "0.35" : "1";
  const check =
    state === "finished"
      ? `<svg viewBox="0 0 40 40" style="position:absolute;inset:0;pointer-events:none"><circle cx="30" cy="10" r="8" fill="#16a34a"/><path d="M26.5 10.2l2.3 2.3 4.4-4.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`
      : "";
  const logo = providerLogoURL(id);
  const img = logo
    ? `<img src="${logo}" alt="" loading="lazy" onerror="this.remove()"
         style="position:absolute;inset:15%;width:70%;height:70%;object-fit:contain"/>`
    : "";
  return `<span style="position:relative;display:block;width:100%;height:100%;opacity:${opacity}" role="img" aria-label="${providerDisplayName(id)}">
    <svg viewBox="0 0 40 40" width="100%" height="100%" style="position:absolute;inset:0">
      <rect x="2" y="2" width="36" height="36" rx="9" fill="${logo ? "#ffffff" : tint}" fill-opacity="${logo ? "1" : "0.14"}" stroke="${tint}" stroke-opacity="${logo ? "0.25" : "0.5"}"/>
      ${logo ? "" : `<text x="20" y="26" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="${tint}">${letter}</text>`}
    </svg>
    ${img}
    ${check}
  </span>`;
}

/**
 * White-label icon slots (whiteLabel.icons). A tenant can replace any of these
 * with their own mark. Slots without a distinct inline SVG render site today
 * still accept an override for forward-compatibility.
 */
export type IconSlot =
  | "success"
  | "error"
  | "close"
  | "back"
  | "domain"
  | "dns"
  | "manual"
  | "share"
  | "loading";

const ICON_SLOTS: readonly IconSlot[] = [
  "success",
  "error",
  "close",
  "back",
  "domain",
  "dns",
  "manual",
  "share",
  "loading",
];

let iconOverrides: Partial<Record<IconSlot, string>> = {};

/**
 * Install per-slot icon overrides, sanitized on the way in. Anything that isn't
 * a safe https:/data:image URL or a whitelisted inline <svg> is dropped.
 */
export function setIconOverrides(icons?: Partial<Record<IconSlot, string>> | Record<string, string>): void {
  iconOverrides = {};
  if (!icons) return;
  for (const slot of ICON_SLOTS) {
    const safe = sanitizeIcon((icons as Record<string, string>)[slot]);
    if (safe) iconOverrides[slot] = safe;
  }
}

/**
 * Render slot `slot`: the tenant override if one was installed, else the
 * built-in `fallbackSvg`. URL overrides render as an inert <img>; inline-SVG
 * overrides are emitted as-is (already sanitized in setIconOverrides).
 */
export function slotIcon(slot: IconSlot, fallbackSvg: string): string {
  const override = iconOverrides[slot];
  if (!override) return fallbackSvg;
  if (/^(https:\/\/|data:image\/)/i.test(override)) {
    return `<img src="${escAttr(override)}" alt="" style="width:100%;height:100%;object-fit:contain"/>`;
  }
  return override; // whitelisted inline SVG
}

/**
 * Accept only a safe https:/data:image URL or an inline <svg> with <script> and
 * on*= handlers / javascript: URLs stripped. Returns "" for anything else.
 */
function sanitizeIcon(val: unknown): string {
  if (typeof val !== "string") return "";
  const s = val.trim();
  if (/^(https:\/\/|data:image\/)/i.test(s)) return s;
  if (/^<svg[\s>]/i.test(s)) {
    return s
      .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
      .replace(/javascript:/gi, "");
  }
  return "";
}

function escAttr(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** The marquee set cycled during DOMAIN_ANALYSIS. */
export const ANALYSIS_ICON_SET = [
  "cloudflare",
  "godaddy",
  "route53",
  "digitalocean",
  "namecheap",
  "ionos",
  "vercel",
  "hostinger",
];
