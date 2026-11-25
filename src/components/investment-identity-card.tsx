import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff, FileImage, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { maskDigits } from "@/lib/person-id-cards";
import {
  confirmPersonIdUploadFn, investmentIdentityFn, personIdCardUrlFn, revealFullTaxNumberFn, startPersonIdUploadFn,
} from "@/lib/person-id-cards.functions";

export function Reveal({ onboardingId, personId, entity, last4, label }: { onboardingId: string; personId?: string; entity?: boolean; last4: string | null; label: string }) {
  const reveal = useServerFn(revealFullTaxNumberFn);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setShown(null), 60_000); return () => clearTimeout(t); }, [shown]);
  if (!last4) return <span className="text-sm text-muted-foreground">{label}: not on file</span>;
  return (
    <span className="flex items-center gap-2 text-sm" data-private>
      <span>{label}: <span className="font-mono">{shown ? maskDigits(shown) : `•••-••-${last4}`}</span></span>
      <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
        if (shown) { setShown(null); return; }
        setBusy(true);
        try { const r = await reveal({ data: { onboardingId, personId: personId ?? null, entity: Boolean(entity) } }); setShown(r.number); }
        catch (e: any) { toast.error(e?.message ?? "Couldn't show the number."); }
        finally { setBusy(false); }
      }}>
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{shown ? "Hide" : "Show full number"}
      </Button>
    </span>
  );
}

export function UploadId({ onboardingId, personId, onDone }: { onboardingId: string; personId: string; onDone: () => void }) {
  const start = useServerFn(startPersonIdUploadFn);
  const confirm = useServerFn(confirmPersonIdUploadFn);
  const [type, setType] = useState<"drivers_license" | "state_id" | "passport">("drivers_license");
  const [side, setSide] = useState<"front" | "back" | "passport_page">("front");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sides = type === "passport" ? (["passport_page"] as const) : (["front", "back"] as const);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="ID type" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={type}
        onChange={(e) => { const t = e.target.value as typeof type; setType(t); setSide(t === "passport" ? "passport_page" : "front"); }}>
        <option value="drivers_license">Driver's license</option><option value="state_id">State ID</option><option value="passport">Passport</option>
      </select>
      <select aria-label="Side" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={side} onChange={(e) => setSide(e.target.value as typeof side)}>
        {sides.map((s) => <option key={s} value={s}>{s === "front" ? "Front" : s === "back" ? "Back" : "Photo page"}</option>)}
      </select>
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (!file) return;
        setBusy(true);
        try {
          const t = await start({ data: { onboardingId, personId, side, documentType: type, fileName: file.name, mimeType: file.type, size: file.size } });
          const up = await supabase.storage.from("government-ids").uploadToSignedUrl(t.path, t.token, file, { contentType: file.type });
          if (up.error) throw new Error("The upload didn't finish. Please try again.");
          const r = await confirm({ data: { onboardingId, id: t.id } });
          toast.success(`Done and saved: ${r.kind} added to this person.`);
          onDone();
        } catch (err: any) { toast.error(err?.message ?? "Upload failed."); }
        finally { setBusy(false); }
      }} />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />{busy ? "Uploading…" : "Upload ID"}</Button>
    </div>
  );
}

/** ID cards and full SSN/EIN for Harmonious and this fund's managers; hidden for everyone else. */
export function InvestmentIdentityCard({ onboardingId }: { onboardingId: string }) {
  const list = useServerFn(investmentIdentityFn);
  const openUrl = useServerFn(personIdCardUrlFn);
  const qc = useQueryClient();
  const key = ["investment-identity", onboardingId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { onboardingId } }), retry: false });
  if (q.isError || !q.data) return null;
  const d = q.data;
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">ID cards and tax numbers</CardTitle>
        <p className="text-sm text-muted-foreground">Each view of a full number or ID card is recorded. Uploading an ID doesn't complete the identity check by itself.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {d.entity && (
          <div className="rounded-md border p-3">
            <div className="font-medium">{d.entity.name}</div>
            <Reveal onboardingId={onboardingId} entity last4={d.entity.einLast4} label="EIN" />
          </div>
        )}
        {d.people.map((p) => (
          <div key={p.personId} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.name}</span><Badge variant="secondary" className="capitalize">{p.role}</Badge></div>
            <Reveal onboardingId={onboardingId} personId={p.personId} last4={p.ssnLast4} label="SSN" />
            {p.cards.length ? (
              <ul className="space-y-1">
                {p.cards.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    <span>{c.label} · {c.side === "back" ? "back" : c.side === "front" ? "front" : "photo page"}</span>
                    {c.idLast4 && <span className="text-muted-foreground">ending {c.idLast4}</span>}
                    {c.expiresOn && <span className="text-muted-foreground">expires {c.expiresOn}</span>}
                    <Button size="sm" variant="link" onClick={async () => {
                      try { const r = await openUrl({ data: { onboardingId, id: c.id } }); window.open(r.url, "_blank", "noopener"); }
                      catch (e: any) { toast.error(e?.message ?? "Couldn't open the ID."); }
                    }}>Open</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No ID card on file yet.</p>}
            <UploadId onboardingId={onboardingId} personId={p.personId} onDone={() => qc.invalidateQueries({ queryKey: key })} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
