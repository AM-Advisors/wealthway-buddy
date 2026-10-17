import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fileToBase64 } from "@/components/fund-tabs/shared";
import { listPersonRecordsFn, refreshKycLinkFn, runDocumentCheckFn, savePersonRecordFn, sendKycLinkFn } from "@/lib/person-records.functions";

const FIELDS: [string, string][] = [
  ["legal_first_name", "First name"], ["legal_middle_name", "Middle name"], ["legal_last_name", "Last name"], ["preferred_name", "Preferred name"],
  ["email", "Email"], ["secondary_email", "Secondary email (gets copies)"], ["phone", "Phone"], ["secondary_phone", "Secondary phone (contact only)"], ["date_of_birth", "Date of birth (YYYY-MM-DD)"], ["citizenship_country", "Citizenship"],
  ["residence_country", "Country of residence"], ["address_line1", "Address line 1"], ["address_line2", "Address line 2"], ["city", "City"],
  ["region", "State"], ["postal_code", "ZIP"], ["country", "Country"],
];
const STATUS: Record<string, string> = { approved: "Approved", review: "In review", declined: "Declined", pending: "Pending", not_started: "Not started" };
const badge = (label: string, s: string | null | undefined) => <Badge variant={s === "approved" ? "default" : s === "declined" ? "destructive" : "outline"}>{label}: {STATUS[s ?? "not_started"] ?? s}</Badge>;

/** Staff list of people records: edit details, send an identity-check link, or check an uploaded ID. */
export function PersonRecords() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const list = useServerFn(listPersonRecordsFn);
  const q = useQuery({ queryKey: ["person-records", search], queryFn: () => list({ data: { search } }) });
  const [edit, setEdit] = useState<any | null>(null);
  const [check, setCheck] = useState<any | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["person-records"] });
  const sendLink = useServerFn(sendKycLinkFn);
  const refreshFn = useServerFn(refreshKycLinkFn);
  const link = useMutation({ mutationFn: (id: string) => sendLink({ data: { personId: id } }), onSuccess: (r) => { toast.success(r.emailed ? "Identity-check link emailed." : "Check started, but the email didn't send. Copy the link from the person's checks."); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const pull = useMutation({ mutationFn: (id: string) => refreshFn({ data: { requestId: id } }), onSuccess: (r) => { toast.success(`KYC: ${STATUS[r.status] ?? r.status}`); refresh(); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input className="max-w-sm" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={() => setEdit({})}>Add person</Button>
      </div>
      {q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : q.isPending ? <div className="h-24 animate-pulse rounded-xl bg-muted" /> : (
        <div className="divide-y rounded-xl border">
          {q.data.map((p: any) => (
            <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.email ?? "No email"}{p.secondary_email ? ` · copies to ${p.secondary_email}` : ""}{p.user_id ? " · has login" : ""}</p>
                {p.secondary_phone && <p className="text-xs text-muted-foreground">Secondary phone: {p.secondary_phone}</p>}
                <div className="flex flex-wrap gap-1">{badge("KYC", p.kyc_status)}{badge("AML", p.aml_status)}</div>
                {p.checks.map((c: any) => (
                  <p key={c.id} className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()} · {c.mode === "link" ? "Identity-check link" : "Document only"} · {c.mode === "document" ? `ID ${c.id_status ?? "?"}, AML ${STATUS[c.aml_status] ?? c.aml_status ?? "not run"}` : STATUS[c.status] ?? c.status}
                    {c.mode === "link" && c.session_url && <> · <button type="button" className="underline" onClick={() => { void navigator.clipboard.writeText(c.session_url); toast.success("Link copied."); }}>Copy link</button></>}
                    {c.mode === "link" && <> · <button type="button" className="underline" disabled={pull.isPending} onClick={() => pull.mutate(c.id)}>Check result</button></>}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEdit(p)}>Edit details</Button>
                <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => link.mutate(p.id)}>Send KYC link</Button>
                <Button size="sm" variant="outline" onClick={() => setCheck(p)}>Check ID document</Button>
              </div>
            </div>
          ))}
          {!q.data.length && <p className="p-6 text-center text-sm text-muted-foreground">No one found.</p>}
        </div>
      )}
      {edit && <EditDialog person={edit} onClose={() => setEdit(null)} onSaved={refresh} />}
      {check && <DocDialog person={check} onClose={() => setCheck(null)} onDone={refresh} />}
    </div>
  );
}

function EditDialog({ person, onClose, onSaved }: { person: any; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(savePersonRecordFn);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, person[k] ?? ""])));
  const m = useMutation({ mutationFn: () => save({ data: { id: person.id, fields: v } }), onSuccess: () => { toast.success("Saved."); onSaved(); onClose(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{person.id ? `Edit ${person.name}` : "Add person"}</DialogTitle><DialogDescription>KYC and AML results come only from the identity check and can't be typed in here.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([k, label]) => <div key={k} className="space-y-1"><Label>{label}</Label><Input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>)}
        </div>
        <DialogFooter><Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocDialog({ person, onClose, onDone }: { person: any; onClose: () => void; onDone: () => void }) {
  const run = useServerFn(runDocumentCheckFn);
  const [type, setType] = useState<"drivers_license" | "passport">("drivers_license");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const f = async (x: File) => ({ base64: await fileToBase64(x), contentType: x.type || "image/jpeg", fileName: x.name });
      return run({ data: { personId: person.id, documentType: type, front: await f(front!), ...(back && type === "drivers_license" ? { back: await f(back) } : {}) } });
    },
    onSuccess: (r) => { setResult(r); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const tooBig = [front, back].some((x) => x && x.size > 10 * 1024 * 1024);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Check ID document for {person.name}</DialogTitle><DialogDescription>The identity check reviews the document and runs AML screening. Without a selfie this is document-only, not full KYC. The images aren't stored in Harmonious.</DialogDescription></DialogHeader>
        {result ? (
          <div className="space-y-1 text-sm">
            <p>Document: <b>{result.idStatus}</b></p>
            <p>AML: <b>{STATUS[result.amlStatus] ?? result.amlStatus ?? "Not run"}</b>{result.summary.amlHits ? ` (${result.summary.amlHits} possible matches)` : ""}</p>
            <p>Name on document: {result.summary.nameOnDocument}</p>
            {result.summary.dateOfBirth && <p>Date of birth: {result.summary.dateOfBirth}</p>}
            {result.summary.expiry && <p>Expires: {result.summary.expiry}</p>}
            <p className="text-xs text-muted-foreground">{result.summary.note}</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              {(["drivers_license", "passport"] as const).map((t) => <Button key={t} size="sm" variant={type === t ? "default" : "outline"} onClick={() => setType(t)}>{t === "passport" ? "Passport" : "Driver's license"}</Button>)}
            </div>
            <div className="space-y-1"><Label>{type === "passport" ? "Photo page" : "Front"}</Label><Input type="file" accept="image/*" onChange={(e) => setFront(e.target.files?.[0] ?? null)} /></div>
            {type === "drivers_license" && <div className="space-y-1"><Label>Back (optional)</Label><Input type="file" accept="image/*" onChange={(e) => setBack(e.target.files?.[0] ?? null)} /></div>}
            {tooBig && <p className="text-xs text-destructive">Images must be 10 MB or smaller.</p>}
          </div>
        )}
        <DialogFooter>{result ? <Button onClick={onClose}>Done</Button> : <Button disabled={!front || tooBig || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Checking…" : "Run check"}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
