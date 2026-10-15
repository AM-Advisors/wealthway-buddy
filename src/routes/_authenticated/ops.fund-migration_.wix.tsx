import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getWixFundStaging } from "@/lib/wix-funds.functions";

export const Route = createFileRoute("/_authenticated/ops/fund-migration_/wix")({
  head: () => ({
    meta: [
      { title: "Wix Funds Review - Harmonious Operations" },
      { name: "description", content: "Funds and investments copied from Wix for review against Harmonious funds." },
      { property: "og:title", content: "Wix Funds Review - Harmonious Operations" },
      { property: "og:description", content: "Review Wix funds and investments before migration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WixFundsPage,
});

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const show = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));
type Row = Awaited<ReturnType<typeof getWixFundStaging>>["rows"][number];

function WixFundsPage() {
  const get = useServerFn(getWixFundStaging);
  const q = useQuery({ queryKey: ["wix-fund-staging"], queryFn: () => get() });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "matched" | "new">("all");
  const [open, setOpen] = useState<Row | null>(null);
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) =>
    (filter === "all" || (filter === "matched") === !!r.match) &&
    (!search || `${r.name} ${r.investments.map((i) => i.name).join(" ")}`.toLowerCase().includes(search.toLowerCase()))), [q.data, search, filter]);
  const matched = (q.data?.rows ?? []).filter((r) => r.match).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Wix funds review</h1>
        <Button asChild size="sm" variant="outline"><Link to="/ops/fund-migration">Back to Fund Migration</Link></Button>
      </div>
      <p className="text-sm text-muted-foreground">Read-only copy of your Wix funds and investments. Tax IDs and bank numbers show only the last four. Nothing here creates or changes a Harmonious fund or investor.</p>
      {q.isLoading ? <p>Loading…</p> : q.error ? <p className="text-destructive">{String(q.error)}</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["Wix funds", q.data!.rows.length], ["Already in Harmonious", matched], ["Not yet in Harmonious", q.data!.rows.length - matched], ["Investments", q.data!.totalInvestments]].map(([l, v]) => (
              <Card key={l as string}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-semibold">{v}</div></CardContent></Card>
            ))}
          </div>
          {q.data!.unlinked > 0 && <p className="text-xs text-muted-foreground">{q.data!.unlinked} Wix investments aren't tied to any Wix fund.</p>}
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="Search fund or investor" value={search} onChange={(e) => setSearch(e.target.value)} />
            {(["all", "matched", "new"] as const).map((f) => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "matched" ? "In Harmonious" : "Not yet in Harmonious"}</Button>)}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Wix fund</TableHead><TableHead>Harmonious fund</TableHead><TableHead className="text-right">Investments</TableHead><TableHead className="text-right">Committed</TableHead><TableHead className="text-right">Received</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.wixId} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.match ? <Badge variant="secondary">{r.match.name}</Badge> : <Badge variant="outline">Not yet</Badge>}</TableCell>
                  <TableCell className="text-right">{r.investments.length}</TableCell>
                  <TableCell className="text-right">{usd(r.committed)}</TableCell>
                  <TableCell className="text-right">{usd(r.received)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.name}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-4 text-sm">
              {open.match && <Link className="text-primary underline" to="/admin/funds/$fundId" params={{ fundId: open.match.id }}>Open {open.match.name} in Harmonious</Link>}
              <dl className="grid grid-cols-[180px_1fr] gap-x-3 gap-y-1">
                {Object.entries(open.details).filter(([k]) => !k.startsWith("link-") && !k.startsWith("_")).map(([k, v]) => (<><dt key={k + "k"} className="text-muted-foreground">{k}</dt><dd key={k + "v"} className="break-all">{show(v)}</dd></>))}
              </dl>
              <h3 className="font-semibold">Investments ({open.investments.length})</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Investor</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Committed</TableHead><TableHead className="text-right">Received</TableHead><TableHead>KYC/AML</TableHead></TableRow></TableHeader>
                <TableBody>{open.investments.map((i) => (
                  <TableRow key={i.id}><TableCell>{i.name}{i.name !== i.person && i.person ? <div className="text-xs text-muted-foreground">{i.person}</div> : null}</TableCell><TableCell className="text-xs">{i.email}</TableCell><TableCell className="text-right">{usd(i.committed)}</TableCell><TableCell className="text-right">{usd(i.received)}</TableCell><TableCell className="text-xs">{show((i.details as any)?.kycAmlStatus ?? "")}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
