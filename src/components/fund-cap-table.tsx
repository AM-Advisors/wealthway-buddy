import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { capTableCsv, type CapRow } from "@/lib/fund-cap-table";
import { getFundCapTable } from "@/lib/fund-cap-table.functions";

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function termText(t: CapRow["terms"][number]) {
  const base = t.classValue == null ? "—" : `${t.classValue}%`;
  return t.overrideText ? `${base} (class), ${t.overrideText} per side letter` : base;
}

export function FundCapTable({ fundId, sideLettersHref }: { fundId: string; sideLettersHref?: string }) {
  const load = useServerFn(getFundCapTable);
  const q = useQuery({ queryKey: ["fund-cap-table", fundId], queryFn: () => load({ data: { fundId } }) });
  const [cls, setCls] = useState("all");
  const [letter, setLetter] = useState("all");

  const rows = useMemo(() => {
    const all = q.data?.rows ?? [];
    return all.filter((r) =>
      (cls === "all" || (r.classKey || "Unassigned") === cls) &&
      (letter === "all" || (letter === "yes" ? !!r.sideLetter : !r.sideLetter)));
  }, [q.data, cls, letter]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading cap table…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([capTableCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "fund-cap-table.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Investors" value={String(d.totals.investors)} />
        <Stat label="Total commitments" value={usd(d.totals.commitCents)} />
        <Stat label="Funded (reconciled)" value={usd(d.totals.fundedCents)} />
      </div>
      {!d.hasApprovedTerms && (
        <p className="text-sm text-muted-foreground">No approved Fund terms yet, so class terms show as "—".</p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">By class</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {d.classes.length === 0 && <p className="text-sm text-muted-foreground">No investors yet.</p>}
          {d.classes.map((c) => (
            <div key={c.classKey}>
              <div className="flex justify-between text-sm">
                <span>{c.classKey} · {c.investors} investor{c.investors === 1 ? "" : "s"}</span>
                <span>{usd(c.commitCents)} · {c.pctCommitted}%</span>
              </div>
              <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${c.pctCommitted}%` }} /></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Investors</CardTitle>
          <div className="flex flex-wrap gap-2 text-sm">
            <select className="rounded border bg-background px-2 py-1" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class">
              <option value="all">All classes</option>
              {d.classes.map((c) => <option key={c.classKey} value={c.classKey}>{c.classKey}</option>)}
            </select>
            <select className="rounded border bg-background px-2 py-1" value={letter} onChange={(e) => setLetter(e.target.value)} aria-label="Side letter">
              <option value="all">Any side letter</option>
              <option value="yes">Has side letter</option>
              <option value="no">No side letter</option>
            </select>
            <Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Investor</th><th className="pr-3">Class</th><th className="pr-3">Stage</th>
                <th className="pr-3 text-right">Commitment</th><th className="pr-3 text-right">Funded</th>
                <th className="pr-3 text-right">Units</th><th className="pr-3 text-right">% committed</th>
                <th className="pr-3 text-right">% funded</th><th className="pr-3">Effective terms</th><th>Side letter</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-2 pr-3"><div className="font-medium">{r.investorName}</div>{r.profileName && <div className="text-xs text-muted-foreground">{r.profileName}</div>}</td>
                  <td className="pr-3">{r.classKey || "Unassigned"}</td>
                  <td className="pr-3 capitalize">{(r.stage ?? "—").replace(/_/g, " ")}</td>
                  <td className="pr-3 text-right">{usd(r.commitmentCountedCents)}</td>
                  <td className="pr-3 text-right">{usd(r.fundedCountedCents)}</td>
                  <td className="pr-3 text-right">{r.units ?? "—"}</td>
                  <td className="pr-3 text-right">{r.pctCommitted}%</td>
                  <td className="pr-3 text-right">{r.pctFunded}%</td>
                  <td className="pr-3 text-xs">
                    {r.terms.map((t) => (
                      <div key={t.label} className={t.overrideText ? "font-medium text-primary" : ""}>{t.label}: {termText(t)}</div>
                    ))}
                  </td>
                  <td>
                    {r.sideLetter ? (
                      <a href={sideLettersHref} className="inline-flex gap-1">
                        <Badge variant={r.sideLetter.status === "active" ? "default" : "secondary"}>
                          {r.sideLetter.status === "active" ? `Active · ${r.sideLetter.termCount} terms` : r.sideLetter.status === "proposed" ? "Pending approval" : "Expired"}
                        </Badge>
                        {r.sideLetter.mfn && <Badge variant="outline">MFN</Badge>}
                      </a>
                    ) : <span className="text-muted-foreground">None</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="py-4 text-muted-foreground">No investors match.</td></tr>}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">View only. Funded counts only reconciled bank matches. Side letter terms are shown for reference and don't change fees or distributions.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{value}</div></CardContent></Card>;
}
