/**
 * Marketing attribution. Captures first-touch UTM parameters and referrer in
 * sessionStorage (browser only) and assembles them with the CTA and page at
 * submission time. Attribution is informational only — never authorization.
 */
export interface Attribution {
  cta?: string | undefined;
  sourcePage?: string | undefined;
  utmSource?: string | undefined;
  utmMedium?: string | undefined;
  utmCampaign?: string | undefined;
  utmContent?: string | undefined;
  utmTerm?: string | undefined;
  referrer?: string | undefined;
}

const KEY = "harmonious.attribution";
const UTM: [string, keyof Attribution][] = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
];

const clip = (v: string | null | undefined, n = 200) => (v ? v.slice(0, n) : undefined);

/** Pure: extract UTMs from a query string. */
export function parseUtm(search: string): Attribution {
  const params = new URLSearchParams(search);
  const out: Attribution = {};
  for (const [param, field] of UTM) {
    const v = clip(params.get(param));
    if (v) out[field] = v;
  }
  return out;
}

/** Referrer only when it's an external site (own hosts are dropped). */
export function externalReferrer(referrer: string, ownHost: string): string | undefined {
  try {
    const u = new URL(referrer);
    if (u.hostname === ownHost || u.hostname.endsWith(".harmonious.co") || u.hostname === "harmonious.co") return undefined;
    return clip(`${u.protocol}//${u.hostname}${u.pathname}`, 300);
  } catch {
    return undefined;
  }
}

/** Call on public page load. Keeps the first touch within the session. */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(KEY)) return;
    const data: Attribution = {
      ...parseUtm(window.location.search),
      referrer: externalReferrer(document.referrer, window.location.hostname),
      sourcePage: window.location.pathname,
    };
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — attribution is best-effort */
  }
}

export function readAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Attribution;
  } catch {
    return {};
  }
}
