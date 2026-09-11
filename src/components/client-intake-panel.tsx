import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getClientIntakes, REG_TYPES } from "@/lib/client-intake.functions";
import { Badge } from "@/components/ui/badge";

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

const money = (value: string | undefined) => {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
};

const regLabel = (v: string) => REG_TYPES.find((r) => r.value === v)?.label ?? v ?? "—";

/** Staff view: the fund details the client filled in when they first signed in. */
export function ClientIntakePanel({ clientId }: { clientId: string }) {
  const load = useServerFn(getClientIntakes);
  const { data } = useQuery({
    queryKey: ["client-intakes", clientId],
    queryFn: () => load({ data: { clientId } }),
  });

  const intakes = (data?.intakes ?? []) as any[];

  return (
    <div>
      <h3 className="text-sm font-medium">Fund details from the client</h3>
      {intakes.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing submitted yet. Their main contacts see this form the first time they sign in.
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {intakes.map((row) => {
            const d = (row.details ?? {}) as Record<string, any>;
            return (
              <li key={row.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{d.fund_name || "Not named yet"}</span>
                  <Badge variant={row.status === "draft" ? "outline" : "secondary"}>
                    {row.status === "draft" ? "Still being filled in" : `Submitted ${when(row.submitted_at)}`}
                  </Badge>
                </div>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <Row label="Legal entity" value={d.legal_entity_name} />
                  <Row label="Entity type" value={d.entity_type} />
                  <Row label="Formed" value={[d.state_formed, d.date_formed].filter(Boolean).join(" · ")} />
                  <Row label="Kind of fund" value={d.fund_type === "Other" ? d.fund_type_other : d.fund_type} />
                  <Row label="Exemption" value={d.reg_type ? regLabel(d.reg_type) : ""} />
                  <Row label="Target raise" value={money(d.target_raise)} />
                  <Row label="Minimum investment" value={money(d.min_investment)} />
                  <Row label="Expected investors" value={d.expected_investors} />
                  <Row label="General partner" value={personLine(d.general_partner)} />
                  <Row label="Signatory" value={personLine(d.signatory)} />
                  <Row label="Lawyer" value={personLine(d.lawyer)} />
                  <Row label="Accountant" value={personLine(d.accountant)} />
                  <Row label="Bank contact" value={personLine(d.bank_contact)} />
                  <Row label="EIN" value={d.has_ein ? d.ein || "Yes" : "Not yet"} />
                  <Row label="Bank" value={d.bank_name} />
                  <Row label="Distributions from" value={d.distribution_source} />
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function personLine(p: any) {
  if (!p) return "";
  return [p.name, p.firm, p.email].filter((v) => String(v ?? "").trim() !== "").join(" · ");
}

function Row({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{String(value ?? "").trim() === "" ? "—" : value}</dd>
    </div>
  );
}
