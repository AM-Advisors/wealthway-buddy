import { useQuery } from "@tanstack/react-query";
import { getInvestorStallReport } from "@/lib/investor-stall.functions";
import { STALL_LABEL, type StallReason } from "@/lib/investor-stall-model";

export function InvestorStallReport() {
  const q = useQuery({ queryKey: ["investor-stall-report"], queryFn: () => getInvestorStallReport() });
  if (q.isError) return null;
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading where investors are stuck…</p>;
  if (!q.data.total) return null;
  const reasons = Object.keys(STALL_LABEL) as StallReason[];
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Where investors are stuck ({q.data.total} not past About You)</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-1 pr-3">Fund</th><th className="pr-3">Total</th><th className="pr-3">No activity 14+ days</th>{reasons.map((r) => <th key={r} className="pr-3">{STALL_LABEL[r]}</th>)}</tr>
          </thead>
          <tbody>
            {q.data.funds.map((f) => (
              <tr key={f.fund} className="border-t"><td className="py-1 pr-3">{f.fund}</td><td>{f.total}</td><td>{f.stale}</td>{reasons.map((r) => <td key={r}>{f.reasons[r]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
