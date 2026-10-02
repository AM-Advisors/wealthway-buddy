import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addTemplateVersionFn, createTemplateFromFundFn, decideTemplateVersionFn, listTemplateSourcesFn,
  listTemplatesFn, templateDownloadUrlFn, useTemplateInFundFn,
} from "@/lib/fund-doc-templates.functions";

export const Route = createFileRoute("/_authenticated/ops/document-templates")({
  head: () => ({
    meta: [
      { title: "Document templates - Harmonious Operations" },
      { name: "description", content: "Reusable fund document templates with versioning and second-person approval." },
      { property: "og:title", content: "Document templates - Harmonious Operations" },
      { property: "og:description", content: "Turn one fund's document into an approved template for other funds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TemplatesPage,
});

const STATUS: Record<string, string> = { pending_approval: "Waiting for approval", approved: "Approved", rejected: "Rejected" };
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

function TemplatesPage() {
  const list = useServerFn(listTemplatesFn);
  const q = useQuery({ queryKey: ["doc-templates"], queryFn: () => list() });
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Document templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Turn one fund's document into a reusable template. Each version needs approval from a second Harmonious team member. Using a template adds it to a fund as a new version that still goes through that fund's review before investors see it.</p>
      </header>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : (
        <>
          <CreateFromFund funds={q.data!.funds} />
          {q.data!.templates.length === 0 ? <p className="text-sm text-muted-foreground">No templates yet.</p> : q.data!.templates.map((t) => <TemplateCard key={t.id} t={t} funds={q.data!.funds} />)}
        </>
      )}
    </div>
  );
}

function CreateFromFund({ funds }: { funds: { id: string; name: string }[] }) {
  const sources = useServerFn(listTemplateSourcesFn);
  const create = useServerFn(createTemplateFromFundFn);
  const qc = useQueryClient();
  const [fund, setFund] = useState("");
  const [doc, setDoc] = useState("");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const s = useQuery({ queryKey: ["tpl-sources", fund], queryFn: () => sources({ data: { offeringId: fund } }), enabled: !!fund });
  const d = s.data?.find((x) => x.id === doc);
  async function go() {
    setBusy(true);
    try {
      await create({ data: { offeringId: fund, documentId: doc, version: Number(version), title: title || null } });
      toast.success("Template created - waiting for a second person to approve v1.");
      setDoc(""); setVersion(""); setTitle("");
      qc.invalidateQueries({ queryKey: ["doc-templates"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Create a template from a fund document</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <select className={sel} value={fund} onChange={(e) => { setFund(e.target.value); setDoc(""); setVersion(""); }}>
          <option value="">Choose a fund…</option>
          {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select className={sel} value={doc} disabled={!s.data} onChange={(e) => { setDoc(e.target.value); setVersion(""); }}>
          <option value="">{fund && s.data?.length === 0 ? "No uploaded documents" : "Choose a document…"}</option>
          {s.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <select className={sel} value={version} disabled={!d} onChange={(e) => setVersion(e.target.value)}>
          <option value="">Choose a version…</option>
          {d?.versions.map((v) => <option key={v.version} value={v.version}>v{v.version} · {v.fileName} ({v.status.replace(/_/g, " ")})</option>)}
        </select>
        <Input placeholder="Template name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button className="sm:col-span-2 sm:w-fit" disabled={busy || !version} onClick={go}>{busy ? "Creating…" : "Create template"}</Button>
      </CardContent>
    </Card>
  );
}

type T = Awaited<ReturnType<typeof listTemplatesFn>>["templates"][number];

function TemplateCard({ t, funds }: { t: T; funds: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideTemplateVersionFn);
  const addVersion = useServerFn(addTemplateVersionFn);
  const use = useServerFn(useTemplateInFundFn);
  const dl = useServerFn(templateDownloadUrlFn);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["doc-templates"] });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); setNote(""); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  async function upload(): Promise<void> {
    if (!file) return undefined;
    if (file.size > 20 * 1024 * 1024) { toast.error("Files must be 20 MB or smaller."); return; }
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    await run(() => addVersion({ data: { templateId: t.id, fileName: file.name, base64: btoa(bin), note: note || null } }), "New version added - waiting for approval.");
    setFile(null);
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{t.title}</CardTitle>
          <Badge variant={t.currentApproved ? "default" : "secondary"}>{t.currentApproved ? `Approved v${t.currentApproved}` : "Not approved yet"}</Badge>
        </div>
        <CardDescription>{t.category} · used in {t.uses.length} fund(s)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="divide-y rounded-md border text-sm">
          {t.versions.map((v) => (
            <li key={v.version} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><span className="font-medium">v{v.version}</span> · {v.fileName} <span className="text-muted-foreground">· {v.source} · added by {v.createdBy} {new Date(v.createdAt).toLocaleDateString()}</span></span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{STATUS[v.status] ?? v.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={async () => { try { window.open((await dl({ data: { templateId: t.id, version: v.version } })).url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); } }}>View</Button>
                </span>
              </div>
              {v.note ? <p className="text-xs text-muted-foreground">Change: {v.note}</p> : null}
              {v.decidedBy ? <p className="text-xs text-muted-foreground">{STATUS[v.status]} by {v.decidedBy} on {new Date(v.decidedAt!).toLocaleDateString()}{v.decisionNote ? ` - "${v.decisionNote}"` : ""}</p> : null}
              {v.status === "pending_approval" && (v.mine ? (
                <p className="text-xs text-muted-foreground">You added this version, so a different Harmonious team member must approve it.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Input className="h-8 max-w-xs" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button size="sm" disabled={busy} onClick={() => run(() => decide({ data: { templateId: t.id, version: v.version, decision: "approve", note: note || null } }), `v${v.version} approved`)}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => run(() => decide({ data: { templateId: t.id, version: v.version, decision: "reject", note } }), `v${v.version} rejected`)}>Reject</Button>
                </div>
              ))}
            </li>
          ))}
        </ul>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Upload a new version</p>
            <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Textarea rows={2} placeholder="What changed?" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" disabled={busy || !file} onClick={upload}>Add version</Button>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Use in a fund</p>
            <select className={`${sel} w-full`} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a fund…</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <Button size="sm" disabled={busy || !target || !t.currentApproved} onClick={() => run(() => use({ data: { templateId: t.id, version: t.currentApproved!, offeringId: target } }), "Added to the fund as a new version for its review.")}>
              {t.currentApproved ? `Use approved v${t.currentApproved}` : "Needs an approved version"}
            </Button>
            <p className="text-xs text-muted-foreground">The fund then reviews it, sets signature blocks and chooses when to put it in use.</p>
          </div>
        </div>

        {t.uses.length ? (
          <div>
            <p className="mb-1 text-sm font-medium">Where it's used</p>
            <ul className="text-xs text-muted-foreground">
              {t.uses.map((u, i) => <li key={i}>{u.fund}: template v{u.templateVersion} → fund v{u.fundVersion} · {new Date(u.at).toLocaleDateString()}</li>)}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
