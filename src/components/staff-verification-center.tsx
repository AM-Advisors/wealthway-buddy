import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { BulkVerificationDialog } from "@/components/staff-verification-bulk-dialog";
import { EnterVerificationDialog, STATUS } from "@/components/staff-verification-entry-dialog";
import { decideVerificationFn, verificationEntriesFn, verificationEvidenceLinkFn } from "@/lib/staff-verification.functions";
import { AML_RESULTS, ID_TYPES, KYB_METHODS, KYC_METHODS, SCREENING_STATUS, SELFIE_RESULTS } from "@/lib/staff-verification-model";

const label = (list: readonly (readonly [string, string])[], v: string | undefined | null) => list.find(([k]) => k === v)?.[1] ?? v ?? "";
const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : "");
const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Operations enter KYC/KYB/AML details for people and companies; a second reviewer decides. */
export function StaffVerificationCenter({ initialPersonId, initialAccountUserId }: { initialPersonId?: string | undefined; initialAccountUserId?: string | undefined }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"review" | "all">("review");
  const [open, setOpen] = useState(Boolean(initialPersonId || initialAccountUserId));
  const [bulkOpen, setBulkOpen] = useState(false);
  const listFn = useServerFn(verificationEntriesFn);
  const q = useQuery({ queryKey: ["staff-verification", filter], queryFn: () => listFn({ data: { filter } }) });
  const decide = useServerFn(decideVerificationFn);
  const linkFn = useServerFn(verificationEvidenceLinkFn);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refresh = () => {
    for (const key of ["staff-verification", "staff-verification-people", "staff-verification-companies", "account-identity-queue", "investor-record", "investment-readiness", "person-record"]) qc.invalidateQueries({ queryKey: [key] });
  };
  const m = useMutation({
    mutationFn: (v: { entryId: string; action: "approve" | "decline" | "withdraw" }) => decide({ data: { ...v, note: notes[v.entryId]?.trim() || null } }),
    onSuccess: (_r, v) => { toast.success(v.action === "approve" ? "Approved. The verification is updated." : v.action === "decline" ? "Declined. Nothing changed on the record." : "Withdrawn."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const openEvidence = async (entryId: string) => {
    const w = window.open("", "_blank");
    try { const { url } = await linkFn({ data: { entryId } }); if (w) w.location.href = url; else window.location.href = url; }
    catch (e) { w?.close(); toast.error((e as Error).message); }
  };
  const rows = q.data ?? [];
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="max-w-2xl">
          <CardTitle className="text-lg">Verification details entered by Operations</CardTitle>
          <CardDescription className="text-sm">Enter past identity (KYC), business (KYB) and watchlist screening (AML) results for people and companies, or run a fresh screening from their details. A different team member reviews and approves before anything changes on the record.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={filter === "review" ? "default" : "outline"} onClick={() => setFilter("review")}>Waiting for review</Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>Upload a spreadsheet</Button>
          <Button onClick={() => setOpen(true)}>Enter verification details</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          : !rows.length ? <p className="py-6 text-center text-sm text-muted-foreground">{filter === "review" ? "Nothing waiting for review." : "No details entered yet."}</p>
          : rows.map((r: any) => {
            const isCompany = r.subject === "company";
            const title = isCompany ? r.company?.name ?? "Company" : r.person.name;
            const s = r.sensitive ?? {};
            const d = r.details ?? {};
            const address = [d.addressLine1, d.addressLine2, d.city, d.region, d.postalCode, d.country].filter(Boolean).join(", ");
            return (
            <div key={r.id} className="space-y-2 rounded-md border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-base font-medium">{title}{isCompany ? <span className="ml-2 text-xs font-normal text-muted-foreground">Company · {String(r.company?.type ?? "").replace(/_/g, " ")} · owner {r.person.name}</span> : null}</p>
                  {!isCompany && r.person.email ? <p className="break-all text-xs text-muted-foreground">{r.person.email}</p> : null}
                </div>
                <div className="flex gap-2">{r.fromSpreadsheet ? <Badge variant="outline">From spreadsheet</Badge> : null}<Badge variant={r.status === "review" ? "destructive" : "outline"}>{STATUS[r.status] ?? r.status}</Badge></div>
              </div>
              <p className="text-xs text-muted-foreground">Entered by {r.enteredBy} on {fmt(r.enteredAt)}{r.decidedBy ? ` · ${STATUS[r.status]} by ${r.decidedBy} on ${fmt(r.decidedAt)}` : ""}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {isCompany ? (
                  <div className="rounded-md bg-muted p-3">
                    <p className="font-medium">Business check (KYB)</p>
                    {r.kyb ? (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        <li>Legal name: <strong>{r.kyb.legalName}</strong>{r.company?.name && squash(r.kyb.legalName) !== squash(r.company.name) ? <span className="text-destructive"> · Record says {r.company.name}</span> : null}</li>
                        {r.kyb.entityType || r.kyb.formationJurisdiction || r.kyb.formationDate ? <li>{[r.kyb.entityType, r.kyb.formationJurisdiction, r.kyb.formationDate ? `formed ${r.kyb.formationDate}` : null].filter(Boolean).join(" · ")}</li> : null}
                        {s.einLast4 ? <li>EIN ending {s.einLast4} (stored encrypted)</li> : null}
                        <li>{label(KYB_METHODS, r.kyb.method)} on {r.kyb.verifiedOn}</li>
                        <li className="break-words">Owners checked: {r.kyb.ownersChecked}</li>
                      </ul>
                    ) : <p className="mt-1 text-xs text-muted-foreground">Not included</p>}
                  </div>
                ) : (
                  <div className="rounded-md bg-muted p-3">
                    <p className="font-medium">Identity (KYC)</p>
                    {r.kyc ? (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        <li>Name on ID: <strong>{r.kyc.legalName}</strong>{r.person.name && squash(r.kyc.legalName) !== squash(r.person.name) ? <span className="text-destructive"> · Record says {r.person.name}</span> : null}</li>
                        <li>Date of birth: {r.kyc.dateOfBirth}{r.person.dateOfBirth && r.person.dateOfBirth !== r.kyc.dateOfBirth ? <span className="text-destructive"> · Record says {r.person.dateOfBirth}</span> : null}</li>
                        <li>{label(ID_TYPES, r.kyc.idType)} · {r.kyc.issuingCountry}{r.kyc.issuingRegion ? `, ${r.kyc.issuingRegion}` : ""} · ending {r.kyc.idLast4} · expires {r.kyc.idExpires}{s.idNumberLast4 ? " · full number stored encrypted" : ""}</li>
                        <li>{label(KYC_METHODS, r.kyc.method)} on {r.kyc.verifiedOn}</li>
                        <li className={r.kyc.selfie === "passed" ? "" : "text-destructive"}>{label(SELFIE_RESULTS, r.kyc.selfie)}</li>
                      </ul>
                    ) : <p className="mt-1 text-xs text-muted-foreground">Not included</p>}
                  </div>
                )}
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">Watchlist screening (AML)</p>
                  {r.screening ? (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      <li className={r.screening.status === "approved" ? "" : "font-medium text-destructive"}>Fresh screening: {SCREENING_STATUS[r.screening.status as keyof typeof SCREENING_STATUS] ?? r.screening.status} · {r.screening.totalHits} hit{r.screening.totalHits === 1 ? "" : "s"}</li>
                      <li>Screened {r.screening.screenedName} on {r.screening.screenedOn}</li>
                      {(r.screening.hits ?? []).map((h: any, i: number) => <li key={i} className="break-words">· {h.caption}{h.datasets?.length ? ` (${h.datasets.join(", ")})` : ""}{h.matchScore != null ? ` · match ${h.matchScore}` : ""}{h.riskScore != null ? ` · risk ${h.riskScore}` : ""}{h.reviewStatus ? ` · ${h.reviewStatus}` : ""}</li>)}
                    </ul>
                  ) : r.aml ? (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      <li className={r.aml.result === "confirmed_match" ? "font-medium text-destructive" : ""}>{label(AML_RESULTS, r.aml.result)}</li>
                      <li>Screened on {r.aml.screenedOn}</li>
                      <li className="break-words">Lists: {r.aml.listsChecked}</li>
                      {r.aml.explanation ? <li className="break-words">Why ruled out: {r.aml.explanation}</li> : null}
                    </ul>
                  ) : <p className="mt-1 text-xs text-muted-foreground">Not included</p>}
                </div>
              </div>
              {address || d.citizenship || d.phone || d.occupation || s.ssnLast4 ? (
                <p className="break-words text-xs">Details: {[address ? `Address ${address}` : null, d.citizenship ? `Citizenship ${d.citizenship}` : null, d.phone ? `Phone ${d.phone}` : null, d.occupation ? `Occupation ${d.occupation}` : null, s.ssnLast4 ? `SSN ending ${s.ssnLast4} (stored encrypted)` : null].filter(Boolean).join(" · ")}</p>
              ) : null}
              <p className="break-words text-xs">Original evidence: {r.sourceReference}</p>
              {r.note ? <p className="break-words text-xs">Note: {r.note}</p> : null}
              {r.decisionNote ? <p className="break-words text-xs">Decision note: {r.decisionNote}</p> : null}
              {r.hasEvidence ? <Button size="sm" variant="outline" onClick={() => void openEvidence(r.id)}>Open evidence ({r.evidenceName})</Button> : null}
              {r.status === "review" ? (
                <div className="space-y-2 border-t pt-3">
                  <Textarea rows={2} aria-label={`Review note for ${title}`} placeholder={r.enteredByMe ? "Someone else must approve details you entered. Super Admins may approve with a reason." : "Note (required to decline, when names differ, when no selfie was done, or when the fresh screening found possible matches)"} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={m.isPending} onClick={() => m.mutate({ entryId: r.id, action: "approve" })}>Approve</Button>
                    <Button variant="destructive" disabled={m.isPending} onClick={() => m.mutate({ entryId: r.id, action: "decline" })}>Decline</Button>
                    {r.enteredByMe ? <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate({ entryId: r.id, action: "withdraw" })}>Withdraw</Button> : null}
                  </div>
                </div>
              ) : null}
            </div>
            );
          })}
      </CardContent>
      <EnterVerificationDialog open={open} onOpenChange={setOpen} initialPersonId={initialPersonId} initialAccountUserId={initialAccountUserId} onSaved={refresh} />
      <BulkVerificationDialog open={bulkOpen} onOpenChange={setBulkOpen} onSaved={refresh} />
    </Card>
  );
}
