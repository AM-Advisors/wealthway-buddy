import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { fmtDate, fmtNumber, useCapTable } from "./captable-context";
import { CapTableError, CapTableLoading } from "./captable-states";

export function CapTableSettings() {
  const { workspace, isLoading, error, setCompanyId, companyId } = useCapTable();
  if (isLoading) return <CapTableLoading />;
  if (error) return <CapTableError error={error} />;

  const companies = workspace?.companies ?? [];
  const company = workspace?.company ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company</CardTitle>
          <CardDescription>
            Choose which set of records you are working in. Demo records are clearly marked and can
            never be edited or mixed with your real records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No company records yet. Harmonious sets your company up when your agreement is in
              place.
            </p>
          ) : (
            companies.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.name}</span>
                  {item.isDemo ? <Badge variant="secondary">Demo</Badge> : null}
                </div>
                {item.id === companyId ? (
                  <Badge>Selected</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setCompanyId(item.id)}>
                    Switch
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {company ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company details</CardTitle>
            <CardDescription>Held on record by Harmonious</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-0 text-sm sm:grid-cols-2">
            <Detail label="Legal name" value={company.legalName ?? company.name} />
            <Detail label="Entity type" value={company.entityType ?? "—"} />
            <Detail label="Jurisdiction" value={company.jurisdiction ?? "—"} />
            <Detail label="Incorporated" value={fmtDate(company.incorporationDate)} />
            <Detail label="Authorised shares" value={fmtNumber(company.authorizedShares)} />
            <Detail label="Par value" value={company.parValue === null ? "—" : String(company.parValue)} />
            <Detail label="Fiscal year end" value={company.fiscalYearEnd ?? "—"} />
            <Detail label="Currency" value={company.currency} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
