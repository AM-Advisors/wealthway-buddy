import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FundRoutineWorkspace } from "@/components/fund-routine-workspace";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";

import { getSharedFund, listMySharedFunds } from "@/lib/fund-team-access.functions";
import { fundTeamRoleLabel } from "@/lib/fund-team-access";
import { AssistantDrafts } from "@/components/fund-team-drafts";

export const Route = createFileRoute("/_authenticated/shared-funds")({
  validateSearch: z.object({ fund: z.string().optional(), review: z.enum(["terms", "questions", "document", "side_letter"]).optional(), item: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Shared funds | Harmonious" },
      { name: "description", content: "Harmonious funds shared with viewers, assistants and designated routine reviewers." },
      { property: "og:title", content: "Shared funds | Harmonious" },
      { property: "og:description", content: "Funds shared with you by their Fund Manager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const listFn = useServerFn(listMySharedFunds);
  const getFn = useServerFn(getSharedFund);
  const list = useQuery({ queryKey: ["my-shared-funds"], queryFn: () => listFn() });
  const [sel, setSel] = useState<string | null>(null);
  const fundId = sel ?? (list.data?.funds.some(f => f.fundId === search.fund) ? search.fund : null) ?? list.data?.funds[0]?.fundId ?? null;
  const fund = useQuery({
    queryKey: ["shared-fund", fundId],
    queryFn: () => { if (!fundId) throw new Error("Choose a fund."); return getFn({ data: { fundId } }); },
    enabled: !!fundId,
  });

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="font-heading text-2xl text-foreground">Shared funds</h1>
      {search.fund && !list.isLoading && !list.data?.funds.some(f => f.fundId === search.fund) && <Button asChild><Link to="/manager/fund/$fundId" params={{ fundId: search.fund }}>Open fund review</Link></Button>}
      {list.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (list.data?.funds.length ?? 0) === 0 ? (
        <p className="text-muted-foreground">No funds have been shared with you.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {list.data?.funds.map((f) => (
              <Button
                key={f.fundId}
                onClick={() => setSel(f.fundId)}
                className={`rounded-md border px-3 py-1.5 text-sm ${f.fundId === fundId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}
              >
                {f.name} · {fundTeamRoleLabel(f.role)}
              </Button>
            ))}
          </div>
          {fund.data && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="font-heading text-lg text-foreground">{fund.data.fund.name}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Your access: {fundTeamRoleLabel(fund.data.role)}. Bank, tax ID and identity details are not shown.
              </p>
              {fund.data.roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">No investors yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr><th className="py-2">Investor</th><th>Stage</th><th className="text-right">Committed</th></tr>
                  </thead>
                  <tbody>
                    {fund.data.roster.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-2 text-foreground">{r.name}</td>
                        <td className="text-muted-foreground">{r.stage.replace(/_/g, " ")}</td>
                        <td className="text-right text-foreground">
                          {r.committedCents != null ? `$${(r.committedCents / 100).toLocaleString()}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          {fund.data?.role === "fund_assistant" && fundId && <AssistantDrafts fundId={fundId} />}
          {fund.data?.role === "fund_reviewer" && fundId && <FundRoutineWorkspace key={`${fundId}:${search.review}`} fundId={fundId} initialView={search.review} />}
          {search.fund && !list.data?.funds.some(f => f.fundId === search.fund) && <Button asChild><Link to="/manager/fund/$fundId" params={{ fundId: search.fund }}>Open fund</Link></Button>}
          {fund.isError && <p className="text-sm text-destructive">You no longer have access to this fund.</p>}
        </>
      )}
    </main>
  );
}
