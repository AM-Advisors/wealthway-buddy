import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { listFundDuplicatesFn } from "@/lib/fund-duplicate-resolution.functions";
import { FundDuplicateComparison, STATUS_LABELS } from "@/components/fund-duplicate-comparison";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/fund-duplicates")({
  head: () => ({
    meta: [
      { title: "Fund Duplicate Review — Harmonious Operations" },
      { name: "description", content: "Compare same-named Fund records and record an explicit Harmonious decision." },
      { property: "og:title", content: "Fund Duplicate Review — Harmonious Operations" },
      { property: "og:description", content: "Compare same-named Fund records and record an explicit Harmonious decision." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundDuplicatesPage,
});

function FundDuplicatesPage() {
  const list = useServerFn(listFundDuplicatesFn);
  const q = useQuery({ queryKey: ["fund-duplicates"], queryFn: () => list() });
  const [open, setOpen] = useState<string[] | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Fund Duplicate Review</h1>
        <p className="text-sm text-muted-foreground">
          Harmonious decides whether same-named Funds are the same Fund. Nothing is merged, renamed, archived or deleted automatically.
        </p>
      </header>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && q.data.pairs.length === 0 && <p className="text-sm text-muted-foreground">No duplicate Fund names.</p>}
      <div className="space-y-3">
        {q.data?.pairs.map((p) => (
          <Card key={p.key}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.funds.length} Fund records · {p.funds.map((f) => f.id.slice(0, 8)).join(" / ")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{STATUS_LABELS[p.review?.status ?? "open"]}</Badge>
                <Button size="sm" variant="outline" onClick={() => setOpen(p.funds.slice(0, 2).map((f) => f.id))}>Compare</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {open && <FundDuplicateComparison fundIds={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
