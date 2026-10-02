import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fileToBase64 } from "@/components/fund-tabs/shared";
import { addProfileRelationship } from "@/lib/identity.functions";
import {
  getProfileDetailFn, removeProfileDocFn, saveProfileBasicsFn, saveProfileFormationFn,
  submitProfileAccreditationFn, uploadProfileDocFn,
} from "@/lib/investment-profile-detail.functions";
import { INVESTMENT_PROFILE_LABELS, type InvestmentProfileType } from "@/lib/identity-model";

export const Route = createFileRoute("/_authenticated/profile_/$profileId")({
  head: () => ({
    meta: [
      { title: "Investment profile | Harmonious" },
      { name: "description", content: "Tax number, address, owners, formation and accreditation for one investment profile." },
      { property: "og:title", content: "Investment profile | Harmonious" },
      { property: "og:description", content: "Details and accreditation for one investment profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfileDetailPage,
});

const STATUS: Record<string, string> = {
  not_started: "Not started", pending: "In progress", review: "Harmonious reviewing", approved: "Verified", declined: "Needs attention",
};
const BASES = [
  "Income over $200k ($300k joint) for 2 years", "Net worth over $1M excluding home", "Series 7, 65 or 82 license",
  "Entity with assets over $5M", "Entity owned entirely by accredited investors", "Trust with assets over $5M",
  "Bank, broker-dealer, RIA or insurance company", "Family office over $5M",
];
const METHODS = ["Letter from CPA, attorney or adviser", "Tax returns or W-2s", "Brokerage or bank statements", "Professional license lookup"];
const ROLES = [
  ["beneficial_owner", "Beneficial owner (25%+)"], ["control_person", "Control person"], ["manager", "Manager"],
  ["member", "Member"], ["trustee", "Trustee"], ["authorized_signer", "Authorized signer"],
] as const;

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg">{title}</h2>
      {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}
function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ProfileDetailPage() {
  const { profileId } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getProfileDetailFn);
  const key = ["profile-detail", profileId];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => load({ data: { profileId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (isPending) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{(error as any)?.message ?? "Not found."}</div>;
  const p = data.profile;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <Link to="/profile" className="text-sm text-muted-foreground hover:underline">← Back to profile</Link>
      <div>
        <h1 className="text-2xl">{p.display_label}</h1>
        <p className="text-sm text-muted-foreground">{INVESTMENT_PROFILE_LABELS[p.profile_type as InvestmentProfileType] ?? p.profile_type}</p>
      </div>
      <BasicsCard data={data} onSaved={refresh} />
      {data.isEntity ? <OwnersCard data={data} onSaved={refresh} /> : null}
      {data.isEntity ? <FormationCard data={data} onSaved={refresh} /> : null}
      <AccreditationCard data={data} onSaved={refresh} />
    </div>
  );
}

function BasicsCard({ data, onSaved }: { data: any; onSaved: () => void }) {
  const p = data.profile;
  const save = useServerFn(saveProfileBasicsFn);
  const [f, setF] = useState<any>({});
  useEffect(() => {
    setF({
      legal_name: p.legal_name ?? "", phone: p.phone ?? "", address_line1: p.address_line1 ?? "", address_line2: p.address_line2 ?? "",
      city: p.city ?? "", region: p.region ?? "", postal_code: p.postal_code ?? "", country: p.country ?? "United States", tax_id: "",
    });
  }, [p.id]);
  const set = (k: string) => (v: string) => setF((x: any) => ({ ...x, [k]: v }));
  const m = useMutation({
    mutationFn: () => save({ data: { profileId: p.id, ...f, tax_id_type: data.isEntity ? "ein" : undefined } }),
    onSuccess: () => { toast.success("Saved."); setF((x: any) => ({ ...x, tax_id: "" })); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save."),
  });
  const taxLabel = data.isEntity ? "EIN" : "SSN or ITIN";
  return (
    <Card title="Profile details" desc="Used on subscription documents and tax forms for this profile only.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Legal name" value={f.legal_name ?? ""} onChange={set("legal_name")} />
        <Field label="Phone number" type="tel" value={f.phone ?? ""} onChange={set("phone")} />
        <div className="sm:col-span-2">
          <Field label={`${taxLabel}${p.tax_id_last4 ? ` (on file, ending ${p.tax_id_last4})` : ""}`} value={f.tax_id ?? ""} onChange={set("tax_id")}
            placeholder={p.tax_id_last4 ? "Leave blank to keep the one on file" : "9 digits"} />
          <p className="mt-1 text-xs text-muted-foreground">Stored encrypted. Only the last four digits are ever shown.</p>
        </div>
        <div className="sm:col-span-2"><Field label="Address" value={f.address_line1 ?? ""} onChange={set("address_line1")} /></div>
        <div className="sm:col-span-2"><Field label="Address line 2" value={f.address_line2 ?? ""} onChange={set("address_line2")} /></div>
        <Field label="City" value={f.city ?? ""} onChange={set("city")} />
        <Field label="State / region" value={f.region ?? ""} onChange={set("region")} />
        <Field label="ZIP / postal code" value={f.postal_code ?? ""} onChange={set("postal_code")} />
        <Field label="Country" value={f.country ?? ""} onChange={set("country")} />
      </div>
      <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : "Save details"}</Button>
    </Card>
  );
}

function OwnersCard({ data, onSaved }: { data: any; onSaved: () => void }) {
  const add = useServerFn(addProfileRelationship);
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [pct, setPct] = useState(""); const [role, setRole] = useState<string>("beneficial_owner");
  const m = useMutation({
    mutationFn: () => add({ data: { profile_id: data.profile.id, full_name: name, person_email: email, role: role as any, ...(pct ? { ownership_percent: Number(pct) } : {}) } }),
    onSuccess: () => { toast.success("Added. They'll verify their own identity."); setName(""); setEmail(""); setPct(""); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't add."),
  });
  return (
    <Card title="Beneficial owners" desc="Everyone owning 25% or more, plus one person who controls the entity.">
      <ul className="space-y-2">
        {data.owners.map((o: any) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
            <span><span className="font-medium">{o.name}</span> <span className="text-muted-foreground">· {ROLES.find((r) => r[0] === o.role)?.[1] ?? o.role}{o.ownership_percent != null ? ` · ${Number(o.ownership_percent)}%` : ""}</span></span>
            <span className="text-xs text-muted-foreground">Identity: {STATUS[o.verification_status] ?? o.verification_status}</span>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" value={name} onChange={setName} />
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <div>
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Field label="Ownership %" type="number" value={pct} onChange={setPct} />
      </div>
      <Button variant="outline" onClick={() => m.mutate()} disabled={m.isPending || name.length < 2 || !email}>Add person</Button>
    </Card>
  );
}

function DocList({ profileId, kind, docs, locked, onSaved }: { profileId: string; kind: "formation" | "accreditation"; docs: any[]; locked: boolean; onSaved: () => void }) {
  const up = useServerFn(uploadProfileDocFn); const rm = useServerFn(removeProfileDocFn);
  const [busy, setBusy] = useState(false);
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      await up({ data: { profileId, kind, fileName: file.name, contentType: file.type, base64: await fileToBase64(file) } });
      toast.success("Uploaded."); onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Upload failed."); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      {docs.length ? docs.map((d) => (
        <div key={d.path} className="flex items-center justify-between gap-2 text-sm">
          {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="underline">{d.name}</a> : <span>{d.name}</span>}
          {!locked ? <Button size="sm" variant="ghost" onClick={async () => { await rm({ data: { profileId, kind, path: d.path } }); onSaved(); }}>Remove</Button> : null}
        </div>
      )) : <p className="text-sm text-muted-foreground">No documents yet.</p>}
      <Input type="file" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
    </div>
  );
}

function FormationCard({ data, onSaved }: { data: any; onSaved: () => void }) {
  const fm = data.formation ?? {};
  const save = useServerFn(saveProfileFormationFn);
  const isTrust = data.profile.profile_type === "trust";
  const [f, setF] = useState<any>({});
  useEffect(() => {
    setF({ legal_name: fm.legal_name ?? data.profile.legal_name ?? "", entity_type: fm.entity_type ?? "", formation_jurisdiction: fm.formation_jurisdiction ?? "",
      formation_date: fm.formation_date ?? "", trust_type: fm.trust_type ?? "", trust_date: fm.trust_date ?? "" });
  }, [data.profile.id]);
  const set = (k: string) => (v: string) => setF((x: any) => ({ ...x, [k]: v }));
  const locked = fm.kyb_status === "approved";
  const m = useMutation({
    mutationFn: () => save({ data: { profileId: data.profile.id, legal_name: f.legal_name ?? "", ...f } }),
    onSuccess: () => { toast.success("Sent to Harmonious for review."); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save."),
  });
  return (
    <Card title="Formation" desc={`Status: ${STATUS[fm.kyb_status ?? "not_started"]}`}>
      {fm.review_notes ? <p className="text-sm text-destructive">{fm.review_notes}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Legal entity name" value={f.legal_name ?? ""} onChange={set("legal_name")} />
        {isTrust ? <>
          <Field label="Trust type" value={f.trust_type ?? ""} onChange={set("trust_type")} placeholder="Revocable, irrevocable…" />
          <Field label="Trust date" type="date" value={f.trust_date ?? ""} onChange={set("trust_date")} />
        </> : <>
          <Field label="Entity type" value={f.entity_type ?? ""} onChange={set("entity_type")} placeholder="LLC, LP, corporation…" />
          <Field label="State / country of formation" value={f.formation_jurisdiction ?? ""} onChange={set("formation_jurisdiction")} />
          <Field label="Formation date" type="date" value={f.formation_date ?? ""} onChange={set("formation_date")} />
        </>}
      </div>
      {!locked ? <Button onClick={() => m.mutate()} disabled={m.isPending || (f.legal_name ?? "").length < 2}>Submit formation details</Button> : null}
      <div className="pt-2">
        <h3 className="mb-2 text-sm font-medium">Formation documents</h3>
        <p className="mb-2 text-xs text-muted-foreground">Certificate of formation, operating or partnership agreement, trust agreement or certificate of trust.</p>
        <DocList profileId={data.profile.id} kind="formation" docs={fm.documents ?? []} locked={locked || fm.kyb_status === "review"} onSaved={onSaved} />
      </div>
    </Card>
  );
}

function AccreditationCard({ data, onSaved }: { data: any; onSaved: () => void }) {
  const a = data.accreditation ?? {};
  const submit = useServerFn(submitProfileAccreditationFn);
  const [basis, setBasis] = useState(a.basis ?? ""); const [method, setMethod] = useState(a.verification_method ?? "");
  const locked = a.status === "approved";
  const m = useMutation({
    mutationFn: () => submit({ data: { profileId: data.profile.id, basis, verification_method: method } }),
    onSuccess: () => { toast.success("Sent to Harmonious for review."); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't submit."),
  });
  return (
    <Card title="Accreditation" desc={`This profile's own accreditation. Status: ${STATUS[a.status ?? "not_started"]}${a.expires_at ? ` · expires ${new Date(a.expires_at).toLocaleDateString()}` : ""}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>How this profile qualifies</Label>
          <Select value={basis} onValueChange={setBasis} disabled={locked}>
            <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{BASES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Proof</Label>
          <Select value={method} onValueChange={setMethod} disabled={locked}>
            <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{METHODS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DocList profileId={data.profile.id} kind="accreditation" docs={a.documents ?? []} locked={locked || a.status === "review"} onSaved={onSaved} />
      {!locked ? <Button onClick={() => m.mutate()} disabled={m.isPending || !basis || !method}>Submit accreditation</Button> : null}
    </Card>
  );
}
