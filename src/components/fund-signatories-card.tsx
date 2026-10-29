import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Star, Trash2, UserPlus } from "lucide-react";

import { listFundSignatoriesFn, addFundSignatoryFn, updateFundSignatoryFn, inviteFundPersonFn } from "@/lib/fund-setup-canonical.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApprovalButton } from "@/components/approval-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FundPersonPicker, KycBadge } from "@/components/fund-person-picker";

export function FundSignatoriesCard({ offeringId, onChanged }: { offeringId: string; onChanged?: () => void }) {
  const list = useServerFn(listFundSignatoriesFn);
  const add = useServerFn(addFundSignatoryFn);
  const update = useServerFn(updateFundSignatoryFn);
  const q = useQuery({ queryKey: ["fund-signatories", offeringId], queryFn: () => list({ data: { offeringId } }) });
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [key, setKey] = useState("");
  const [np, setNp] = useState({ fullName: "", email: "", title: "" });
  const [title, setTitle] = useState("");
  const [capacity, setCapacity] = useState("");
  const [review, setReview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendInvite, setSendInvite] = useState(false);
  const invite = useServerFn(inviteFundPersonFn);

  const done = () => { q.refetch(); onChanged?.(); };
  const submit = async (confirmSeparate = false) => {
    setBusy(true);
    try {
      await add({ data: {
        offeringId, candidateKey: mode === "pick" ? key || null : null,
        newPerson: mode === "new" ? { fullName: np.fullName, email: np.email || null, title: np.title || null } : null,
        title: title || np.title || null, capacity: capacity || null, confirmSeparate, sendInvite,
      } });
      toast.success(sendInvite ? "Signatory added and invitation sent" : "Signatory added");
      setSendInvite(false);
      setKey(""); setNp({ fullName: "", email: "", title: "" }); setTitle(""); setCapacity(""); setReview(null);
      done();
    } catch (e: any) {
      const msg = String(e.message ?? e);
      if (/Review Required/i.test(msg)) setReview(msg); else toast.error(msg);
    } finally { setBusy(false); }
  };
  const [edit, setEdit] = useState<{ id: string; preferredName: string; title: string; email: string } | null>(null);
  const act = async (id: string, patch: { makePrimary?: boolean; remove?: boolean; preferredName?: string | null; title?: string | null; email?: string | null }) => {
    try { await update({ data: { offeringId, id, ...patch } }); setEdit(null); done(); } catch (e: any) { toast.error(e.message); }
  };

  const d = q.data;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Fund Signatories</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">People authorized to sign for this Fund. The primary signatory is used on Fund countersignatures.</p>
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {d && d.signatories.length === 0 && <p className="text-sm text-muted-foreground">No signatory chosen yet.</p>}
        {d && d.signatories.length > 0 && (
          <ul className="divide-y rounded-md border">
            {d.signatories.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    {s.isPrimary && <Badge>Primary</Badge>}
                    <KycBadge kyc={s.kyc} />
                  </div>
                  {s.preferredName && s.legalName ? <p className="text-xs text-muted-foreground">Legal name: {s.legalName}</p> : null}
                  <p className="text-xs text-muted-foreground">{[s.title, s.capacity, s.email].filter(Boolean).join(" · ") || "No title yet"}</p>
                  {edit?.id === s.id && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {d.canEditPerson && <div className="space-y-1"><Label className="text-xs">Goes by</Label><Input placeholder="e.g. middle name" value={edit.preferredName} onChange={(e) => setEdit({ ...edit, preferredName: e.target.value })} /></div>}
                      <div className="space-y-1"><Label className="text-xs">Signatory title</Label><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
                      {d.canEditPerson && <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>}
                      <div className="flex gap-2 sm:col-span-3">
                        <Button size="sm" onClick={() => act(s.id, { title: edit.title || null, ...(d.canEditPerson ? { preferredName: edit.preferredName || null, email: edit.email || null } : {}) })}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
                {d.canEdit && (
                  <div className="flex gap-1">
                    {s.kyc !== "verified" && s.contactId && <Button size="sm" variant="ghost" onClick={async () => { try { await invite({ data: { offeringId, contactKey: `contact:${s.contactId}` } }); toast.success("Identity check and onboarding invitation sent"); } catch (e: any) { toast.error(e.message); } }}>Send ID check</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ id: s.id, preferredName: s.preferredName ?? "", title: s.title ?? "", email: s.email ?? "" })}>Edit</Button>
                    {!s.isPrimary && <ApprovalButton size="sm" variant="ghost" title={`Make ${s.name} the main signer?`} description="New fund documents will name this person as the main signer. Documents already signed do not change." confirmLabel="Make main signer" undoLabel="Undo" waitingTitle="Change waiting to save" waitingNote="You have 5 seconds to undo. Nothing has changed yet." historyNote="The change is recorded in the fund history." onApprove={() => act(s.id, { makePrimary: true })}><Star className="mr-1 h-3.5 w-3.5" />Make primary</ApprovalButton>}
                    <ApprovalButton size="sm" variant="ghost" aria-label={`Remove ${s.name}`} title={`Remove ${s.name} as a signer?`} description="They will no longer sign new fund documents. Documents they already signed stay valid." confirmLabel="Remove signer" undoLabel="Undo" waitingTitle="Removal waiting to save" waitingNote="You have 5 seconds to undo. Nothing has changed yet." historyNote="The removal is recorded in the fund history." onApprove={() => act(s.id, { remove: true })}><Trash2 className="h-3.5 w-3.5" /></ApprovalButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {d?.canEdit && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "pick" ? "default" : "outline"} onClick={() => setMode("pick")}>Choose listed person</Button>
              {d.canEditPerson && <Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")} disabled={!d.hasClient}>
                <UserPlus className="mr-1 h-3.5 w-3.5" />Add new person
              </Button>}
            </div>
            {mode === "pick" ? (
              <div className="space-y-1">
                <Label className="text-xs">Tap a person on the Client account or Fund team</Label>
                <FundPersonPicker people={d.candidates} value={key} onChange={setKey} empty="Everyone listed is already a signatory. Add a new person instead." />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label className="text-xs">Full name</Label><Input value={np.fullName} onChange={(e) => setNp({ ...np, fullName: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Job title</Label><Input value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground sm:col-span-3">They'll also be added to the Client's contacts.</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Signatory title</Label><Input placeholder="e.g. Managing Member" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Capacity</Label><Input placeholder="e.g. Managing Member of the GP" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
            </div>
            {(mode === "new" ? np.email.trim() : d.candidates.find((c) => c.key === key && c.kyc !== "verified" && c.key.startsWith("contact:"))) ? (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={sendInvite} onCheckedChange={(v) => setSendInvite(v === true)} />
                <span>Send identity check and onboarding invitation<span className="block text-xs text-muted-foreground">Emails them a sign-in link. They complete their own ID check when they sign in.</span></span>
              </label>
            ) : null}
            {review && (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
                <p>{review}</p>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => submit(true)}>This is a separate person - add anyway</Button>
              </div>
            )}
            <Button size="sm" disabled={busy || (mode === "pick" ? !key : np.fullName.trim().length < 2)} onClick={() => submit(false)}>Add signatory</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
