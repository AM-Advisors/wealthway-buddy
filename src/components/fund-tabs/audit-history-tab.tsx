import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fundAuditHistoryFn } from "@/lib/fund-audit.functions";

const when = (d: string) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function AuditHistoryTab({ fundId }: { fundId: string }) {
  const load = useServerFn(fundAuditHistoryFn);
  const q = useQuery({ queryKey: ["fund-audit", fundId], queryFn: () => load({ data: { fundId } }) });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (q.error) return <p className="text-sm text-destructive">Couldn't load audit history.</p>;
  const f = filter.trim().toLowerCase();
  const rows = (q.data ?? []).filter((r) => !f || `${r.who} ${r.action} ${r.source} ${r.status ?? ""}`.toLowerCase().includes(f));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Audit History</h2>
          <p className="text-sm text-muted-foreground">Who submitted or changed what on this fund, and when. Read-only.</p>
        </div>
        <Input placeholder="Search person or action" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No history recorded yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((r) => {
            const isOpen = !!open[r.id];
            return (
              <li key={r.id} className="p-3">
                <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((o) => ({ ...o, [r.id]: !isOpen }))} disabled={!r.details.length}>
                  {r.details.length ? (isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />) : <span className="w-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.action}</span>
                      {r.status && <Badge variant="secondary">{r.status}</Badge>}
                      <Badge variant="outline">{r.source}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.who}{r.role ? ` · ${r.role}` : ""} · {when(r.at)}</p>
                  </div>
                </button>
                {isOpen && (
                  <dl className="ml-6 mt-2 grid gap-1 rounded bg-muted/50 p-2 text-xs sm:grid-cols-[180px_1fr]">
                    {r.details.map((d, i) => (<><dt key={`k${i}`} className="text-muted-foreground">{d.label}</dt><dd key={`v${i}`} className="break-words">{d.value}</dd></>))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
