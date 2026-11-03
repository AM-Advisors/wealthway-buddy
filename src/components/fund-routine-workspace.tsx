import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFundSetupOverview, saveFundSetupFieldsFn } from "@/lib/fund-setup-canonical.functions";
import { EconomicsCard } from "./fund-setup-canonical";
import { OfferingDocumentsSetup } from "./offering-documents-setup";
import { FundQuestionSectionCard } from "./fund-question-section-card";
import { SideLetterRegistry } from "./side-letter-registry";
import { toast } from "sonner";

export function FundRoutineWorkspace({ fundId, initialView }: { fundId: string; initialView?: string }) {
  const [view, setView] = useState(initialView ?? "details");
  const load = useServerFn(getFundSetupOverview);
  const save = useServerFn(saveFundSetupFieldsFn);
  const qc = useQueryClient();
  const key = ["fund-setup-canonical", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { offeringId: fundId } }) });
  const [minimum, setMinimum] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); };
  if (q.isError) return <p role="alert">{q.error.message}</p>;
  if (!q.data) return <p>Loading fund work…</p>;
  const d = q.data;
  async function update() {
    const dollars = Number(minimum ?? Number(d.offering.minInvestmentCents) / 100);
    if (!Number.isFinite(dollars) || dollars < 0) { toast.error("Enter a valid minimum."); return; }
    setBusy(true);
    try { await save({ data: { offeringId: fundId, fields: { minInvestmentCents: Math.round(dollars * 100) } } }); toast.success("Minimum saved"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5"><nav aria-label="Routine fund work" className="flex flex-wrap gap-2">{[["details", "Details"], ["terms", "Fees and terms"], ["questions", "Questions"], ["document", "Documents"], ["side_letter", "Side letters"]].map(([id, label]) => <Button key={id} variant={view === id ? "default" : "outline"} onClick={() => setView(id)}>{label}</Button>)}</nav>
    {view === "details" && <div className="space-y-3"><h2 className="text-lg font-semibold">{d.offering.displayName}</h2><label htmlFor="routine-minimum">Minimum investment</label><div className="flex gap-2"><Input id="routine-minimum" type="number" min="0" value={minimum ?? String(Number(d.offering.minInvestmentCents) / 100)} onChange={e => setMinimum(e.target.value)} /><Button disabled={busy} onClick={() => void update()}>Save</Button></div></div>}
    {view === "terms" && <EconomicsCard d={d} offeringId={fundId} onSaved={refresh} />}
    {view === "questions" && <FundQuestionSectionCard offeringId={fundId} />}
    {view === "document" && <OfferingDocumentsSetup offeringId={fundId} onChanged={refresh} />}
    {view === "side_letter" && <SideLetterRegistry fundId={fundId} />}
  </section>;
}