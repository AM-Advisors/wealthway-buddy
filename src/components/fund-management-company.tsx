import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEntity } from "@/lib/entities.functions";
import { invalidateFund } from "@/lib/fund-query-keys";
import { MANAGEMENT_COMPANY_LABEL, managementCompanyStatus, type ManagementCompanySuggestion } from "@/lib/request-setup-wiring";

type Company = { id: string; legalName: string; status: string };
const STATUS: Record<string, string> = { planned: "Being set up", forming: "Forming", active: "Active", closed: "Closed" };

/**
 * The fund's management company on Team & Signatory. The fund request's answer (new or transfer)
 * sets the starting status; the company is saved as a client entity linked to this fund through the
 * existing entity save, which keeps its own authority check.
 */
export function FundManagementCompany({ offeringId, clientId, suggestion, companies, canAdd }: { offeringId: string; clientId: string | null; suggestion: ManagementCompanySuggestion | null; companies: Company[]; canAdd: boolean }) {
  const qc = useQueryClient();
  const save = useServerFn(saveEntity);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!suggestion && !companies.length) return null;
  const path = suggestion?.path ?? "setup";
  const add = async () => {
    if (!clientId || name.trim().length < 2) return void toast.error("Enter the management company's legal name.");
    setBusy(true);
    try {
      await save({ data: { clientId, entityType: "management_company", legalName: name.trim(), offeringId, status: managementCompanyStatus(path), taxIdStatus: "not_started", notes: suggestion ? `From the fund request: ${MANAGEMENT_COMPANY_LABEL[path]}` : null } });
      toast.success("Management company recorded");
      setName("");
      void invalidateFund(qc, offeringId);
      void qc.invalidateQueries({ queryKey: ["fund-setup-canonical", offeringId] });
    } catch (e: any) { toast.error(e?.message ?? "Could not save"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-xl border bg-background p-4">
      <p className="text-sm font-medium">Management company</p>
      {suggestion && <p className="text-sm text-muted-foreground">From the fund request: <span className="text-foreground">{MANAGEMENT_COMPANY_LABEL[suggestion.path]}</span></p>}
      {companies.length > 0 ? (
        <ul className="space-y-1 text-sm">{companies.map((c) => <li key={c.id} className="flex justify-between gap-2"><span>{c.legalName}</span><span className="text-muted-foreground">{STATUS[c.status] ?? c.status}</span></li>)}</ul>
      ) : <p className="text-sm text-muted-foreground">No management company recorded for this fund yet.</p>}
      {canAdd && clientId && companies.length === 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor={`mc-${offeringId}`}>{path === "transfer" ? "Existing company's legal name" : "New company's legal name"}</Label>
            <Input id={`mc-${offeringId}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Example Management LLC" />
          </div>
          <Button size="sm" disabled={busy} onClick={() => void add()}>{busy ? "Saving…" : "Record company"}</Button>
        </div>
      )}
    </div>
  );
}
