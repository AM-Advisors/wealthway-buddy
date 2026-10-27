import { useState } from "react";
import { CommercialWorkflowView } from "./commercial-workflow";
import { fictionalCommercialWorkflow } from "@/lib/qa-sandbox/commercial-fixture";
import { FundSalesHandoffView } from "./fund-sales-handoff";
import type { HandoffData } from "@/lib/sales-operations-handoff-model";
export function QaCommercialWorkflow() {
  const [data, setData] = useState(fictionalCommercialWorkflow);
  const [handoff, setHandoff] = useState<HandoffData>({ owners: [{ id: "qa-ops", name: "Morgan Reed" }], rows: [{ quoteId: "qa-quote-1", quoteNumber: "FABLE-Q001", title: "Fablewood Ventures fund setup", taskId: null, ownerId: null, ownerName: null, dueDate: null, status: "open", canAssign: true, canReceive: false }] });
  return <div className="space-y-6"><CommercialWorkflowView data={data} onQualify={async input => {
    if (input.ownerId !== "qa-rep") throw new Error("Choose the fictional Sales owner.");
    setData(current => ({ ...current, inquiries: current.inquiries.filter(i => i.id !== input.leadId) }));
  }} /><FundSalesHandoffView data={handoff} onSave={async input => {
    setHandoff(current => ({ ...current, rows: current.rows.map(row => row.quoteId !== input.quoteId ? row : input.action === "assign" ? { ...row, ownerId: input.ownerId ?? null, ownerName: "Morgan Reed", dueDate: input.dueDate ?? null, canReceive: true, status: "open" } : { ...row, status: input.action === "acknowledge" ? "in_progress" : "done", canAssign: input.action !== "complete", canReceive: input.action !== "complete" }) }));
  }} /></div>;
}