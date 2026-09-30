import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getFundServicesFn, saveFundServiceFieldsFn, moveFundServiceFn, addBoiPartyFn, updateBoiPartyFn,
} from "@/lib/fund-services.functions";
import { SERVICE_LABELS, STATUS_LABELS, COMPLETED_LABEL, isDone, type ServiceKind, type ServiceStatus } from "@/lib/fund-services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS: Record<ServiceKind, { key: string; label: string; type?: string }[]> = {
  formation: [
    { key: "state", label: "State of formation" }, { key: "entityType", label: "Entity type (e.g. LLC, LP)" },
    { key: "registeredAgent", label: "Registered agent" }, { key: "submittedOn", label: "Submitted on", type: "date" },
    { key: "completedOn", label: "Approved on", type: "date" }, { key: "confirmationNumber", label: "State file number" },
    { key: "notes", label: "Notes" },
  ],
  ein: [
    { key: "responsibleParty", label: "Responsible party (name only)" }, { key: "submittedOn", label: "Submitted on", type: "date" },
    { key: "completedOn", label: "EIN received on", type: "date" }, { key: "notes", label: "Notes" },
  ],
  boi: [
    { key: "submittedOn", label: "Submitted on", type: "date" }, { key: "completedOn", label: "Accepted on", type: "date" },
    { key: "confirmationNumber", label: "FinCEN confirmation number" }, { key: "exemptionReason", label: "Exemption reason (if exempt)" },
    { key: "notes", label: "Notes" },
  ],
};

const MOVE_LABEL: Partial<Record<ServiceStatus, string>> = {
  preparing: "Start preparing", ready_for_review: "Send for review", reviewed: "Approve review",
  submitted: "Record as submitted", rejected: "Record rejection", exempt: "Mark exempt",
};

export function FundServicesCard({ offeringId, onChanged }: { offeringId: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getFundServicesFn);
  const q = useQuery({ queryKey: ["fund-services", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["fund-services", offeringId] }); onChanged?.(); };
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading operations services…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Operations services couldn't be loaded.</p>;
  const d = q.data;
  return (
    <Card id="setup-services" className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="text-base">Operations services</CardTitle>
        <p className="text-sm text-muted-foreground">
          Harmonious completes formation, the EIN application and the BOI report for this Fund. This is where the team records progress and evidence — nothing is filed from here.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {d.services.map((s) => <ServiceBlock key={s.kind} s={s} d={d} offeringId={offeringId} onChanged={refresh} />)}
      </CardContent>
    </Card>
  );
}

type D = Awaited<ReturnType<typeof getFundServicesFn>>;

function ServiceBlock({ s, d, offeringId, onChanged }: { s: D["services"][number]; d: D; offeringId: string; onChanged: () => void }) {
  const save = useServerFn(saveFundServiceFieldsFn);
  const move = useServerFn(moveFundServiceFn);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, String(v ?? "")])));
  const [busy, setBusy] = useState(false);
  const locked = s.status === "completed";
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); } catch (e: any) { toast.error(e?.message ?? "That didn't work."); } finally { setBusy(false); }
  };
  const statusLabel = s.status === "completed" ? COMPLETED_LABEL[s.kind] : STATUS_LABELS[s.status];
  const selfReview = s.status === "ready_for_review" && s.preparedBy === d.userId;

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{SERVICE_LABELS[s.kind]}</span>
        <Badge variant={isDone(s.status) ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>{statusLabel}</Badge>
      </div>
      {(s.preparedByName || s.reviewedByName) && (
        <p className="text-xs text-muted-foreground">
          {s.preparedByName && <>Prepared by {s.preparedByName}. </>}
          {s.reviewedByName && <>Reviewed by {s.reviewedByName}{s.reviewedAt ? ` on ${new Date(s.reviewedAt).toLocaleDateString()}` : ""}.</>}
        </p>
      )}
      {!d.canEdit ? (
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          {Object.entries(s.fields).map(([k, v]) => (
            <div key={k}><span className="text-muted-foreground">{FIELDS[s.kind].find((f) => f.key === k)?.label ?? k}: </span>{String(v)}</div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS[s.kind].map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input type={f.type ?? "text"} disabled={locked} value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
          {s.kind === "formation" && <p className="text-xs text-muted-foreground">Certificate of Formation: {d.evidence.certificate ? "uploaded" : "upload it in the formation documents above before marking approved"}.</p>}
          {s.kind === "ein" && <p className="text-xs text-muted-foreground">Use the SS-4 generator above to prepare the form. IRS EIN letter: {d.evidence.einLetter ? "uploaded" : "upload it above before marking the EIN received"}. The EIN itself is kept only with the letter.</p>}
          {s.kind === "boi" && <BoiParties d={d} offeringId={offeringId} onChanged={onChanged} locked={locked} />}
          {!locked && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => save({ data: { offeringId, kind: s.kind, fields: vals } }), "Saved")}>Save details</Button>
              {s.next.map((to) => (
                <Button key={to} size="sm" variant={to === "rejected" ? "destructive" : "default"} disabled={busy || (to === "reviewed" && selfReview)}
                  onClick={() => run(async () => { await save({ data: { offeringId, kind: s.kind, fields: vals } }); await move({ data: { offeringId, kind: s.kind, to } }); }, "Updated")}>
                  {to === "completed" ? `Mark ${COMPLETED_LABEL[s.kind].toLowerCase()}` : to === "preparing" && s.status !== "not_started" ? "Send back to preparing" : MOVE_LABEL[to] ?? STATUS_LABELS[to]}
                </Button>
              ))}
            </div>
          )}
          {selfReview && <p className="text-xs text-muted-foreground">You prepared this, so a different Harmonious team member needs to approve the review.</p>}
        </>
      )}
    </div>
  );
}

function BoiParties({ d, offeringId, onChanged, locked }: { d: D; offeringId: string; onChanged: () => void; locked: boolean }) {
  const add = useServerFn(addBoiPartyFn);
  const upd = useServerFn(updateBoiPartyFn);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<"beneficial_owner" | "company_applicant">("beneficial_owner");
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); onChanged(); } catch (e: any) { toast.error(e?.message ?? "That didn't work."); } };
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <p className="text-sm font-medium">Beneficial owners and company applicants</p>
      {d.parties.length === 0 && <p className="text-xs text-muted-foreground">No one listed yet.</p>}
      {d.parties.map((p: any) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{p.name} · {p.role === "beneficial_owner" ? "Beneficial owner" : "Company applicant"}</span>
          <span className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" disabled={locked} checked={p.idProvided} onChange={(e) => act(() => upd({ data: { offeringId, id: p.id, idProvided: e.target.checked } }))} />
              ID document provided
            </label>
            {!locked && <Button size="sm" variant="ghost" onClick={() => act(() => upd({ data: { offeringId, id: p.id, remove: true } }))}>Remove</Button>}
          </span>
        </div>
      ))}
      {!locked && (
        <div className="flex flex-wrap items-end gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Choose a person on this Fund or Client…</option>
            {d.candidates.map((c) => <option key={c.personId} value={c.personId}>{c.name}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="beneficial_owner">Beneficial owner</option>
            <option value="company_applicant">Company applicant</option>
          </select>
          <Button size="sm" variant="outline" disabled={!personId} onClick={() => act(async () => { await add({ data: { offeringId, personId, role } }); setPersonId(""); })}>Add</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">People come from the Fund signatories and Client contacts; add someone new there first. ID numbers are never stored here.</p>
    </div>
  );
}
