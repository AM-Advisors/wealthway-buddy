/**
 * Pure breadcrumb projection from a pathname. Presentation only: every
 * destination is still authorized by the backend when opened.
 */
export type Crumb = { label: string; url: string };

const ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

const LABELS: Record<string, string> = {
  ops: "Operations",
  admin: "Administration",
  staff: "Staff",
  home: "Home",
  manager: "Fund manager",
  client: "Client",
  professional: "Professional",
  fund: "Fund",
  funds: "Funds",
  "fund-setup": "Fund Setup",
  "my-funds": "My Funds",
  "cap-table": "Cap table",
  signoff: "Sign-off",
  kyc: "KYC / AML",
  aml: "AML",
  ein: "EIN",
  ss4: "SS-4",
  sales: "Sales",
};

export function labelForSegment(seg: string): string {
  if (LABELS[seg]) return LABELS[seg];
  const words = decodeURIComponent(seg).replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Parent-first trail. IDs become "Details"; a bare ID never ends a link chain alone. */
export function breadcrumbsFor(pathname: string): Crumb[] {
  const segs = pathname.split("/").filter(Boolean);
  const out: Crumb[] = [];
  segs.forEach((seg, i) => {
    const url = "/" + segs.slice(0, i + 1).join("/");
    const label = ID_RE.test(seg) ? "Details" : labelForSegment(seg);
    // "fund" + id reads better as one crumb.
    if (ID_RE.test(seg) && out.length && (segs[i - 1] === "fund" || segs[i - 1] === "funds")) {
      out[out.length - 1] = { label: "Fund", url };
      return;
    }
    out.push({ label, url });
  });
  return out;
}

/** Where "Back" goes when there is no in-app history: the nearest parent. */
export function parentPath(pathname: string): string | null {
  const crumbs = breadcrumbsFor(pathname);
  return crumbs.length > 1 ? crumbs[crumbs.length - 2]!.url : null;
}
