import { Link } from "@tanstack/react-router";

import { APPROVED_METRICS, DISCLOSURES, type Disclosure } from "@/lib/marketing/site-config";
import type { Crumb } from "@/lib/marketing/seo";

/** Renders only approved metrics; renders nothing when none are approved. */
export function MetricStrip({ className = "" }: { className?: string }) {
  if (APPROVED_METRICS.length === 0) return null;
  return (
    <dl className={`grid gap-6 sm:grid-cols-3 ${className}`}>
      {APPROVED_METRICS.map((m) => (
        <div key={m.label}>
          <dt className="text-sm text-muted-foreground">{m.label}</dt>
          <dd className="mt-1 text-3xl font-semibold">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Centrally managed disclosure text. */
export function DisclosureText({
  ids = ["offering", "status"],
  className = "",
}: {
  ids?: (keyof typeof DISCLOSURES)[];
  className?: string;
}) {
  const items: Disclosure[] = ids.map((id) => DISCLOSURES[id]);
  return (
    <div className={className}>
      {items.map((d) => (
        <p key={d.id}>{d.text}</p>
      ))}
    </div>
  );
}

/** Visible breadcrumbs; pair with `breadcrumbs` in marketingHead for schema. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="text-foreground">{c.name}</span>
            ) : (
              <Link to={c.path} className="hover:text-foreground">{c.name}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
