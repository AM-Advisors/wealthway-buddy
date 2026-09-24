import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadContractForm } from "@/components/client-contracts";
import {
  finishIntake,
  getClientDraft,
  getIntakeOptions,
  saveClientContacts,
  saveClientDraft,
  saveExpectedServices,
} from "@/lib/contract-intake.functions";

export const Route = createFileRoute("/_authenticated/ops/clients/new")({
  validateSearch: z.object({ id: z.string().uuid().optional(), step: z.number().int().min(1).max(5).optional() }),
  head: () => ({
    meta: [
      { title: "New client — Harmonious operations" },
      { name: "description", content: "Create a client: details, contacts, expected services and contract." },
      { property: "og:title", content: "New client — Harmonious operations" },
      { property: "og:description", content: "Guided client intake for the Harmonious team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewClient,
});

const STEPS = ["Client", "Contacts", "Services", "Contract", "Review"];
type Contact = { id?: string; full_name: string; email: string; phone: string; title: string; designations: string[] };

function NewClient() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string | undefined>(search.id);
  const [step, setStep] = useState(search.step ?? 1);
  const optionsFn = useServerFn(getIntakeOptions);
  const draftFn = useServerFn(getClientDraft);
  const saveFn = useServerFn(saveClientDraft);
  const contactsFn = useServerFn(saveClientContacts);
  const servicesFn = useServerFn(saveExpectedServices);
  const finishFn = useServerFn(finishIntake);
  const options = useQuery({ queryKey: ["intake-options"], queryFn: () => optionsFn() });
  const draft = useQuery({
    queryKey: ["client-draft", clientId],
    queryFn: () => draftFn({ data: { id: clientId! } }),
    enabled: !!clientId,
  });

  const [f, setF] = useState<any>({ name: "" });
  const v = f as any;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [contractChoice, setContractChoice] = useState<"upload" | "standard" | "later">("later");
  const [dupes, setDupes] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c: any = draft.data?.client;
    if (!c) return;
    setF({
      name: c.name ?? "", legal_name: c.legal_name ?? "", dba_name: c.dba_name ?? "", client_type: c.client_type ?? "",
      primary_contact_name: c.primary_contact_name ?? "", primary_contact_email: c.primary_contact_email ?? "",
      phone: c.phone ?? "", website: c.website ?? "", entity_type: c.entity_type ?? "", jurisdiction: c.jurisdiction ?? "",
      address: c.address?.text ?? "", relationship_owner_id: c.relationship_owner_id ?? "", referral_source: c.referral_source ?? "",
      notes: c.notes ?? "", ein_hint: c.ein_last4 ? `••••${c.ein_last4}` : "",
    });
    setServices(c.expected_services ?? []);
    if (c.contract_choice) setContractChoice(c.contract_choice);
    setContacts(((draft.data?.contacts ?? []) as any[]).map((x) => ({ id: x.id, full_name: x.full_name, email: x.email ?? "", phone: x.phone ?? "", title: x.title ?? "", designations: x.designations ?? [] })));
  }, [draft.data]);

  const set = (k: string) => (e: { target: { value: string } }) => setF((p: any) => ({ ...p, [k]: e.target.value }));
  const go = (n: number) => {
    setStep(n);
    navigate({ to: "/ops/clients/new", search: { id: clientId, step: n }, replace: true });
  };

  const saveClient = async (confirmDuplicate = false) => {
    setBusy(true);
    try {
      const res = await saveFn({
        data: {
          id: clientId, confirmDuplicate, step: 2, name: v.name ?? "", legal_name: v.legal_name, dba_name: v.dba_name,
          client_type: (v.client_type || undefined) as any, primary_contact_name: v.primary_contact_name,
          primary_contact_email: v.primary_contact_email, phone: v.phone, website: v.website, entity_type: v.entity_type,
          jurisdiction: v.jurisdiction, ein: v.ein, address: v.address, relationship_owner_id: v.relationship_owner_id || null,
          referral_source: v.referral_source, notes: v.notes,
        },
      });
      if (res.duplicates.length) return setDupes(res.duplicates);
      setDupes([]);
      setClientId(res.id!);
      if (!contacts.length && v.primary_contact_name)
        setContacts([{ full_name: v.primary_contact_name, email: v.primary_contact_email ?? "", phone: v.phone ?? "", title: "", designations: ["Primary"] }]);
      toast.success("Draft saved");
      setStep(2);
      navigate({ to: "/ops/clients/new", search: { id: res.id!, step: 2 }, replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<unknown>, next: number) => {
    setBusy(true);
    try { await fn(); toast.success("Draft saved"); go(next); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const opts = options.data;
  if (options.error) return <p className="p-6 text-sm text-muted-foreground">{(options.error as Error).message}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div>
        <h1 className="text-2xl">New client</h1>
        <p className="text-sm text-muted-foreground">Saved as a draft at every step. Creating a client never switches on services.</p>
      </div>
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" disabled={!clientId && i > 0} onClick={() => go(i + 1)}
              className={`rounded-full border px-3 py-1 ${step === i + 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {i + 1} — {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card><CardHeader><CardTitle className="text-base">Client</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Legal client name *"><Input value={f.name ?? ""} onChange={set("name")} /></Field>
            <Field label="DBA / display name"><Input value={f.dba_name ?? ""} onChange={set("dba_name")} /></Field>
            <Field label="Client type">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.client_type ?? ""} onChange={set("client_type")}>
                <option value="">Choose…</option>
                {opts?.clientTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Legal entity name"><Input value={f.legal_name ?? ""} onChange={set("legal_name")} /></Field>
            <Field label="Primary contact"><Input value={f.primary_contact_name ?? ""} onChange={set("primary_contact_name")} /></Field>
            <Field label="Primary email"><Input type="email" value={f.primary_contact_email ?? ""} onChange={set("primary_contact_email")} /></Field>
            <Field label="Phone"><Input value={f.phone ?? ""} onChange={set("phone")} /></Field>
            <Field label="Website"><Input value={f.website ?? ""} onChange={set("website")} /></Field>
            <Field label="Entity type"><Input value={f.entity_type ?? ""} onChange={set("entity_type")} placeholder="LLC, LP, Corporation…" /></Field>
            <Field label="State / jurisdiction"><Input value={f.jurisdiction ?? ""} onChange={set("jurisdiction")} /></Field>
            <Field label="EIN (only the last 4 digits are kept)"><Input value={f.ein ?? ""} onChange={set("ein")} placeholder={f.ein_hint || "12-3456789"} autoComplete="off" /></Field>
            <Field label="Relationship owner at Harmonious">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.relationship_owner_id ?? ""} onChange={set("relationship_owner_id")}>
                <option value="">Choose…</option>
                {opts?.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><Field label="Address"><Input value={f.address ?? ""} onChange={set("address")} /></Field></div>
            <Field label="Referral / source"><Input value={f.referral_source ?? ""} onChange={set("referral_source")} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><Textarea value={f.notes ?? ""} onChange={set("notes")} /></Field></div>
            {dupes.length > 0 && (
              <div className="rounded-md border border-destructive p-3 text-sm sm:col-span-2">
                <p className="font-medium">This client may already exist:</p>
                <ul className="my-2 list-disc pl-5">
                  {dupes.map((d) => <li key={d.id}><Link className="underline" to="/ops/clients/$clientId" params={{ clientId: d.id }} search={{} as any}>{d.name}</Link></li>)}
                </ul>
                <Button size="sm" variant="outline" onClick={() => saveClient(true)} disabled={busy}>It's a different client — create anyway</Button>
              </div>
            )}
            <div className="sm:col-span-2"><Button disabled={busy || (f.name ?? "").trim().length < 2} onClick={() => saveClient(false)}>Save & continue</Button></div>
          </CardContent>
        </Card>
      )}

      {step === 2 && clientId && (
        <Card><CardHeader><CardTitle className="text-base">Contacts</CardTitle>
          <CardDescription>Designations are reference only — they don't grant access or signing authority.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {contacts.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                <Input placeholder="Full name" value={c.full_name} onChange={(e) => setContacts((p) => p.map((x, j) => j === i ? { ...x, full_name: e.target.value } : x))} />
                <Input placeholder="Email" value={c.email} onChange={(e) => setContacts((p) => p.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                <Input placeholder="Phone" value={c.phone} onChange={(e) => setContacts((p) => p.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />
                <Input placeholder="Title" value={c.title} onChange={(e) => setContacts((p) => p.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <div className="flex flex-wrap gap-3 text-sm sm:col-span-2">
                  {opts?.designations.map((d) => (
                    <label key={d} className="flex items-center gap-1">
                      <input type="checkbox" checked={c.designations.includes(d)}
                        onChange={(e) => setContacts((p) => p.map((x, j) => j === i ? { ...x, designations: e.target.checked ? [...x.designations, d] : x.designations.filter((y) => y !== d) } : x))} />
                      {d}
                    </label>
                  ))}
                  <button type="button" className="ml-auto text-muted-foreground underline" onClick={() => setContacts((p) => p.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setContacts((p) => [...p, { full_name: "", email: "", phone: "", title: "", designations: [] }])}>+ Add contact</Button>
              <Button disabled={busy} onClick={() => run(() => contactsFn({ data: { clientId, contacts: contacts.filter((c) => c.full_name.trim()) as any } }), 3)}>Save & continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && clientId && (
        <Card><CardHeader><CardTitle className="text-base">Expected services</CardTitle>
          <CardDescription>From the Harmonious service catalog. These are expectations only — the signed contract controls actual scope.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {opts?.services.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={services.includes(s.key)} onChange={(e) => setServices((p) => e.target.checked ? [...p, s.key] : p.filter((x) => x !== s.key))} />
                  {s.name}
                </label>
              ))}
            </div>
            <Button disabled={busy} onClick={() => run(() => servicesFn({ data: { clientId, services } }), 4)}>Save & continue</Button>
          </CardContent>
        </Card>
      )}

      {step === 4 && clientId && (
        <Card><CardHeader><CardTitle className="text-base">Contract</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 text-sm">
              {([["upload", "Upload Existing Executed Contract"], ["standard", "Use Harmonious Standard Agreement"], ["later", "Add Contract Later"]] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2"><input type="radio" checked={contractChoice === v} onChange={() => setContractChoice(v)} />{l}</label>
              ))}
            </div>
            {contractChoice === "upload" && <UploadContractForm clientId={clientId} onDone={() => toast.success("Contract saved — review its terms from the client's Contracts tab.")} />}
            {contractChoice === "standard" && <p className="text-sm text-muted-foreground">The standard master agreement and statements of work are prepared from the existing Client Agreements area after intake.</p>}
            <Button disabled={busy} onClick={() => go(5)}>Continue</Button>
          </CardContent>
        </Card>
      )}

      {step === 5 && clientId && (
        <Card><CardHeader><CardTitle className="text-base">Review</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><b>{f.name}</b>{f.client_type ? ` · ${f.client_type}` : ""}</p>
            <p>{contacts.length} contact(s) · {services.length} expected service(s)</p>
            <p>Contract: {contractChoice === "upload" ? "Uploaded existing contract (terms need approval)" : contractChoice === "standard" ? "Harmonious standard agreement" : "Added later"}</p>
            <Button disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                await finishFn({ data: { clientId, contractChoice } });
                navigate({ to: "/ops/clients/$clientId", params: { clientId }, search: { tab: "contracts" } as any });
              } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
            }}>Create client</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}
