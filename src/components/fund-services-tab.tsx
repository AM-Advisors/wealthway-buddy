import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFundServices } from "@/lib/service-engagements.functions";
import { serviceLevelLabel, titleCase, usd, fmtDate } from "@/lib/service-engagement-labels";

export function FundServicesTab({ fundId }: { fundId: string }) {
  const fetch = useServerFn(getFundServices);
  const q = useQuery({ queryKey: ["fund-services", fundId], queryFn: () => fetch({ data: { fundId } }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading services…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">No administration service is on file for this fund yet. Your Harmonious team will set it up.</p>;
  return (
    <div className="space-y-5">
      {rows.map((r) => {
        const lvl = serviceLevelLabel(r.service_level, r.service_product);
        return (
          <section key={r.id} className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current service · {titleCase(r.service_status)}</p>
            <h3 className="mt-1 text-lg">{lvl.name}</h3>
            <p className="text-sm text-muted-foreground">{lvl.positioning}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Item k="Annual contract" v={r.included_at_no_charge ? "Included" : usd(r.contracted_annual_value)} />
              <Item k="Billing" v={r.included_at_no_charge ? "—" : titleCase(r.billing_frequency)} />
              <Item k="Reporting" v={titleCase(r.reporting_frequency)} />
              <Item k="Effective" v={fmtDate(r.effective_date)} />
              <Item k="Renewal" v={fmtDate(r.renewal_date)} />
              <Item k="Primary administrator" v={r.primary_administrator ?? "To be assigned"} />
              <Item k="Relationship lead" v={r.relationship_lead ?? "To be assigned"} />
            </dl>
            <h4 className="mt-5 text-sm font-medium">Included services</h4>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{r.included.map((x: string) => <li key={x}>• {x}</li>)}</ul>
            {r.additional.length ? <>
              <h4 className="mt-4 text-sm font-medium">Additional services</h4>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{r.additional.map((x: string) => <li key={x}>• {x}</li>)}</ul>
            </> : null}
            <p className="mt-4 text-xs text-muted-foreground">Service documents (MSA/SOW) are in the Documents tab.</p>
          </section>
        );
      })}
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}
