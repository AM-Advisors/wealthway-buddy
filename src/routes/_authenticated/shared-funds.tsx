import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { getSharedFund, listMySharedFunds } from "@/lib/fund-team-access.functions";
import { fundTeamRoleLabel } from "@/lib/fund-team-access";

export const Route = createFileRoute("/_authenticated/shared-funds")({
  head: () => ({
    meta: [
      { title: "Shared funds — Harmonious" },
      { name: "description", content: "Funds a Fund Manager has shared with you as a Viewer or Assistant." },
      { property: "og:title", content: "Shared funds — Harmonious" },
      { property: "og:description", content: "Funds shared with you by their Fund Manager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listMySharedFunds);
  const getFn = useServerFn(getSharedFund);
  const list = useQuery({ queryKey: ["my-shared-funds"], queryFn: () => listFn() });
  const [sel, setSel] = useState<string | null>(null);
  const fundId = sel ?? list.data?.funds[0]?.fundId ?? null;
  const fund = useQuery({
    queryKey: ["shared-fund", fundId],
    queryFn: () => getFn({ data: { fundId: fundId! } }),
    enabled: !!fundId,
  });

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="font-heading text-2xl text-foreground">Shared funds</h1>
      {list.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (list.data?.funds.length ?? 0) === 0 ? (
        <p className="text-muted-foreground">No funds have been shared with you.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {list.data!.funds.map((f) => (
              <button
                key={f.fundId}
                onClick={() => setSel(f.fundId)}
                className={`rounded-md border px-3 py-1.5 text-sm ${f.fundId === fundId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}
              >
                {f.name} · {fundTeamRoleLabel(f.role)}
              </button>
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
                          {r.committedCents != null ? `$${(r.committedCents / 100).toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          {fund.isError && <p className="text-sm text-destructive">You no longer have access to this fund.</p>}
        </>
      )}
    </main>
  );
}
