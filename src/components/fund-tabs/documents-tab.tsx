import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOC_TEMPLATES, STARTER_NOTICE } from "@/lib/fund-doc-templates";
import { deleteFundFileFn, generateFundDocFn, listFundFilesFn, setSignatureBoxesFn, uploadFundFileFn } from "@/lib/fund-tabs.functions";
import { fileToBase64, fmtDate } from "./shared";

const STATUS: Record<string, string> = { draft: "Draft", out_for_signature: "Out for signature", signed: "Signed" };

export function DocumentsTab({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listFundFilesFn);
  const upload = useServerFn(uploadFundFileFn);
  const del = useServerFn(deleteFundFileFn);
  const q = useQuery({ queryKey: ["fund-files", fundId], queryFn: () => list({ data: { fundId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-files", fundId] });
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<any | null>(null);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("Files must be 20 MB or smaller."); return; }
    setBusy(true);
    try {
      await upload({ data: { fundId, title: file.name.replace(/\.[^.]+$/, ""), category: "uploaded", fileName: file.name, contentType: file.type || "application/octet-stream", base64: await fileToBase64(file) } });
      toast.success("Uploaded"); refresh();
    } catch (e: any) { toast.error(e?.message ?? "Upload failed."); } finally { setBusy(false); }
  };
  const rm = useMutation({ mutationFn: (id: string) => del({ data: { fundId, id } }), onSuccess: () => { toast.success("Deleted"); refresh(); }, onError: (e: Error) => toast.error(e.message) });

  const files = q.data ?? [];
  const groups = [
    { title: "Fund documents", keys: DOC_TEMPLATES.filter((t) => t.category === "fund_document") },
    { title: "Side letters", keys: DOC_TEMPLATES.filter((t) => t.category === "side_letter") },
    { title: "Agreements", keys: DOC_TEMPLATES.filter((t) => t.category === "agreement") },
  ];
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>Upload or delete files any time until they're signed. Signed documents are kept permanently.</CardDescription>
          </div>
          <label>
            <input type="file" className="hidden" disabled={busy} onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ""; }} />
            <Button asChild size="sm" disabled={busy}><span>{busy ? "Uploading…" : "Upload file"}</span></Button>
          </label>
        </CardHeader>
        <CardContent>
          {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : files.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No documents yet.</p> : (
            <div className="divide-y rounded-md border">
              {files.map((f: any) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline">{f.title}</a> : f.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.template_key ? "Generated from template" : f.file_name} · {fmtDate(f.created_at)}
                      {f.signature_boxes?.length ? ` · ${f.signature_boxes.length} signature box${f.signature_boxes.length === 1 ? "" : "es"}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={f.status === "signed" ? "default" : "outline"}>{STATUS[f.status] ?? f.status}</Badge>
                    {f.status !== "signed" && <Button size="sm" variant="outline" onClick={() => setBoxes(f)}>Signature boxes</Button>}
                    {f.status === "draft" && <Button size="sm" variant="ghost" disabled={rm.isPending} onClick={() => { if (confirm(`Delete "${f.title}"?`)) rm.mutate(f.id); }}>Delete</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate a document</CardTitle>
          <CardDescription>{STARTER_NOTICE}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title} className="space-y-2">
              <p className="text-sm font-medium">{g.title}</p>
              {g.keys.map((t) => <Button key={t.key} variant="outline" size="sm" className="w-full justify-start" onClick={() => setGen(t.key)}>{t.title}</Button>)}
            </div>
          ))}
        </CardContent>
      </Card>

      {gen && <GenerateDialog fundId={fundId} templateKey={gen} onClose={() => { setGen(null); refresh(); }} />}
      {boxes && <BoxesDialog fundId={fundId} file={boxes} onClose={() => { setBoxes(null); refresh(); }} />}
    </div>
  );
}

function GenerateDialog({ fundId, templateKey, onClose }: { fundId: string; templateKey: string; onClose: () => void }) {
  const t = DOC_TEMPLATES.find((x) => x.key === templateKey)!;
  const gen = useServerFn(generateFundDocFn);
  const [values, setValues] = useState<Record<string, string>>({});
  const m = useMutation({ mutationFn: () => gen({ data: { fundId, templateKey, values } }), onSuccess: () => { toast.success("Draft created in Documents"); onClose(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{STARTER_NOTICE}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {t.fields.map((f) => (
            <div key={f.key} className="space-y-1"><Label>{f.label}</Label><Input value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} /></div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={m.isPending} onClick={() => m.mutate()}>Create draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BoxesDialog({ fundId, file, onClose }: { fundId: string; file: any; onClose: () => void }) {
  const save = useServerFn(setSignatureBoxesFn);
  const [rows, setRows] = useState<{ signer: string; role: string; label: string }[]>(file.signature_boxes?.length ? file.signature_boxes : [{ signer: "", role: "Investor", label: "Signature" }]);
  const upd = (i: number, k: string, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const m = useMutation({ mutationFn: () => save({ data: { fundId, id: file.id, boxes: rows.filter((r) => r.signer.trim()) } }), onSuccess: () => { toast.success("Signature boxes saved"); onClose(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Signature boxes: {file.title}</DialogTitle><DialogDescription>Who signs, in what role. Harmonious places these when the document goes out for signature.</DialogDescription></DialogHeader>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <Input placeholder="Signer name" value={r.signer} onChange={(e) => upd(i, "signer", e.target.value)} />
              <Select value={r.role} onValueChange={(v) => upd(i, "role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Investor", "Manager / GP", "Authorized signatory", "Harmonious", "Counterparty"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Label (Signature, Initials, Date)" value={r.label} onChange={(e) => upd(i, "label", e.target.value)} />
              <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, { signer: "", role: "Investor", label: "Signature" }])}>Add box</Button>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={m.isPending} onClick={() => m.mutate()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
