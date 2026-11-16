import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  approveTexasCapitalPacket, getTexasCapitalPacket, markTexasCapitalReady, saveTexasCapitalPacket,
  sendTexasCapitalPacket, startTexasCapitalPacket, updateTexasCapitalLink, uploadTexasCapitalDocUrl,
} from "@/lib/texas-capital-packet.functions";
import { STATUS_LABEL, requiredDocuments, type EntityKind, type PacketAnswers, type PacketPerson } from "@/lib/texas-capital-packet-model";

type Docs = Record<string, { path?: string; onFile?: boolean }>;
const ROLE_LABEL = { signer: "Signer", controlling_party: "Controlling party", beneficial_owner: "Owner 25%+" } as const;

const TEXT_FIELDS: [keyof PacketAnswers, string, boolean?][] = [
  ["legalName", "Legal name"], ["entityType", "Entity type"], ["ein", "Tax ID (EIN)"], ["dba", "DBA (if any)"],
  ["stateOfIncorporation", "State of formation"], ["dateEstablished", "Date established"],
  ["physicalAddress", "Physical address (no PO Box)"], ["mailingAddress", "Mailing address"],
  ["businessPhone", "Business phone"], ["website", "Website"], ["naics", "NAICS code"],
  ["primaryContactEmail", "Primary contact email"], ["narrative", "What the business does", true],
];

export function TexasCapitalPacketCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const key = ["texas-capital-packet", fundId];
  const get = useServerFn(getTexasCapitalPacket);
  const q = useQuery({ queryKey: key, queryFn: () => get({ data: { offeringId: fundId } }) });
  const start = useServerFn(startTexasCapitalPacket), save = useServerFn(saveTexasCapitalPacket), ready = useServerFn(markTexasCapitalReady);
  const approve = useServerFn(approveTexasCapitalPacket), send = useServerFn(sendTexasCapitalPacket), link = useServerFn(updateTexasCapitalLink);
  const uploadUrl = useServerFn(uploadTexasCapitalDocUrl);

  const pk = q.data?.packet ?? null;
  const [kind, setKind] = useState<EntityKind>("llc");
  const [a, setA] = useState<PacketAnswers | null>(null);
  const [docs, setDocs] = useState<Docs>({});
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setKind(q.data.suggestedKind);
    if (pk) { setA(pk.answers); setDocs(pk.documents as Docs); }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const run = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { toast.success(ok); refresh(); }).catch((e) => toast.error((e as Error).message));
  const m = useMutation({ mutationFn: (f: () => Promise<unknown>) => f() });

  if (q.isLoading) return null;
  if (q.error) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Texas Capital package isn't available for you on this fund.</CardContent></Card>;

  if (!pk) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Open a Texas Capital account</CardTitle>
          <CardDescription className="text-base">We fill in Texas Capital's forms from what's already saved for this fund. You only add what's missing.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-sm">The entity is:</span>
          {(["llc", "corporation"] as const).map((k) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k === "llc" ? "LLC" : "Corporation"}</Button>)}
          <Button size="lg" disabled={m.isPending} onClick={() => run(() => start({ data: { offeringId: fundId, entityKind: kind } }), "Package started")}>Start package</Button>
        </CardContent>
      </Card>
    );
  }

  const editable = pk.status === "draft" || pk.status === "ready";
  const reqDocs = requiredDocuments(kind, !!a?.dba?.trim());
  const setPerson = (i: number, patch: Partial<PacketPerson>) => setA((p) => p && ({ ...p, people: p.people.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const doSave = () => a ? save({ data: { id: pk.id, entityKind: kind, answers: a, documents: docs } }) : Promise.resolve();

  async function upload(k: string, file: File) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) { toast.error("Upload a PDF, JPG or PNG."); return; }
    try {
      const { path, token } = await uploadUrl({ data: { id: pk!.id, key: k, ext: ext as "pdf" } });
      const { error } = await supabase.storage.from("bank-packets").uploadToSignedUrl(path, token, file);
      if (error) throw error;
      setDocs((d) => ({ ...d, [k]: { path } }));
      toast.success("Uploaded. Remember to save.");
    } catch (e) { toast.error((e as Error).message); }
  }

  const next = (() => {
    switch (pk.status) {
      case "draft": return { label: "Save and send for review", go: () => run(async () => { await doSave(); await ready({ data: { id: pk.id } }); }, "Sent for review") };
      case "ready": return pk.youPrepared ? null : { label: "Approve package", go: () => run(() => approve({ data: { id: pk.id, undo: false } }), "Approved") };
      case "approved": return { label: "Send to Texas Capital", go: () => { if (confirm("Send the secure link to the four Texas Capital contacts now?")) run(() => send({ data: { id: pk.id, resend: false } }), "Sent to Texas Capital"); } };
      case "sent": case "opened": return { label: "Mark account opened", go: () => run(() => link({ data: { id: pk.id, action: "account_opened" } }), "Marked opened") };
      default: return null;
    }
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Texas Capital account package</CardTitle>
          <CardDescription className="text-base">
            {pk.status === "ready" && pk.youPrepared ? "Waiting for someone else to approve it." : pk.missing.length && pk.status === "draft" ? `Still needed: ${pk.missing.length}` : "Everything needed is filled in."}
          </CardDescription>
        </div>
        <Badge variant="secondary" className="text-sm">{STATUS_LABEL[pk.status]}</Badge>
      </CardHeader>
      <CardContent className="space-y-5 text-base">
        {next && <Button size="lg" disabled={m.isPending} onClick={next.go}>{next.label}</Button>}
        {pk.status === "approved" && <Button variant="ghost" onClick={() => run(() => approve({ data: { id: pk.id, undo: true } }), "Approval undone")}>Undo approval</Button>}

        {pk.status === "draft" && pk.missing.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-muted-foreground">{pk.missing.map((x) => <li key={x}>{x}</li>)}</ul>
        )}

        {(pk.status === "sent" || pk.status === "opened") && (
          <div className="space-y-2 text-sm">
            <p>Sent to {q.data!.recipients.join(", ")} (copy to {q.data!.cc}).</p>
            <p>{pk.linkRevokedAt ? "The link is turned off." : `Link works until ${new Date(pk.linkExpiresAt!).toLocaleDateString()}.`} {pk.firstOpenedAt ? `First opened ${new Date(pk.firstOpenedAt).toLocaleString()}.` : "Not opened yet."}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => run(() => send({ data: { id: pk.id, resend: true } }), "New link sent")}>Send a new link</Button>
              {!pk.linkRevokedAt && <Button size="sm" variant="outline" onClick={() => { if (confirm("Turn off the download link?")) run(() => link({ data: { id: pk.id, action: "revoke" } }), "Link turned off"); }}>Turn off link</Button>}
            </div>
          </div>
        )}

        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Hide details" : editable ? "Review and edit details" : "View details"}</Button>

        {open && a && (
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="font-semibold">Entity</h3>
              <div className="flex gap-2">{(["llc", "corporation"] as const).map((k) => <Button key={k} size="sm" disabled={!editable} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k === "llc" ? "LLC" : "Corporation"}</Button>)}</div>
              <div className="grid gap-3 md:grid-cols-2">
                {TEXT_FIELDS.map(([k, label, long]) => (
                  <div key={k} className={long ? "grid gap-1 md:col-span-2" : "grid gap-1"}>
                    <Label>{label}</Label>
                    {long ? <Textarea disabled={!editable} value={(a[k] as string) ?? ""} onChange={(e) => setA({ ...a, [k]: e.target.value })} />
                      : <Input disabled={!editable} value={(a[k] as string) ?? ""} onChange={(e) => setA({ ...a, [k]: e.target.value })} />}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Account</h3>
              <div className="flex flex-wrap items-center gap-4">
                <div className="grid gap-1"><Label>How many accounts</Label><Input type="number" min={1} max={20} className="w-24" disabled={!editable} value={a.accounts.count} onChange={(e) => setA({ ...a, accounts: { ...a.accounts, count: Number(e.target.value) || 1 } })} /></div>
                <div className="flex gap-2">{(["checking", "savings"] as const).map((t) => <Button key={t} size="sm" disabled={!editable} variant={a.accounts.type === t ? "default" : "outline"} onClick={() => setA({ ...a, accounts: { ...a.accounts, type: t } })}>{t === "checking" ? "Checking" : "Savings"}</Button>)}</div>
                <label className="flex items-center gap-2"><Checkbox disabled={!editable} checked={a.accounts.addToBankNow} onCheckedChange={(v) => setA({ ...a, accounts: { ...a.accounts, addToBankNow: v === true } })} />Add to existing BankNow portal</label>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">People</h3>
              <p className="text-sm text-muted-foreground">ID is only needed for people Texas Capital doesn't already have on file. Social Security numbers and birth dates are left for each signer to fill in on the forms.</p>
              {a.people.map((p, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <Input disabled={!editable} placeholder="Full name" value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} />
                    <Input disabled={!editable} placeholder="Title" value={p.title ?? ""} onChange={(e) => setPerson(i, { title: e.target.value })} />
                    <Input disabled={!editable} placeholder="Email" value={p.email ?? ""} onChange={(e) => setPerson(i, { email: e.target.value })} />
                    <Input disabled={!editable} placeholder="Phone" value={p.phone ?? ""} onChange={(e) => setPerson(i, { phone: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {(Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((r) => (
                      <label key={r} className="flex items-center gap-2"><Checkbox disabled={!editable} checked={p.roles.includes(r)} onCheckedChange={(v) => setPerson(i, { roles: v === true ? [...p.roles, r] : p.roles.filter((x) => x !== r) })} />{ROLE_LABEL[r]}</label>
                    ))}
                    {p.roles.includes("beneficial_owner") && <Input disabled={!editable} type="number" className="w-24" placeholder="%" value={p.ownershipPercent ?? ""} onChange={(e) => setPerson(i, { ownershipPercent: e.target.value ? Number(e.target.value) : null })} />}
                    <label className="flex items-center gap-2"><Checkbox disabled={!editable} checked={p.onFileWithBank} onCheckedChange={(v) => setPerson(i, { onFileWithBank: v === true })} />Already on file with Texas Capital</label>
                  </div>
                  {!p.onFileWithBank && editable && (
                    <div className="flex items-center gap-2 text-sm">
                      <span>{docs[`id_${i}`]?.path ? "ID uploaded." : "Upload ID:"}</span>
                      <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="max-w-xs" onChange={(e) => e.target.files?.[0] && upload(`id_${i}`, e.target.files[0])} />
                    </div>
                  )}
                  {editable && <Button size="sm" variant="ghost" onClick={() => setA({ ...a, people: a.people.filter((_, j) => j !== i) })}>Remove person</Button>}
                </div>
              ))}
              {editable && <Button size="sm" variant="outline" onClick={() => setA({ ...a, people: [...a.people, { name: "", roles: ["signer"], onFileWithBank: false }] })}>Add person</Button>}
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Entity documents</h3>
              {reqDocs.map((d) => (
                <div key={d.key} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="min-w-64">{d.label}</span>
                  <Badge variant={docs[d.key]?.path || docs[d.key]?.onFile ? "default" : "outline"}>{docs[d.key]?.path ? "Uploaded" : docs[d.key]?.onFile ? "Already with Texas Capital" : "Needed"}</Badge>
                  {editable && <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="max-w-xs" onChange={(e) => e.target.files?.[0] && upload(d.key, e.target.files[0])} />}
                  {editable && <label className="flex items-center gap-2"><Checkbox checked={!!docs[d.key]?.onFile} onCheckedChange={(v) => setDocs({ ...docs, [d.key]: { ...docs[d.key], onFile: v === true } })} />Already with Texas Capital</label>}
                </div>
              ))}
            </section>

            {editable && <Button onClick={() => run(doSave, "Saved")}>Save changes</Button>}
            {!["account_opened", "cancelled"].includes(pk.status) && <Button variant="ghost" onClick={() => { if (confirm("Cancel this package? The link will stop working.")) run(() => link({ data: { id: pk.id, action: "cancel" } }), "Package cancelled"); }}>Cancel package</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
