import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { getMyPortfolioValue } from "@/lib/cap-table.functions";
import { portfolioRowsFromResponse } from "@/lib/my-portfolio-merge";
import { MyPersonalInvestmentLinks } from "@/components/personal-investment-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Investor portal home: the signed-in person's own funds. Shared by /investor and the fictional sandbox. */
function money(cents: number | null | undefined) {
  if (cents == null) return "-";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function InvestorHome() {
  const load = useServerFn(getMyPortfolioValue);
  const { data, isLoading } = useQuery({ queryKey: ["my-portfolio-value"], queryFn: () => load() });
  const funds: any[] = portfolioRowsFromResponse(data);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">My investments</h1>
        <p className="text-sm text-muted-foreground">Open a fund to see its documents, deal room, payments, taxes and messages.</p>
      </div>
      <MyPersonalInvestmentLinks />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : funds.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          You don't have any investments yet. If you were invited to a fund, use the link in your invitation to begin.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {funds.map((f) => (
            <Link key={f.offering_id} to="/investor/fund/$offeringId" params={{ offeringId: f.offering_id }}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <CardTitle className="text-base">{f.offering_name}</CardTitle>
                  <CardDescription>{f.share_class}{f.reg_type ? ` · Reg D ${f.reg_type}` : ""}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Committed</p><p className="font-semibold">{money(f.commitment_cents)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Received</p><p className="font-semibold">{money(f.funded_cents)}</p></div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
