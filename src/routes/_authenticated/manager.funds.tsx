import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getManagerFunds } from "@/lib/manager.functions";

export const Route = createFileRoute("/_authenticated/manager/funds")({
  head: () => ({
    meta: [
      { title: "Funds — Harmonious" },
      { name: "description", content: "The funds you manage on Harmonious." },
      { property: "og:title", content: "Funds — Harmonious" },
      { property: "og:description", content: "The funds you manage on Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerFundsPage,
});

function ManagerFundsPage() {
  const fundsFn = useServerFn(getManagerFunds);
  const { data, isLoading } = useQuery({
    queryKey: ["manager-funds-list"],
    queryFn: () => fundsFn() as Promise<any>,
  });

  const funds: any[] = Array.isArray(data) ? data : (data?.funds ?? []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Funds</h1>
        <p className="text-sm text-muted-foreground">
          Open a fund to see its investors, investments, capital, reports and documents.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading your funds…</p>}

      {!isLoading && funds.length === 0 && (
        <p className="text-sm text-muted-foreground">No funds are assigned to you yet.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {funds.map((fund: any) => {
          const id = String(fund.id ?? fund.offering_id ?? "");
          return (
            <Card key={id}>
              <CardHeader>
                <CardTitle>{fund.name ?? fund.fund_name ?? "Fund"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {fund.status && <p className="text-muted-foreground">{fund.status}</p>}
                {id && (
                  <Link
                    to="/manager/fund/$fundId"
                    params={{ fundId: id }}
                    className="font-medium underline"
                  >
                    Open fund
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
