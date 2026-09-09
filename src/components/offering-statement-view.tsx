import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOfferingStatement } from "@/lib/offering-statement.functions";

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function percent(bps: number | null | undefined) {
  if (bps === null || bps === undefined) return null;
  return `${bps / 100}%`;
}

function years(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return `${value} years`;
}

function date(value: string | null | undefined) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function OfferingStatementView({
  offeringId,
  canManage,
}: {
  offeringId: string;
  canManage?: boolean;
}) {
  const load = useServerFn(getOfferingStatement);
  const { data, isLoading } = useQuery({
    queryKey: ["offering-statement", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const s: any = data?.statement ?? null;
  if (!s) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          {canManage
            ? "No offering terms yet. Add them on the offering statement page and publish when they are ready."
            : "The offering terms for this fund have not been published yet."}
        </CardContent>
      </Card>
    );
  }

  const facts: Array<[string, string | null]> = [
    ["What you receive", s.security_type || null],
    ["Target raise", money(s.target_raise_cents)],
    ["Minimum investment", money(s.min_investment_cents)],
    ["Maximum investment", money(s.max_investment_cents)],
    ["Management fee", percent(s.management_fee_bps)],
    ["Carried interest", percent(s.carried_interest_bps)],
    ["Preferred return", percent(s.preferred_return_bps)],
    ["Fund term", years(s.fund_term_years)],
    ["Investment period", years(s.investment_period_years)],
    ["First closing", date(s.first_closing_date)],
    ["Final closing", date(s.final_closing_date)],
  ];
  const shown = facts.filter(([, value]) => Boolean(value));

  const sections: Array<[string, string]> = (
    [
      ["Capital calls", s.capital_call_terms],
      ["Distributions", s.distribution_policy],
      ["Fees and expenses", s.fees_and_expenses],
      ["Transfers and withdrawals", s.transfer_restrictions],
      ["Reporting", s.reporting],
      ["Other terms", s.other_terms],
    ] as Array<[string, string]>
  ).filter(([, body]) => Boolean(body && body.trim()));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>{s.headline || "Offering statement"}</CardTitle>
          <CardDescription>
            {s.published_at
              ? `Published ${new Date(s.published_at).toLocaleDateString()}`
              : "Draft — not visible to investors yet"}
          </CardDescription>
        </div>
        {s.is_published ? null : <Badge variant="secondary">Draft</Badge>}
      </CardHeader>
      <CardContent className="space-y-6">
        {s.summary ? <p className="whitespace-pre-wrap text-sm">{s.summary}</p> : null}

        {shown.length > 0 && (
          <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {sections.map(([label, body]) => (
          <div key={label} className="space-y-1">
            <h3 className="text-sm font-semibold">{label}</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
