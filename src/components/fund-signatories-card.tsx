import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Star, Trash2, UserPlus } from "lucide-react";

import { listFundSignatoriesFn, addFundSignatoryFn, updateFundSignatoryFn } from "@/lib/fund-setup-canonical.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  const done = () => { q.refetch(); onChanged?.(); };
  const submit = async (confirmSeparate = false) => {
    setBusy(true);
    try {
      await add({ data: {
        offeringId, candidateKey: mode === "pick" ? key || null : null,
        newPerson: mode === "new" ? { fullName: np.fullName, email: np.email || null, title: np.title || null } : null,
        title: title || np.title || null, capacity: capacity || null, confirmSeparate,
      } });
      toast.success("Signatory added");
      setKey(""); setNp({ fullName: "", email: "", title: "" }); setTitle(""); setCapacity(""); setReview(null);
      done();
    } catch (e: any) {
      const msg = String(e.message ?? e);
      if (/Review Required/i.test(msg)) setReview(msg); else toast.error(msg);
    } finally { setBusy(false); }
  };
  const act = async (id: string, patch: { makePrimary?: boolean; remove?: boolean }) => {
    try { await update({ data: { offeringId, id, ...patch } }); done(); } catch (e: any) { toast.error(e.message); }
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
                  </div>
                  <p className="text-xs text-muted-foreground">{[s.title, s.capacity, s.email].filter(Boolean).join(" · ") || "No title yet"}</p>
                </div>
                {d.canEdit && (
                  <div className="flex gap-1">
                    {!s.isPrimary && <Button size="sm" variant="ghost" onClick={() => act(s.id, { makePrimary: true })}><Star className="mr-1 h-3.5 w-3.5" />Make primary</Button>}
                    <Button size="sm" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => act(s.id, { remove: true })}><Trash2 className="h-3.5 w-3.5" /></Button>
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
              <Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")} disabled={!d.hasClient}>
                <UserPlus className="mr-1 h-3.5 w-3.5" />Add new person
              </Button>
            </div>
            {mode === "pick" ? (
              <div className="space-y-1">
                <Label className="text-xs">Person on the Client account or Fund team</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={key} onChange={(e) => setKey(e.target.value)}>
                  <option value="">Choose…</option>
                  {d.candidates.map((c) => <option key={c.key} value={c.key}>{c.name} - {c.source}{c.detail ? ` (${c.detail})` : ""}</option>)}
                </select>
                {d.candidates.length === 0 && <p className="text-xs text-muted-foreground">Everyone listed is already a signatory. Add a new person instead.</p>}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label className="text-xs">Full name</Label><Input value={np.fullName} onChange={(e) => setNp({ ...np, fullName: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Job title</Label><Input value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground sm:col-span-3">They'll also be added to the Client's contacts. No sign-in invitation is sent.</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Signatory title</Label><Input placeholder="e.g. Managing Member" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Capacity</Label><Input placeholder="e.g. Managing Member of the GP" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
            </div>
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
