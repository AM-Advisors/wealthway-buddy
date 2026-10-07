import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFundServices } from "@/lib/service-engagements.functions";
import { getClientFundTasks } from "@/lib/staff-tasks.functions";
import { ResponsibilityBadge } from "@/components/responsibility-badge";
import { RESPONSIBILITY_CLIENT_EXPLANATION, asResponsibility, daysOverdue, waitingOnDetail } from "@/lib/responsibility";
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
      <FundOpenItems fundId={fundId} />
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

/** Client-safe open items for one fund: plain-language responsibility, no internal notes or third-party names. */
export function FundOpenItems({ fundId }: { fundId: string }) {
  const fetch = useServerFn(getClientFundTasks);
  const q = useQuery({ queryKey: ["client-fund-tasks", fundId], queryFn: () => fetch({ data: { fundId } }) });
  const rows = (q.data ?? []) as any[];
  if (q.isLoading || q.error || !rows.length) return null;
  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="text-lg">Open items</h3>
      <ul className="mt-3 divide-y">
        {rows.map((t) => {
          const s = asResponsibility(t.responsibility_status);
          const od = daysOverdue(t); const w = waitingOnDetail(t, "client", t.investorName);
          return (
            <li key={t.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{t.title}</span><ResponsibilityBadge status={s} />{od > 0 && <span className="text-xs text-destructive">Overdue {od}d</span>}</div>
              {w && <p className="text-sm">{w}</p>}
              <p className="text-xs text-muted-foreground">{t.responsibility_note_client || RESPONSIBILITY_CLIENT_EXPLANATION[s]}{t.due_date ? ` · Due ${fmtDate(t.due_date)}` : ""}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
