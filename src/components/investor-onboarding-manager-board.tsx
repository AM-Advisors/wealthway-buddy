import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { managerOnboardingBoardFn } from "@/lib/investor-onboarding.functions";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const money = (cents: number | null | undefined) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function InvestorOnboardingManagerBoard() {
  const boardFn = useServerFn(managerOnboardingBoardFn);
  const board = useQuery({
    queryKey: ["manager-onboarding-board"],
    queryFn: () => boardFn({ data: {} }),
  });

  const items: any[] = (board.data as any)?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investors joining your funds</CardTitle>
        <CardDescription>
          Progress only. Identity checks, tax papers and signed documents stay with Harmonious.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {board.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!board.isLoading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No investors have started yet.</p>
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{item.investorName}</p>
                <p className="text-sm text-muted-foreground">
                  {item.profileLabel ?? "Investor"} · {money(item.requestedAmountCents)}
                  {item.acceptedAmountCents ? ` accepted ${money(item.acceptedAmountCents)}` : ""}
                </p>
              </div>
              <Badge variant="outline">{String(item.stage).replace(/_/g, " ")}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(item.progress ?? []).map((p: any) => (
                <Badge key={p.key} variant="secondary">
                  {p.label}: {String(p.state).replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
