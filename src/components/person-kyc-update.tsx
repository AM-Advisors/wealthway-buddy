import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getPersonRecordFn, recordPriorKycFn, savePersonRecordFn, sendKycLinkFn } from "@/lib/person-records.functions";

const FIELDS: [string, string, string?][] = [
  ["legal_first_name", "First name"], ["legal_middle_name", "Middle name"], ["legal_last_name", "Last name"],
  ["email", "Email"], ["phone", "Phone"], ["date_of_birth", "Date of birth", "date"],
  ["address_line1", "Address line 1"], ["address_line2", "Address line 2"], ["city", "City"],
  ["region", "State"], ["postal_code", "ZIP code"], ["country", "Country"],
  ["citizenship_country", "Citizenship"], ["residence_country", "Country of residence"],
];
const RESULTS = [["approved", "Approved / clear"], ["review", "Needed review"], ["declined", "Declined"], ["unknown", "Unknown"]] as const;
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

/**
 * Staff enter what they already know (details + a prior KYC result), then request an
 * updated identity check. Prior results are a reference only; the live check decides status.
 */
export function PersonKycUpdate({ personId }: { personId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getPersonRecordFn), save = useServerFn(savePersonRecordFn), prior = useServerFn(recordPriorKycFn), send = useServerFn(sendKycLinkFn);
  const q = useQuery({ queryKey: ["person-record", personId], queryFn: () => load({ data: { personId } }), retry: false });
  const [f, setF] = useState<Record<string, string>>({});
  const [pk, setPk] = useState({ provider: "", checkedOn: "", kycResult: "approved", amlResult: "approved", documentType: "unknown", reference: "", note: "" });
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (q.data) setF(Object.fromEntries(FIELDS.map(([k]) => [k, (q.data as any)[k] ?? ""]))); }, [q.data]);
  if (q.error) return null; // non-staff viewers
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const p: any = q.data;
  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try { await fn(); toast.success(msg); await qc.invalidateQueries(); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(null); }
  };
  const priors = p.checks.filter((c: any) => c.mode === "prior");
  const lastLink = p.checks.find((c: any) => c.mode === "link");

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg">Information & KYC update · {p.name}</h2>
        <Badge variant="outline" className="capitalize">KYC {String(p.kyc_status ?? "not started").replace(/_/g, " ")}</Badge>
        <Badge variant="outline" className="capitalize">AML {String(p.aml_status ?? "not started").replace(/_/g, " ")}</Badge>
      </div>

      <div>
        <h3 className="mb-2 font-medium">1. Information we have</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {FIELDS.map(([k, l, t]) => <label key={k} className="text-xs text-muted-foreground">{l}<Input type={t ?? "text"} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
        </div>
        <Button className="mt-2" size="sm" disabled={busy === "save"} onClick={() => run("save", () => save({ data: { id: personId, fields: f } }), "Details saved.")}>Save details</Button>
      </div>

      <div>
        <h3 className="mb-1 font-medium">2. Previous KYC (optional)</h3>
        <p className="mb-2 text-xs text-muted-foreground">Kept for reference only. It doesn't change their KYC/AML status — the updated check below does.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground">Who ran it<Input placeholder="e.g. prior administrator" value={pk.provider} onChange={(e) => setPk({ ...pk, provider: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">Date checked<Input type="date" value={pk.checkedOn} onChange={(e) => setPk({ ...pk, checkedOn: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">ID used<select className={sel} value={pk.documentType} onChange={(e) => setPk({ ...pk, documentType: e.target.value })}><option value="unknown">Unknown</option><option value="drivers_license">Driver's license</option><option value="passport">Passport</option><option value="other">Other</option></select></label>
          <label className="text-xs text-muted-foreground">KYC result<select className={sel} value={pk.kycResult} onChange={(e) => setPk({ ...pk, kycResult: e.target.value })}>{RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">AML result<select className={sel} value={pk.amlResult} onChange={(e) => setPk({ ...pk, amlResult: e.target.value })}>{RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Reference #<Input value={pk.reference} onChange={(e) => setPk({ ...pk, reference: e.target.value })} /></label>
        </div>
        <Textarea className="mt-2" placeholder="Notes" value={pk.note} onChange={(e) => setPk({ ...pk, note: e.target.value })} />
        <Button className="mt-2" size="sm" variant="outline" disabled={busy === "prior" || !pk.provider || !pk.checkedOn} onClick={() => run("prior", async () => { await prior({ data: { personId, ...pk, kycResult: pk.kycResult as any, amlResult: pk.amlResult as any, documentType: pk.documentType as any, ...(pk.reference ? { reference: pk.reference } : {}), ...(pk.note ? { note: pk.note } : {}) } }); setPk({ ...pk, provider: "", checkedOn: "", reference: "", note: "" }); }, "Previous KYC recorded.")}>Save previous KYC</Button>
        {!!priors.length && <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{priors.map((c: any) => <li key={c.id}>{c.result_summary?.provider} · {c.result_summary?.checkedOn} · KYC {c.id_status} · AML {c.aml_status}{c.result_summary?.reference ? ` · ref ${c.result_summary.reference}` : ""}</li>)}</ul>}
      </div>

      <div>
        <h3 className="mb-1 font-medium">3. Request an updated identity check</h3>
        <p className="mb-2 text-xs text-muted-foreground">Emails {p.email || "them"} a secure link, prefilled with the details above. They add a photo of their ID and a selfie; the result updates their record automatically.</p>
        <Button size="sm" disabled={busy === "send" || !p.email} onClick={() => run("send", () => send({ data: { personId } }), "Identity check link sent.")}>Request updated check</Button>
        {!p.email && <span className="ml-2 text-xs text-destructive">Add an email first.</span>}
        {lastLink && <p className="mt-2 text-xs text-muted-foreground">Last requested {new Date(lastLink.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {lastLink.status}</p>}
      </div>
    </section>
  );
}
