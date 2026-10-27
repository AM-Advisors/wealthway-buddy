import { useState } from "react";
import { CommercialWorkflowView } from "./commercial-workflow";
import { fictionalCommercialWorkflow } from "@/lib/qa-sandbox/commercial-fixture";
export function QaCommercialWorkflow() {
  const [data, setData] = useState(fictionalCommercialWorkflow);
  return <CommercialWorkflowView data={data} onQualify={async input => {
    if (input.ownerId !== "qa-rep") throw new Error("Choose the fictional Sales owner.");
    setData(current => ({ ...current, inquiries: current.inquiries.filter(i => i.id !== input.leadId) }));
  }} />;
}