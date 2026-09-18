import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvestorFinancials } from "@/lib/financial-reporting.functions";

const label = (value: string) => value.replaceAll("_", " ");

export function InvestorFinancialsPanel() {
  const load = useServerFn(getInvestorFinancials);
  const query = useQuery({ queryKey: ["investor-financials"], queryFn: () => load() });
  const data: any = query.data ?? { funds: [], reports: [] };
  const nameById = new Map((data.funds ?? []).map((f: any) => [f.id, f.name]));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Fund financial reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Published reports for the funds you are invested in. Internal accounting records are not
        shared here.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Available reports</CardTitle>
          <CardDescription>
            {query.isLoading ? "Loading…" : `${(data.reports ?? []).length} report(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(data.reports ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has been published to you yet. You will see reports here once your fund
              publishes them.
            </p>
          ) : (
            (data.reports as any[]).map((r) => (
              <div key={r.id} className="border-b border-border/60 py-3 text-sm">
                <p className="font-medium capitalize">{label(r.report_type)}</p>
                <p className="text-xs text-muted-foreground">
                  {nameById.get(r.offering_id) ?? "Fund"} · {r.period_start} to {r.period_end} · v
                  {r.version}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
