import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { compareContractDocuments } from "@/lib/contract-intelligence.functions";

export const Route = createFileRoute("/_authenticated/ops/contracts/compare")({
  validateSearch: z.object({ before: z.string().uuid().optional(), after: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Compare contract versions — Harmonious operations" },
      { name: "description", content: "Side-by-side comparison of approved contract terms." },
      { property: "og:title", content: "Compare contract versions — Harmonious operations" },
      { property: "og:description", content: "Added, removed and changed contract terms with source language." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Compare,
});

const KIND: Record<string, string> = { added: "Added", removed: "Removed", changed: "Changed", unchanged: "Unchanged" };

function Compare() {
  const { before, after } = Route.useSearch();
  const navigate = useNavigate();
  const load = useServerFn(compareContractDocuments);
  const [filter, setFilter] = useState<"changes" | "all">("changes");
  const q = useQuery({
    queryKey: ["contract-compare", before, after],
    queryFn: () => load({ data: { beforeId: before!, afterId: after! } }),
    enabled: !!before && !!after,
  });
  if (!before || !after) return <p className="p-6 text-sm text-muted-foreground">Choose two documents to compare from a client's Contracts tab.</p>;
  if (q.isPending) return <Skeleton className="m-6 h-96" />;
  if (q.error) return <p className="p-6 text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const d = q.data as any;
  const rows = d.rows.filter((r: any) => (filter === "all" ? true : r.kind !== "unchanged"));
  const groups = ["changed", "added", "removed", "unchanged"].map((k) => [k, rows.filter((r: any) => r.kind === k)] as const);
  const pickDoc = (side: "before" | "after", id: string) =>
    navigate({ to: "/ops/contracts/compare", search: { before: side === "before" ? id : before, after: side === "after" ? id : after } });

  return (
    <div className="space-y-4 px-4 py-6">
      <Link to="/ops/clients/$clientId" params={{ clientId: d.clientId }} search={{ tab: "contracts" } as any} className="text-sm text-muted-foreground underline">
        ← Contracts
      </Link>
      <h1 className="text-2xl">Compare Versions</h1>
      <p className="text-sm text-muted-foreground">
        A mechanical comparison of structured terms. It shows what changed — it does not decide what a change means legally or which provision controls.
        {!d.basedOnApprovedTerms ? " One of these documents isn't approved yet, so some values are still proposals." : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["before", "after"] as const).map((side) => (
          <label key={side} className="space-y-1 text-sm">
            <span className="font-medium">{side === "before" ? "Earlier document" : "Later document"}</span>
            <select className="h-10 w-full rounded-md border bg-background px-3" value={d[side].id} onChange={(e) => pickDoc(side, e.target.value)}>
              {d.documents.map((x: any) => (
                <option key={x.id} value={x.id}>{x.title} · {x.doc_type} · v{x.version}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {Object.entries(d.counts).map(([k, n]) => <Badge key={k} variant="outline">{KIND[k]}: {String(n)}</Badge>)}
        <button className="underline" onClick={() => setFilter(filter === "all" ? "changes" : "all")}>
          {filter === "all" ? "Hide unchanged" : "Show unchanged"}
        </button>
      </div>
      {groups.map(([kind, list]) =>
        list.length ? (
          <Card key={kind}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{KIND[kind]}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {list.map((r: any) => (
                <div key={r.key} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{r.label} {r.highlight ? <Badge variant="secondary" className="ml-1">Key term</Badge> : null}</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Side s={r.before} docId={d.before.id} />
                    <Side s={r.after} docId={d.after.id} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null,
      )}
    </div>
  );
}

function Side({ s, docId }: { s: any; docId: string }) {
  if (!s) return <p className="text-muted-foreground">—</p>;
  return (
    <div className="space-y-1">
      <p>{s.value ?? "—"}{s.amountCents != null ? ` · $${(s.amountCents / 100).toLocaleString()}` : ""}</p>
      {!s.reviewed ? <Badge variant="outline">Not yet reviewed</Badge> : null}
      {s.page || s.section ? (
        <Link to="/ops/contracts/$documentId" params={{ documentId: docId }} className="block text-xs text-muted-foreground underline">
          Source: {s.page ? `page ${s.page}` : ""}{s.section ? ` · ${s.section}` : ""}
        </Link>
      ) : null}
      {s.quote ? <blockquote className="border-l-2 pl-2 text-xs italic text-muted-foreground">“{s.quote}”</blockquote> : null}
    </div>
  );
}

