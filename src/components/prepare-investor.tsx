import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getPrepContext, saveInvestorDraft, sendPreparedInvestor } from "@/lib/investor-prep.functions";
import {
  RELATED_ROLES_BY_PROFILE, type SelectedDoc, preparedLabel, sendBlockers, signingModeOf,
} from "@/lib/investor-prep-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PROFILES = [
  ["unknown", "Not sure yet"], ["individual", "Individual"], ["joint", "Joint"], ["llc", "LLC"],
  ["corporation", "Corporation"], ["partnership", "Partnership"], ["trust", "Trust"],
  ["ira", "IRA / SDIRA"], ["retirement_plan", "Retirement plan"],
] as const;
const SIGN_LABEL = {
  investor_only: "Investor signs", investor_then_manager: "Investor, then Fund Manager countersigns",
  acknowledgement: "Acknowledgement only", none: "No signature",
} as const;
const cents = (s: string) => (s ? Math.round(Number(s.replace(/[,$]/g, "")) * 100) || null : null);

/** Fund → Investors → Prepare Investor. Prepared facts stay "Prepared" until the investor confirms them. */
export function PrepareInvestor({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getPrepContext);
  const save = useServerFn(saveInvestorDraft);
  const send = useServerFn(sendPreparedInvestor);
  const { data, error } = useQuery({ queryKey: ["prep-context", fundId], queryFn: () => load({ data: { offeringId: fundId } }) });

  const [draftId, setDraftId] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ email: "", display_name: "", legal_name: "", entity_name: "", phone: "", address: "", ownership_title: "", authorized_signer_name: "", commitment: "", expected_funding: "", external_reference: "" });
  const [profile, setProfile] = useState("unknown");
  const [sideLetter, setSideLetter] = useState(false);
  const [people, setPeople] = useState<{ role: string; name: string; email: string }[]>([]);
  const [extra, setExtra] = useState<Record<string, "optional" | "investor_specific" | undefined>>({});
  const [review, setReview] = useState(false);

  const docs = data?.documents ?? [];
  const selected: SelectedDoc[] = useMemo(() => [
    ...docs.filter((d) => d.investor_required).map((d) => ({ documentId: d.id, requirement: "required" as const })),
    ...Object.entries(extra).filter(([, v]) => v).map(([id, v]) => ({ documentId: id, requirement: v! })),
  ], [docs, extra]);
  const blockers = sendBlockers({ email: f["email"] ?? "", docs, selected });

  const payload = () => {
    const fields: Record<string, unknown> = {};
    for (const k of ["legal_name", "entity_name", "phone", "address", "ownership_title", "authorized_signer_name", "external_reference"]) if (f[k]) fields[k] = f[k];
    const c = cents(f["commitment"] ?? ""); if (c) fields["commitment_cents"] = c;
    const e = cents(f["expected_funding"] ?? ""); if (e) fields["expected_funding_cents"] = e;
    if (sideLetter) fields["side_letter"] = true;
    return { offeringId: fundId, draftId, email: f["email"]!.trim(), displayName: f["display_name"] || null, profileType: profile, commitmentCents: c, fields, relatedPeople: people.filter((p) => p.name), documents: selected };
  };
  const saveM = useMutation({
    mutationFn: () => save({ data: payload() }),
    onSuccess: (r: any) => { setDraftId(r.id); toast.success("Draft saved. Nothing has been sent."); void qc.invalidateQueries({ queryKey: ["prep-context", fundId] }); },
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });
  const sendM = useMutation({
    mutationFn: async () => { const r: any = await save({ data: payload() }); setDraftId(r.id); return send({ data: { offeringId: fundId, draftId: r.id } }); },
    onSuccess: (r: any) => { toast.success(r.emailSent ? "Onboarding sent." : "Onboarding created — the email could not be sent, use Resend."); setReview(false); setDraftId(null); void qc.invalidateQueries(); },
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });

  if (error) return <p className="text-sm text-destructive">{String((error as any).message).replace(/^Forbidden:\s*/, "")}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const roles = RELATED_ROLES_BY_PROFILE[profile] ?? [];
  const input = (k: string, label: string, type = "text") => (
    <div><Label htmlFor={`prep-${k}`}>{label}</Label><Input id={`prep-${k}`} type={type} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">Prepare Investor <Badge variant="secondary">{preparedLabel(data.capacity)}</Badge></CardTitle>
        <CardDescription>Fill in what you already know. The investor confirms or corrects it; identity, accreditation, tax and funding stay with the investor, providers and Harmonious review.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2">
          {input("email", "Email", "email")}{input("display_name", "Display name")}{input("legal_name", "Legal name")}
          <div><Label>Investing as</Label><Select value={profile} onValueChange={setProfile}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROFILES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
          {!["unknown", "individual", "joint"].includes(profile) && input("entity_name", "Entity / trust / account name")}
          {input("commitment", "Commitment amount (USD)")}{input("expected_funding", "Expected funding (USD)")}
          {input("phone", "Phone")}{input("address", "Address")}{input("ownership_title", "Ownership title")}
          {input("authorized_signer_name", "Authorized signer")}{input("external_reference", "Internal reference")}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={sideLetter} onCheckedChange={(v) => setSideLetter(!!v)} /> Side letter applies</label>
        </section>

        {roles.length ? (
          <section className="space-y-2">
            <h4 className="text-sm font-medium">Related people</h4>
            <p className="text-xs text-muted-foreground">Placeholders only — each person still completes their own verification.</p>
            {people.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-3">
                <Select value={p.role} onValueChange={(v) => setPeople(people.map((x, j) => (j === i ? { ...x, role: v } : x)))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
                <Input placeholder="Name" value={p.name} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input placeholder="Email (optional)" value={p.email} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setPeople([...people, { role: roles[0]!, name: "", email: "" }])}>+ Add person</Button>
          </section>
        ) : null}

        <section className="space-y-2">
          <h4 className="text-sm font-medium">Agreements for this fund</h4>
          {docs.length === 0 ? <p className="text-sm text-muted-foreground">This fund has no approved documents yet.</p> : docs.map((d) => {
            const req = d.investor_required;
            return (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={req || !!extra[d.id]} disabled={req} onCheckedChange={(v) => setExtra({ ...extra, [d.id]: v ? "optional" : undefined })} />
                  {d.title}
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {req ? <Badge>Required</Badge> : extra[d.id] ? (
                    <Select value={extra[d.id]!} onValueChange={(v) => setExtra({ ...extra, [d.id]: v as any })}><SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="optional">Optional</SelectItem><SelectItem value="investor_specific">Investor-specific</SelectItem></SelectContent></Select>
                  ) : <Badge variant="outline">Optional</Badge>}
                  <span className="text-muted-foreground">{SIGN_LABEL[signingModeOf(d)]}</span>
                  {d.requires_signature && !d.template_ready ? <Badge variant="destructive">Template not ready</Badge> : null}
                </div>
              </div>
            );
          })}
        </section>

        {review ? (
          <section className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
            <h4 className="font-medium">Investor onboarding preview</h4>
            <p><span className="text-muted-foreground">Investor:</span> {f["display_name"] || f["legal_name"] || "—"} · {f["email"]} · {PROFILES.find((p) => p[0] === profile)?.[1]} · {f["commitment"] ? `$${f["commitment"]}` : "no amount"}</p>
            <p><span className="text-muted-foreground">Requirements:</span> identity verification, tax form, accreditation and eligibility are set by the fund's configuration and completed by the investor.</p>
            <p><span className="text-muted-foreground">Documents:</span> {selected.map((s) => docs.find((d) => d.id === s.documentId)?.title).join(", ") || "none"}</p>
            <p><span className="text-muted-foreground">Signing:</span> {selected.some((s) => { const d = docs.find((x) => x.id === s.documentId); return d && signingModeOf(d) === "investor_then_manager"; }) ? "Fund Manager countersignature required" : "Investor only"}</p>
            <p><span className="text-muted-foreground">Funding:</span> {f["expected_funding"] ? `$${f["expected_funding"]} expected` : "not set"}</p>
            {blockers.map((b) => <p key={b} className="text-destructive">{b}</p>)}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!f["email"] || saveM.isPending} onClick={() => saveM.mutate()}>Save Draft</Button>
          {!review ? <Button disabled={!f["email"]} onClick={() => setReview(true)}>Review before sending</Button>
            : <Button disabled={blockers.length > 0 || sendM.isPending} onClick={() => sendM.mutate()}>Send Onboarding</Button>}
        </div>

        {data.drafts.length ? (
          <section className="space-y-1">
            <h4 className="text-sm font-medium">Prepared investors</h4>
            {data.drafts.map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
                <span>{d.display_name || d.email}</span>
                <span className="flex gap-2"><Badge variant="outline">{preparedLabel(d.preparer_capacity)}</Badge><Badge variant={d.status === "sent" ? "secondary" : "default"}>{d.status === "draft" ? "Draft — not sent" : d.status === "sent" ? "Invitation sent" : "Cancelled"}</Badge></span>
              </div>
            ))}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
