import { useState } from "react";
import { CommercialWorkflowView } from "./commercial-workflow";
import { fictionalCommercialWorkflow } from "@/lib/qa-sandbox/commercial-fixture";
import { FundSalesHandoffView } from "./fund-sales-handoff";
import type { HandoffData } from "@/lib/sales-operations-handoff-model";
import { RequestTaskProgressView } from "./fund-requests";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SearchableSelect } from "./ui/searchable-select";
import { validateOperationsTransfer, type RequestTaskProgress } from "@/lib/fund-request-handoff-model";
import { ArrowRight } from "lucide-react";
export function QaCommercialWorkflow() {
  const [data, setData] = useState(fictionalCommercialWorkflow);
  const [handoff, setHandoff] = useState<HandoffData>({ owners: [{ id: "qa-ops", name: "Morgan Reed" }], rows: [{ quoteId: "qa-quote-1", quoteNumber: "FABLE-Q001", title: "Fablewood Ventures fund setup", taskId: null, ownerId: null, ownerName: null, dueDate: null, status: "open", canAssign: true, canReceive: false }] });
  return <div className="space-y-6"><CommercialWorkflowView data={data} onQualify={async input => {
    if (input.ownerId !== "qa-rep") throw new Error("Choose the fictional Sales owner.");
    setData(current => ({ ...current, inquiries: current.inquiries.filter(i => i.id !== input.leadId) }));
  }} /><FundSalesHandoffView data={handoff} onSave={async input => {
    setHandoff(current => ({ ...current, rows: current.rows.map(row => row.quoteId !== input.quoteId ? row : input.action === "assign" ? { ...row, ownerId: input.ownerId ?? null, ownerName: "Morgan Reed", dueDate: input.dueDate ?? null, canReceive: true, status: "open" } : { ...row, status: input.action === "acknowledge" ? "in_progress" : "done", canAssign: input.action !== "complete", canReceive: input.action !== "complete" }) }));
  }} /><QaRequestTransfer /></div>;
}

function QaRequestTransfer() {
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [task, setTask] = useState<RequestTaskProgress>({ id: "qa-request-task", status: "open", team: "sales", ownerName: "Avery Quinn", dueDate: null });
  const transfer = () => {
    validateOperationsTransfer({ owner, dueDate: due, roles: ["operations"], status: "SUBMITTED", taskId: task.id });
    setTask({ ...task, team: "operations", status: "in_progress", ownerName: "Morgan Reed", dueDate: due });
  };
  return <section className="space-y-3 border-t pt-4" aria-label="Request transfer">
    <h2 className="text-lg font-semibold">Fablewood Ventures · Document request</h2>
    <p className="text-sm">Request: {task.team === "sales" ? "Submitted" : task.status === "done" ? "Completed" : "Harmonious Review"}</p>
    <RequestTaskProgressView task={task} />
    {task.team === "sales" ? <div className="flex flex-wrap items-end gap-2">
      <SearchableSelect aria-label="Request receiving owner" className="w-56" value={owner} onValueChange={setOwner} options={[{ value: "qa-ops", label: "Morgan Reed" }]} />
      <Input aria-label="Request deadline" className="w-40" type="date" value={due} onChange={e => setDue(e.target.value)} />
      <Button variant="outline" disabled={!owner || !due} onClick={transfer}><ArrowRight className="mr-2 size-4" />Transfer request to Operations</Button>
    </div> : task.status !== "done" ? <Button onClick={() => setTask({ ...task, status: "done" })}>Complete request</Button> : null}
  </section>;
}