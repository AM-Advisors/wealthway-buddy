import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { investorMissingInfoFn, loadPriorVerificationFn } from "@/lib/prior-verification.functions";

const PERSON: [string, string][] = [
  ["legal_first_name", "Legal first name"], ["legal_middle_name", "Middle name"], ["legal_last_name", "Last name"],
  ["email", "Email"], ["phone", "Phone"], ["date_of_birth", "Date of birth (YYYY-MM-DD)"], ["citizenship_country", "Citizenship (e.g. US)"],
  ["address_line1", "Street address"], ["address_line2", "Apt / suite"], ["city", "City"], ["region", "State / region"],
  ["postal_code", "Postal code"], ["country", "Country"],
];
const ENTITY: [string, string][] = [
  ["legal_name", "Entity legal name"], ["entity_type", "Entity type (LLC, LP, trust…)"], ["formation_jurisdiction", "Formation jurisdiction"],
  ["formation_date", "Formation date (YYYY-MM-DD)"], ["address_line1", "Entity street address"], ["address_line2", "Entity suite"],
  ["city", "Entity city"], ["region", "Entity state / region"], ["postal_code", "Entity postal code"], ["country", "Entity country"],
];
const label = (s: string | null) => (s ?? "not_started").replace(/_/g, " ");

/** Harmonious or the fund's managers fill in missing details, load an earlier verification, and rerun checks. */
export function InvestorPriorVerification({ onboardingId, onSaved }: { onboardingId: string; onSaved?: () => void }) {
  const qc = useQueryClient();
  const key = ["investor-missing-info", onboardingId];
  const missingFn = useServerFn(investorMissingInfoFn);
  const loadFn = useServerFn(loadPriorVerificationFn);
  const q = useQuery({ queryKey: key, queryFn: () => missingFn({ data: { onboardingId } }) });
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState({ provider: "", checkedOn: "", reference: "" });
  const [p, setP] = useState<Record<string, string>>({});
  const [e, setE] = useState<Record<string, string>>({});
  const [rerun, setRerun] = useState({ aml: true, kycLink: false, kyb: true });
  const m = useMutation({
    mutationFn: () => loadFn({ data: { onboardingId, provider: meta.provider, checkedOn: meta.checkedOn, reference: meta.reference || undefined, person: p, entity: e, rerun: { ...rerun, kyb: rerun.kyb && !!q.data?.entity } } }),
    onSuccess: (r) => {
      const bits = [`Saved ${r.saved} detail(s)`];
      if (r.suggested) bits.push(`${r.suggested} sent to Harmonious to review`);
      if (r.aml) bits.push(`screening: ${label(r.aml)}`);
      if (r.kycLink) bits.push(r.kycLink === "emailed" ? "identity check link emailed" : "identity check link created");
      if (r.kyb) bits.push(`business check: ${label(r.kyb)} (screening ${label(r.entityAml ?? null)})`);
      toast.success(bits.join(" · "));
      r.warnings.forEach((w) => toast.warning(w));
      setOpen(false); setP({}); setE({});
      qc.invalidateQueries({ queryKey: key }); onSaved?.();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const d = q.data;
  const missing = [...(d?.person ?? []), ...(d?.entity ?? [])];

  return (
    <section className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">Missing information & earlier verification</h4>
        {!open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Add missing info / load earlier check</Button>}
      </div>
      {q.isLoading ? <p className="text-xs text-muted-foreground">Checking…</p> : q.isError ? <p className="text-xs text-destructive">{(q.error as Error).message}</p> : d && (
        <>
          <div className="flex flex-wrap gap-1 text-xs">
            <Badge variant="outline">Identity: {label(d.kyc)}</Badge><Badge variant="outline">Screening: {label(d.aml)}</Badge>
            {d.kyb !== null && <><Badge variant="outline">Business: {label(d.kyb)}</Badge><Badge variant="outline">Business screening: {label(d.entityAml)}</Badge></>}
          </div>
          <p className="text-xs text-muted-foreground">{missing.length ? `Still missing: ${missing.join(", ")}.` : "Nothing missing."}</p>
        </>
      )}
      {open && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Fill in only what you have; blank boxes stay as they are. If this person or business was verified before on another platform, enter where and when and copy the details here. Loaded details never approve anything on their own: screening is rerun, identity needs the person's own ID and selfie through a new link, and business details go to Harmonious review.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor="pv-provider">Earlier check done by</Label><Input id="pv-provider" placeholder="e.g. prior administrator" value={meta.provider} onChange={(x) => setMeta({ ...meta, provider: x.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="pv-date">Check date</Label><Input id="pv-date" type="date" value={meta.checkedOn} onChange={(x) => setMeta({ ...meta, checkedOn: x.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="pv-ref">Reference (optional)</Label><Input id="pv-ref" value={meta.reference} onChange={(x) => setMeta({ ...meta, reference: x.target.value })} /></div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Person</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PERSON.map(([k, l]) => <div key={k} className="space-y-1"><Label htmlFor={`pv-p-${k}`}>{l}</Label><Input id={`pv-p-${k}`} value={p[k] ?? ""} onChange={(x) => setP({ ...p, [k]: x.target.value })} /></div>)}
            </div>
          </div>
          {d?.entity && (
            <div>
              <p className="mb-1 text-sm font-medium">Business / trust</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ENTITY.map(([k, l]) => <div key={k} className="space-y-1"><Label htmlFor={`pv-e-${k}`}>{l}</Label><Input id={`pv-e-${k}`} value={e[k] ?? ""} onChange={(x) => setE({ ...e, [k]: x.target.value })} /></div>)}
              </div>
            </div>
          )}
          <div className="space-y-1 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={rerun.aml} onCheckedChange={(v) => setRerun({ ...rerun, aml: !!v })} />Rerun screening (AML) with these details</label>
            <label className="flex items-center gap-2"><Checkbox checked={rerun.kycLink} onCheckedChange={(v) => setRerun({ ...rerun, kycLink: !!v })} />Email a new identity check link (ID + selfie)</label>
            {d?.entity && <label className="flex items-center gap-2"><Checkbox checked={rerun.kyb} onCheckedChange={(v) => setRerun({ ...rerun, kyb: !!v })} />Rerun the business check (KYB) and business screening</label>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={m.isPending || !meta.provider.trim() || !meta.checkedOn} onClick={() => m.mutate()}>{m.isPending ? "Saving…" : "Save and rerun"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}
