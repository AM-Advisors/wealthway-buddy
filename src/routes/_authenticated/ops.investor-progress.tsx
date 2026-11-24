import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { catchUpPriorDocSignaturesFn, priorDocSignatureSummaryFn } from "@/lib/prior-signed-documents.functions";
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
        <p className="text-base text-muted-foreground">KYC, AML, questionnaire, tax form and signatures for every open investment, with what each one is waiting on. Nothing here changes a record.</p>
      </div>
      <LoadedSignaturesCard />
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
                <th className="p-3">Investor</th><th className="p-3">KYC</th><th className="p-3">AML</th><th className="p-3">Questionnaire</th><th className="p-3">Tax form</th><th className="p-3">Signatures</th><th className="p-3">Next step</th>
              </tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.onboardingId} className="border-t align-top">
                  <td className="p-3"><Link to="/ops/fund/$fundId/investor/$onboardingId" params={{ fundId: r.fundId, onboardingId: r.onboardingId }} className="font-medium hover:underline">{r.investorName ?? "Unnamed investor"}</Link><div className="text-muted-foreground">{r.fundName ?? "Fund"}</div></td>
                  <td className="p-3"><div className="flex flex-col items-start gap-1"><Step s={r.kyc} label="ID" />{r.kyb ? <Step s={r.kyb} label="Entity" /> : null}</div></td>
                  <td className="p-3"><Step s={r.aml} /></td>
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

/** Loaded (outside-signed) documents: check remaining ones and download who each is waiting on. No emails. */
function LoadedSignaturesCard() {
  const catchUp = useServerFn(catchUpPriorDocSignaturesFn);
  const summary = useServerFn(priorDocSignatureSummaryFn);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const label: Record<string, string> = { complete: "Completed", waiting: "Waiting on signature", needs_check: "Check signatures", not_read: "Not checked yet" };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
      <span className="flex-1">Documents loaded per investor are treated as completed outside the platform once their signatures are found.{left !== null ? ` ${left} left to check.` : ""}</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try { let r = await catchUp({ data: { limit: 10 } }); setLeft(r.remaining); while (r.remaining > 0 && r.processed > 0) { r = await catchUp({ data: { limit: 10 } }); setLeft(r.remaining); } toast.success("All loaded documents checked."); }
        catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? "Checking…" : "Check remaining"}</Button>
      <Button size="sm" variant="outline" onClick={async () => {
        try {
          const rows = await summary();
          const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const csv = ["Fund,Investor,Document,Status,Waiting on,Signed on", ...rows.map((r) => [r.fund, r.investor, r.document, label[r.state] ?? r.state, r.waitingOn, r.signedOn].map(esc).join(","))].join("\n");
          const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "loaded-document-signatures.csv"; a.click();
        } catch (e) { toast.error((e as Error).message); }
      }}>Download summary</Button>
    </div>
  );
}
