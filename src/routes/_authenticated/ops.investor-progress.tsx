import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/load-error";
import { getInvestorSigningProgress } from "@/lib/investor-signing-progress.functions";
import { taxFormLabel, type StepState } from "@/lib/investor-signing-progress-model";

export const Route = createFileRoute("/_authenticated/ops/investor-progress")({
  head: () => ({
    meta: [
      { title: "Investor progress | Harmonious Operations" },
      { name: "description", content: "Questionnaire, tax form and signature status for every open investment, with the next step." },
      { property: "og:title", content: "Investor progress | Harmonious Operations" },
      { property: "og:description", content: "Questionnaire, tax form and signature status for every open investment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestorProgressPage,
});

const STATE: Record<StepState, { label: string; variant: "default" | "secondary" | "outline" }> = {
  done: { label: "Done", variant: "default" },
  in_progress: { label: "In progress", variant: "secondary" },
  not_started: { label: "Not started", variant: "outline" },
};

function Step({ s, label }: { s: StepState; label?: string }) {
  return <Badge variant={STATE[s].variant}>{label ? `${label} · ` : ""}{STATE[s].label}</Badge>;
}

function InvestorProgressPage() {
  const load = useServerFn(getInvestorSigningProgress);
  const q = useQuery({ queryKey: ["ops-investor-progress"], queryFn: () => load() });
  const [search, setSearch] = useState("");
  const [fund, setFund] = useState("all");
  const rows = q.data?.rows ?? [];
  const funds = useMemo(() => [...new Map(rows.map((r) => [r.fundId, r.fundName ?? "Fund"])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const term = search.trim().toLowerCase();
  const shown = rows.filter((r) => (fund === "all" || r.fundId === fund) && (!term || `${r.investorName ?? ""} ${r.fundName ?? ""}`.toLowerCase().includes(term)));
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl">Investor progress</h1>
        <p className="text-base text-muted-foreground">Questionnaire, tax form and signatures for every open investment, with what each one is waiting on. Nothing here changes a record.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Search investors" placeholder="Search by investor or fund" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select aria-label="Fund" className="min-h-10 rounded-md border bg-background px-3 text-base" value={fund} onChange={(e) => setFund(e.target.value)}>
          <option value="all">All funds</option>{funds.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      {q.isError ? <LoadError error={q.error} what="Investor progress" onRetry={() => q.refetch()} />
        : q.isLoading ? <p className="text-muted-foreground">Loading investor progress…</p>
        : !shown.length ? <p className="text-muted-foreground">No open investments match.</p>
        : <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="p-3">Investor</th><th className="p-3">Questionnaire</th><th className="p-3">Tax form</th><th className="p-3">Signatures</th><th className="p-3">Next step</th>
              </tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.onboardingId} className="border-t align-top">
                  <td className="p-3"><Link to="/ops/fund/$fundId/investor/$onboardingId" params={{ fundId: r.fundId, onboardingId: r.onboardingId }} className="font-medium hover:underline">{r.investorName ?? "Unnamed investor"}</Link><div className="text-muted-foreground">{r.fundName ?? "Fund"}</div></td>
                  <td className="p-3"><Step s={r.questionnaire} /></td>
                  <td className="p-3"><Step s={r.taxForm} label={taxFormLabel(r.taxFormType)} /></td>
                  <td className="p-3"><Step s={r.signature} />{r.signaturesCompleted ? <div className="mt-1 text-muted-foreground">{r.signaturesCompleted} signed</div> : null}</td>
                  <td className="p-3">{r.nextStep}{r.blocked ? <div className="mt-1"><Badge variant="destructive">On hold</Badge></div> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
    </div>
  );
}
