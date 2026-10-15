import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, MinusCircle, ShieldCheck, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { decideAccountCheckFn } from "@/lib/account-kyc.functions";
import { KycReviewPanel } from "@/components/kyc-review-panel";

type Tone = "pass" | "fail" | "pending" | "none";
const toneOf = (v: unknown): Tone => {
  if (v === true) return "pass";
  if (v === false) return "fail";
  const s = String(v ?? "").toLowerCase();
  if (!s || s === "not_started" || s === "null") return "none";
  if (/approv|pass|clear|verified|match(ed)?$|completed|yes/.test(s) && !/potential|no_match|not/.test(s)) return "pass";
  if (/declin|fail|reject|expired|hit/.test(s)) return "fail";
  return "pending";
};
const words = (v: unknown) => (v == null || v === "" ? "Not done" : v === true ? "Yes" : v === false ? "No" : String(v).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()));
const ICON = { pass: CheckCircle2, fail: XCircle, pending: Clock, none: MinusCircle };
const COLOR = { pass: "text-primary", fail: "text-destructive", pending: "text-accent-foreground", none: "text-muted-foreground" };
const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");

function Check({ label, value }: { label: string; value: unknown }) {
  const t = toneOf(value); const I = ICON[t];
  return <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"><span>{label}</span><span className={`flex items-center gap-1 ${COLOR[t]}`}><I className="h-4 w-4" />{words(value)}</span></div>;
}
function Field({ label, value }: { label: string; value: unknown }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm">{value == null || value === "" ? "—" : String(value)}</dd></div>;
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border p-4"><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>{children}</div>;
}

/** Customer identification report: identity, ID document, liveness/face, AML, investor types. Display only, except the existing review decision. */
export function KycReport({ d, userId }: { d: any; userId: string }) {
  const r = d.kycReport ?? {};
  const p = r.person ?? d.people?.find((x: any) => x.linked) ?? null;
  const ac = (r.accountChecks ?? [])[0] ?? null;
  const kv = (r.verifications ?? [])[0] ?? null;
  const s = ac?.decision_summary ?? {};
  const doc = { type: kv?.document_type ?? s.document?.type, country: kv?.document_issuing_country ?? s.document?.country, region: kv?.document_issuing_region, last4: kv?.document_number_last4 ?? s.document?.last4, issued: kv?.document_issue_date, expires: kv?.document_expiration_date ?? s.document?.expires, expired: kv?.document_expired };
  const overall = p?.kyc_status ?? d.people?.[0]?.kyc;
  const amlStatus = p?.aml_status ?? s.aml?.status;
  const linked = d.people?.find((x: any) => x.linked);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 print:border-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-4 w-4" />Customer identification report</p>
          <h2 className="font-heading text-2xl">{linked?.name || d.name || d.email}</h2>
          <p className="text-xs text-muted-foreground">Generated {date(new Date().toISOString())}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={toneOf(overall) === "pass" ? "default" : toneOf(overall) === "fail" ? "destructive" : "secondary"}>KYC: {words(overall)}</Badge>
          <Badge variant={toneOf(amlStatus) === "pass" ? "default" : toneOf(amlStatus) === "fail" ? "destructive" : "secondary"}>AML: {words(amlStatus)}</Badge>
          <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button>
        </div>
      </header>

      {ac?.status === "review" && <ReviewBar check={ac} userId={userId} />}

      {(ac?.review_details ?? kv?.review_details) && <KycReviewPanel rd={ac?.review_details ?? kv?.review_details} checkId={ac?.review_details ? ac.id : null} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Applicant identity">
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Full name" value={linked?.name} />
            <Field label="Name on ID" value={kv?.verified_full_name} />
            <Field label="Date of birth" value={p?.date_of_birth ?? kv?.verified_date_of_birth} />
            <Field label="Citizenship" value={p?.citizenship_country} />
            <Field label="Email" value={linked?.email ?? d.email} />
            <Field label="Phone" value={linked?.phone} />
            <div className="col-span-2"><Field label="Address" value={linked?.address} /></div>
            <Field label="Tax ID" value={p?.tax_id_last4 ? `••••${p.tax_id_last4}` : null} />
            <Field label="Re-verification due" value={p?.reverification_due_at ? date(p.reverification_due_at) : null} />
          </dl>
        </Block>
        <Block title="ID document (driver's license / passport)">
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Type" value={doc.type ? words(doc.type) : null} />
            <Field label="Number" value={doc.last4 ? `••••${doc.last4}` : null} />
            <Field label="Issuing country" value={doc.country} />
            <Field label="Issuing state" value={doc.region} />
            <Field label="Issued" value={doc.issued} />
            <Field label="Expires" value={doc.expires} />
          </dl>
          <div className="mt-3"><Check label="Document valid (not expired)" value={doc.expired == null ? (doc.type ? "pending" : null) : !doc.expired} /></div>
          <p className="mt-2 text-xs text-muted-foreground">ID images stay with the verification service and aren't stored here.</p>
        </Block>
        <Block title="Identity checks">
          <div className="grid gap-2">
            <Check label="ID document" value={kv?.provider_decision ?? (doc.type ? "completed" : null)} />
            <Check label="Liveness (live selfie)" value={kv?.liveness_status ?? s.liveness} />
            <Check label={`Face match${kv?.face_match_score != null ? ` · ${Math.round(Number(kv.face_match_score))}%` : ""}`} value={kv?.face_match_status ?? s.faceMatch} />
            <Check label="Address" value={kv?.address_check_status ?? s.address} />
            <Check label="Proof of address" value={kv?.proof_of_address_status} />
          </div>
        </Block>
        <Block title="Watchlist / AML">
          <div className="grid gap-2">
            <Check label="Sanctions, PEP & adverse media" value={amlStatus} />
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Possible matches</span><span>{s.aml?.hits ?? 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Screened</span><span>{date(p?.aml_screened_at)}</span></div>
          </div>
          {!!(ac?.warnings ?? kv?.provider_warnings ?? []).length && <ul className="mt-3 list-disc pl-5 text-xs text-destructive">{(ac?.warnings ?? kv?.provider_warnings).slice(0, 8).map((w: any) => <li key={String(w)}>{typeof w === "string" ? w : JSON.stringify(w)}</li>)}</ul>}
        </Block>
        <Block title="Investor types">
          {!(r.profiles ?? []).length ? <p className="text-sm text-muted-foreground">No investing profiles yet.</p> : (
            <ul className="space-y-2">{r.profiles.map((ip: any) => (
              <li key={ip.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>{ip.display_label || ip.legal_name || "Profile"}<span className="ml-2 text-xs text-muted-foreground">{[ip.tax_id_type, ip.tax_id_last4 ? `••••${ip.tax_id_last4}` : null, ip.region].filter(Boolean).join(" · ")}</span></span>
                <span className="flex gap-1"><Badge variant="outline" className="capitalize">{words(ip.profile_type)}</Badge><Badge variant="secondary" className="capitalize">{words(ip.status)}</Badge></span>
              </li>))}</ul>
          )}
        </Block>
        <Block title="Session & audit">
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Check status" value={ac ? words(ac.status) : kv ? words(kv.status) : null} />
            <Field label="Session" value={ac?.session_id ?? kv?.session_id} />
            <Field label="Started" value={date(ac?.created_at ?? kv?.created_at)} />
            <Field label="Last update" value={date(ac?.updated_at ?? kv?.updated_at)} />
            <Field label="Decided" value={ac?.decided_at ? date(ac.decided_at) : null} />
            <Field label="Decision note" value={ac?.decision_note ?? kv?.harmonious_decision_reason} />
          </dl>
        </Block>
      </div>
    </section>
  );
}

function ReviewBar({ check, userId }: { check: any; userId: string }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideAccountCheckFn);
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: (action: "approve" | "decline" | "send_back") => decide({ data: { checkId: check.id, action, note: note.trim() || null } }),
    onSuccess: () => { toast.success("Decision saved."); qc.invalidateQueries({ queryKey: ["person-activity", userId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2 rounded-lg border border-accent bg-accent/10 p-3 print:hidden">
      <p className="text-sm font-medium">This check needs a review decision.</p>
      {(check.review_details?.aml?.totalHits ?? 0) > 0 && <p className="text-xs text-destructive">{check.review_details.aml.totalHits} possible watchlist matches. Review them below and note why they don't apply before approving.</p>}
      <p className="text-xs text-muted-foreground">Your decision is saved here and sent to the verification service.</p>
      <Textarea rows={2} placeholder="Reason (required to decline, ask again, or approve with watchlist matches; recorded with your name)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate("approve")}>Approve</Button>
        <Button size="sm" variant="destructive" disabled={m.isPending} onClick={() => m.mutate("decline")}>Decline</Button>
        <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate("send_back")}>Ask to verify again</Button>
      </div>
    </div>
  );
}
