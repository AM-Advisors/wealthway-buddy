import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { useApprovalsInbox } from "@/components/approvals-inbox-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { matchesSearch } from "@/lib/approvals-inbox";

export const Route = createFileRoute("/_authenticated/ops/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals inbox | Harmonious Operations" },
      { name: "description", content: "Every review and approval waiting on Harmonious, oldest first, in one list." },
      { property: "og:title", content: "Approvals inbox | Harmonious Operations" },
      { property: "og:description", content: "Every review and approval waiting on Harmonious in one list." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalsInbox,
});

function ApprovalsInbox() {
  const q = useApprovalsInbox();
  const [search, setSearch] = useState("");
  const [stalledOnly, setStalledOnly] = useState(false);
  const items = q.data?.items ?? [];
  const shown = useMemo(() => items.filter((i) => matchesSearch(i, search) && (!stalledOnly || i.stalled)), [items, search, stalledOnly]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof shown>();
    for (const i of shown) {
      const k = i.fundName ?? i.clientName ?? "Not tied to a fund";
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Approvals inbox</h1>
        <p className="text-base text-muted-foreground">Every review and approval waiting on Harmonious, oldest first. Tap one to open it where you approve it.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search approvals" className="h-11 pl-9 text-base" placeholder="Search fund, investor or item" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="button" onClick={() => setStalledOnly((v) => !v)} className={`h-11 rounded-md border px-4 text-sm ${stalledOnly ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
          Waiting 3+ days ({q.data?.stalled ?? 0})
        </button>
      </div>
      {q.isLoading ? <p className="text-muted-foreground">Loading…</p> :
       q.error ? <p className="text-destructive">{(q.error as Error).message}</p> :
       shown.length === 0 ? <Card><CardContent className="py-8 text-center text-base text-muted-foreground">{items.length ? "Nothing matches that search." : "Nothing is waiting for approval."}</CardContent></Card> :
       groups.map(([name, rows]) => (
        <section key={name} className="space-y-2">
          <h2 className="text-base font-semibold">{name} <span className="font-normal text-muted-foreground">({rows.length})</span></h2>
          <Card><CardContent className="divide-y p-0">
            {rows.map((i) => (
              <Link key={i.id} to={i.destination as never} className="flex flex-wrap items-center gap-3 px-4 py-4 hover:bg-muted">
                <Badge variant={i.requiredAction === "approve" ? "default" : "secondary"}>{i.requiredAction === "approve" ? "Approve" : "Review"}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium">{i.title}</p>
                  <p className="text-sm text-muted-foreground">{[i.investorName, i.reason, i.assignedToName ? `Owner: ${i.assignedToName}` : "No owner yet"].filter(Boolean).join(" · ")}</p>
                </div>
                {i.stalled ? <Badge variant="destructive">Waiting {i.days} days</Badge> : <span className="text-sm text-muted-foreground">{i.days === 0 ? "Today" : `${i.days}d`}</span>}
              </Link>
            ))}
          </CardContent></Card>
        </section>
      ))}
    </div>
  );
}
