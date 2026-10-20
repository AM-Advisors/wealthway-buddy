import { invalidateFund } from "@/lib/fund-query-keys";
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
import { TemplateDocumentsCard } from "./template-documents-card";
import { listTemplatesFn, templateAutofillCheckFn, useTemplateInFundFn } from "@/lib/fund-doc-templates.functions";
import { FundTypeDocumentsCard } from "./fund-type-documents-card";
import { fileToBase64, fmtDate } from "./shared";
import { StandardFormsCard } from "./standard-forms-card";
import { OfferingDocumentsSetup } from "@/components/offering-documents-setup";
import { fundSigningContextFn, sendFileForSignatureFn, remindFileSignerFn } from "@/lib/fund-file-signing.functions";

const STATUS: Record<string, string> = { draft: "Draft", out_for_signature: "Out for signature", signed: "Signed" };

export function DocumentsTab({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listFundFilesFn);
  const upload = useServerFn(uploadFundFileFn);
  const del = useServerFn(deleteFundFileFn);
  const q = useQuery({ queryKey: ["fund-files", fundId], queryFn: () => list({ data: { fundId } }) });
  const refresh = () => { void invalidateFund(qc, fundId); };
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<any | null>(null);
  const [mode, setMode] = useState<"pick" | null>(null);
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const listTpl = useServerFn(listTemplatesFn);
  const applyTpl = useServerFn(useTemplateInFundFn);
  const tpl = useQuery({ queryKey: ["harmonious-templates"], queryFn: () => listTpl() as Promise<any>, retry: false, enabled: mode === "pick" });
  const [made, setMade] = useState<{ title: string; signing: any; autofill: any } | null>(null);
  const useTpl = useMutation({
    mutationFn: (t: any) => applyTpl({ data: { templateId: t.id, version: t.currentApproved, offeringId: fundId } }).then((r: any) => ({ ...r, title: t.title })),
    onSuccess: (r: any) => { setMode(null); setMade({ title: r.title, signing: r.signing, autofill: r.autofill }); void invalidateFund(qc, fundId); },
    onError: (e: Error) => toast.error(e.message),
  });
  const checkFn = useServerFn(templateAutofillCheckFn);
  const [checking, setChecking] = useState<any | null>(null);
  const check = useQuery({ queryKey: ["tpl-check", fundId, checking?.id], enabled: !!checking, retry: false, queryFn: () => checkFn({ data: { templateId: checking.id, version: checking.currentApproved, offeringId: fundId } }) });
  const ROLE: Record<string, string> = { investor: "Investor", fund_signatory: "Fund manager (fund signatory)" };

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
  const sigCtxFn = useServerFn(fundSigningContextFn);
  const sendSigFn = useServerFn(sendFileForSignatureFn);
  const sig = useQuery({ queryKey: ["fund-signing", fundId], queryFn: () => sigCtxFn({ data: { fundId } }) });
  const remindFn = useServerFn(remindFileSignerFn);
  const remind = useMutation({
    mutationFn: async (id: string) => {
      try { return await remindFn({ data: { signatureId: id } }); }
      catch (e: any) {
        if (!/24 hours/.test(e?.message ?? "")) throw e;
        const reason = window.prompt("A reminder was already sent today. Super Admins can send another — enter a reason (it's logged):");
        if (!reason?.trim()) throw e;
        return await remindFn({ data: { signatureId: id, overrideReason: reason.trim() } });
      }
    },
    onSuccess: (r: any) => { toast.success(`Reminder sent to ${r.recipientEmail}.`); qc.invalidateQueries({ queryKey: ["fund-signing", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [sendFor, setSendFor] = useState<any | null>(null);
  const [mgr, setMgr] = useState("");
  type Order = "investor_first" | "manager_first" | "manager_only" | "investor_only";
  const [order, setOrder] = useState<Order>("investor_first");
  const [signMode, setSignMode] = useState<"full" | "signature_page">("full");
  const [invIds, setInvIds] = useState<string[]>([]);
  const needsInv = order !== "manager_only", needsMgr = order !== "investor_only";
  const send = useMutation({
    mutationFn: () => sendSigFn({ data: { fundId, fileId: sendFor.id, order, mode: signMode, onboardingIds: needsInv ? invIds : [], managerUserId: needsMgr ? mgr || undefined : undefined } }),
    onSuccess: (r: any) => {
      toast.success(`Sent ${r.sent} signing request${r.sent === 1 ? "" : "s"}.${r.skipped?.length ? ` Skipped: ${r.skipped.map((x: any) => `${x.name} (${x.reason})`).join(", ")}.` : ""}`);
      setSendFor(null); setInvIds([]); setMgr(""); refresh(); qc.invalidateQueries({ queryKey: ["fund-signing", fundId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const openSend = (f: any) => {
    setSendFor(f);
    setOrder(f.doc_type === "operating_agreement" || f.template_key === "operating_agreement" ? "manager_only" : (f.signing_order ?? "investor_first"));
    setSignMode(f.signing_mode ?? "full");
    setInvIds([]);
  };
  const ORDER_LABEL: Record<Order, string> = { investor_first: "Investor first, then fund manager", manager_first: "Fund manager first, then investor", manager_only: "Fund manager only", investor_only: "Investor only" };
  const groups = [
    { title: "Fund documents", keys: DOC_TEMPLATES.filter((t) => t.category === "fund_document") },
    { title: "Side letters", keys: DOC_TEMPLATES.filter((t) => t.category === "side_letter") },
    { title: "Agreements", keys: DOC_TEMPLATES.filter((t) => t.category === "agreement") },
  ];
  return (
    <div className="space-y-5">
      <OfferingDocumentsSetup offeringId={fundId} onChanged={refresh} />
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>Upload or delete files any time until they're signed. Signed documents are kept permanently.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <label>
              <input type="file" className="hidden" disabled={busy} onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ""; }} />
              <Button asChild size="sm" variant="outline" disabled={busy}><span>{busy ? "Loading…" : "Load file"}</span></Button>
            </label>
            <Button size="sm" onClick={() => setMode("pick")}>Generate from template</Button>
          </div>
        </CardHeader>
        <CardContent>
          {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : files.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No documents yet.</p> : (
            <div className="divide-y rounded-md border">
              {files.map((f: any) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline">{f.title}</a> : f.body ? <button type="button" className="text-left hover:underline" onClick={() => setPreview({ title: f.title, body: f.body })}>{f.title}</button> : f.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.template_key ? "Generated from template" : f.file_name} · {fmtDate(f.created_at)}
                      {f.signature_boxes?.length ? ` · ${f.signature_boxes.length} signature box${f.signature_boxes.length === 1 ? "" : "es"}` : ""}
                    </p>
                    {(sig.data?.signatures ?? []).filter((x: any) => x.file_id === f.id).map((x: any) => (
                      <p key={x.id} className="text-xs text-muted-foreground">{x.signing_order}. {x.signer_role === "investor" ? "Investor" : "Fund manager"} {x.signer_name}: {x.status === "signed" ? `signed ${fmtDate(x.signed_at)}` : x.status === "sent" ? "link sent, waiting" : "waits for the earlier signer"}{x.lastRemindedAt ? ` · last reminded ${fmtDate(x.lastRemindedAt)}` : ""}{x.status !== "signed" && (x.status === "sent" || (sig.data?.signatures ?? []).filter((y: any) => y.file_id === f.id && y.signing_order < x.signing_order).every((y: any) => y.status === "signed")) && <button type="button" className="ml-2 text-primary underline-offset-2 hover:underline disabled:opacity-50" disabled={remind.isPending} onClick={() => remind.mutate(x.id)}>Send reminder</button>}</p>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {f.status !== "signed" && f.body && <Button size="sm" variant="outline" onClick={() => openSend(f)}>{f.status === "out_for_signature" ? "Resend" : "Send for signature"}</Button>}
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

      <FundTypeDocumentsCard fundId={fundId} />

      <TemplateDocumentsCard fundId={fundId} />

      <StandardFormsCard fundId={fundId} onGenerated={refresh} />

      {sendFor && (
        <Dialog open onOpenChange={(o) => !o && setSendFor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Send for signature</DialogTitle><DialogDescription>{order === "manager_only" ? `Only the fund manager signs "${sendFor.title}". Investors are not asked to sign it.` : order === "investor_only" ? `Each investor gets a signature page filled in from their records. When every page is signed, "${sendFor.title}" is marked Signed.` : `Each investor gets one signature page with a fund manager block and an investor block, filled in from their records. When every page is signed, "${sendFor.title}" is marked Signed.`}</DialogDescription></DialogHeader>
            <div className="space-y-3">
              {sendFor.body && (
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setPreview({ title: sendFor.title, body: sendFor.body })}>
                  View document before sending
                </Button>
              )}
              <div className="space-y-1"><Label>Signing order</Label>
                <Select value={order} onValueChange={(v) => setOrder(v as Order)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(ORDER_LABEL) as Order[]).map((k) => <SelectItem key={k} value={k}>{ORDER_LABEL[k]}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>What they sign</Label>
                <Select value={signMode} onValueChange={(v) => setSignMode(v as "full" | "signature_page")}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full document with signature page</SelectItem>
                    <SelectItem value="signature_page">Signature page only (document shown to read)</SelectItem>
                  </SelectContent></Select></div>
              {needsInv && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><Label>Investors</Label>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => { const all = (sig.data?.investors ?? []).filter((i: any) => i.email).map((i: any) => i.onboardingId); setInvIds(invIds.length === all.length ? [] : all); }}>{invIds.length && invIds.length === (sig.data?.investors ?? []).filter((i: any) => i.email).length ? "Clear" : "Select all"}</button></div>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                    {(sig.data?.investors ?? []).map((i: any) => (
                      <label key={i.onboardingId} className={`flex items-center gap-2 text-sm ${i.email ? "" : "opacity-50"}`}>
                        <input type="checkbox" disabled={!i.email} checked={invIds.includes(i.onboardingId)} onChange={(e) => setInvIds(e.target.checked ? [...invIds, i.onboardingId] : invIds.filter((x) => x !== i.onboardingId))} />
                        {i.name}{i.email ? "" : " (no email)"}
                      </label>
                    ))}
                    {!sig.data?.investors?.length && <p className="text-xs text-muted-foreground">No investors on this fund yet.</p>}
                  </div>
                </div>
              )}
              {needsMgr && (
                <div className="space-y-1"><Label>Fund manager</Label>
                  <Select value={mgr} onValueChange={setMgr}><SelectTrigger><SelectValue placeholder="Choose a fund manager" /></SelectTrigger>
                    <SelectContent>{(sig.data?.managers ?? []).map((m: any) => <SelectItem key={m.userId} value={m.userId} disabled={!m.email}>{m.name}</SelectItem>)}</SelectContent></Select>
                  {!sig.data?.managers?.length && <p className="text-xs text-muted-foreground">This fund has no fund manager with a login yet.</p>}</div>
              )}
            </div>
            <DialogFooter><Button disabled={(needsMgr && !mgr) || (needsInv && !invIds.length) || send.isPending} onClick={() => send.mutate()}>{send.isPending ? "Sending…" : needsInv && invIds.length > 1 ? `Send to ${invIds.length} investors` : "Send"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}


      {mode === "pick" && (
        <Dialog open onOpenChange={(o) => !o && setMode(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Generate from template</DialogTitle><DialogDescription>{STARTER_NOTICE}</DialogDescription></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-3">
              {groups.map((g) => (
                <div key={g.title} className="space-y-2">
                  <p className="text-sm font-medium">{g.title}</p>
                  {g.keys.map((t) => <Button key={t.key} variant="outline" size="sm" className="w-full justify-start whitespace-normal text-left h-auto py-2" onClick={() => { setMode(null); setGen(t.key); }}>{t.title}</Button>)}
                </div>
              ))}
            </div>
            {(tpl.data?.templates ?? []).some((t: any) => t.currentApproved) && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Harmonious fund templates</p>
                <p className="text-xs text-muted-foreground">Filled in from the fund's details, with the signature block set up for you.</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(tpl.data?.templates ?? []).filter((t: any) => t.currentApproved).map((t: any) => (
                    <Button key={t.id} variant="outline" size="sm" className="h-auto w-full justify-start whitespace-normal py-2 text-left" disabled={useTpl.isPending} onClick={() => { setMode(null); setChecking(t); }}>{useTpl.isPending && useTpl.variables?.id === t.id ? "Creating…" : t.title}</Button>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
      {checking && (
        <Dialog open onOpenChange={(o) => !o && setChecking(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{checking.title}</DialogTitle><DialogDescription>These blanks are filled from this fund's details. Anything missing can be added under Setup → Fund Details, or left blank for review.</DialogDescription></DialogHeader>
            {check.isLoading ? <p className="text-sm text-muted-foreground">Checking the template…</p> : check.error ? <p className="text-sm text-destructive">{(check.error as Error).message}</p> : (
              <div className="space-y-3 text-sm">
                <div><p className="font-medium">Have it ({check.data?.filled.length ?? 0})</p><p className="text-xs text-muted-foreground">{check.data?.filled.join(", ") || "None"}</p></div>
                <div><p className="font-medium">Missing ({check.data?.open.length ?? 0})</p><p className="text-xs text-muted-foreground">{check.data?.open.join(", ") || "Nothing. Every blank will be filled."}</p>
                  {!!check.data?.open.length && <p className="mt-1 text-xs text-muted-foreground">Investor amount, signature and date blanks are completed at signing.</p>}</div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setChecking(null)}>Cancel</Button>
              <Button disabled={useTpl.isPending || check.isLoading} onClick={() => useTpl.mutate(checking, { onSettled: () => setChecking(null) })}>{useTpl.isPending ? "Creating…" : "Use fund template"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {made && (
        <Dialog open onOpenChange={(o) => !o && setMade(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{made.title}</DialogTitle><DialogDescription>Added to the fund's offering documents. No additional Harmonious approval is required.</DialogDescription></DialogHeader>
            <div className="space-y-3 text-sm">
              {made.signing?.roles?.length ? (
                <div>
                  <p className="font-medium">Signature block</p>
                  <ol className="mt-1 list-decimal pl-5">{made.signing.roles.map((r: string) => <li key={r}>{ROLE[r] ?? r}</li>)}</ol>
                  <p className="mt-1 text-xs text-muted-foreground">{made.signing.configured ? "Signing boxes set up and ready to send. You can still change them under Offering documents." : `Not set up yet: ${made.signing.message ?? "check the signing setup."}`}</p>
                </div>
              ) : <p className="text-muted-foreground">No signatures needed for this document.</p>}
              {made.autofill && <p className="text-xs text-muted-foreground">Filled {made.autofill.filled.length} field{made.autofill.filled.length === 1 ? "" : "s"} from the fund.{made.autofill.open.length ? ` Still blank: ${made.autofill.open.join(", ")}.` : ""}</p>}
            </div>
            <DialogFooter><Button onClick={() => setMade(null)}>Done</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {gen && <GenerateDialog fundId={fundId} templateKey={gen} onClose={() => setGen(null)} onCreated={(doc) => { setGen(null); refresh(); setPreview(doc); }} />}
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{preview.title}</DialogTitle><DialogDescription>Saved as a draft in Documents.</DialogDescription></DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-background p-6 font-serif text-sm leading-relaxed whitespace-pre-wrap">{preview.body}</div>
            <DialogFooter><Button onClick={() => setPreview(null)}>Done</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {boxes && <BoxesDialog fundId={fundId} file={boxes} onClose={() => { setBoxes(null); refresh(); }} />}
    </div>
  );
}

function GenerateDialog({ fundId, templateKey, onClose, onCreated }: { fundId: string; templateKey: string; onClose: () => void; onCreated: (doc: { title: string; body: string }) => void }) {
  const t = DOC_TEMPLATES.find((x) => x.key === templateKey)!;
  const gen = useServerFn(generateFundDocFn);
  const [values, setValues] = useState<Record<string, string>>({});
  const m = useMutation({ mutationFn: () => gen({ data: { fundId, templateKey, values } }), onSuccess: (r: any) => { toast.success("Draft created in Documents"); onCreated({ title: r.title, body: r.body }); }, onError: (e: Error) => toast.error(e.message) });
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
