import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FilePlus2, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addInvestorDocumentFn, readInvestorDocumentFn } from "@/lib/offering-document-send.functions";
import { addFundAssetFn, recordAssetMarkFn } from "@/lib/fund-books.functions";
import { DOC_READ_MAX_BYTES, DOC_READ_TYPES } from "@/lib/investor-doc-extract-model";
import { SHAREABLE_KINDS, SHAREABLE_KIND_LABEL, markMethodFor, shareableKindFor, sharingBlock, type InvestorDocReading, type ShareableKind } from "@/lib/investor-update-reader-model";
import { invalidateFund } from "@/lib/fund-query-keys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fileToBase64, toCents, usd, fmtDate } from "@/components/fund-tabs/shared";

type ReadResult = Awaited<ReturnType<typeof readInvestorDocumentFn>>;
type HoldingState = { done: "recorded" | "review" | null; cost: string; busy: boolean };

const typeFor = (f: File) => {
  if ((DOC_READ_TYPES as readonly string[]).includes(f.type)) return f.type;
  const n = f.name.toLowerCase();
  return n.endsWith(".pdf") ? "application/pdf" : n.endsWith(".png") ? "image/png" : /\.jpe?g$/.test(n) ? "image/jpeg" : n.endsWith(".webp") ? "image/webp" : null;
};
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Add a fund-wide document for investors (valuation report, investor update) from
 * Send to investors. AI reads it and suggests the name, the email note and any
 * investment values; each suggestion is used only when the person presses its button.
 */
export function AddInvestorDocument({ offeringId, onAdded, onUseNote, onOpenTab }: {
  offeringId: string;
  onAdded: (documentId: string) => void;
  onUseNote: (note: string) => void;
  onOpenTab?: ((tab: string) => void) | undefined;
}) {
  const read = useServerFn(readInvestorDocumentFn);
  const add = useServerFn(addInvestorDocumentFn);
  const addAsset = useServerFn(addFundAssetFn);
  const mark = useServerFn(recordAssetMarkFn);
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [kind, setKind] = useState<ShareableKind>("valuation_report");
  const [title, setTitle] = useState("");
  const [asOf, setAsOf] = useState("");
  const [holdings, setHoldings] = useState<HoldingState[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setFile(null); setResult(null); setReadError(null); setTitle(""); setAsOf(""); setHoldings([]); setKind("valuation_report"); };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { toast.error("Files must be 50 MB or smaller."); return; }
    reset();
    setFile(f);
    setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 200));
    const contentType = typeFor(f);
    if (!contentType) { setReadError("Only PDFs and photos can be read. You can still add this file below."); return; }
    if (f.size > DOC_READ_MAX_BYTES) { setReadError("This file is over 10 MB, so it can't be read. You can still add it below."); return; }
    setReading(true);
    try {
      const r = await read({ data: { offeringId, fileName: f.name, contentType, base64: await fileToBase64(f) } });
      setResult(r);
      const rd = r.reading as InvestorDocReading;
      setKind(shareableKindFor(rd.kind));
      if (rd.title) setTitle(rd.title);
      if (rd.asOfDate) setAsOf(rd.asOfDate);
      setHoldings(rd.holdings.map((h) => ({ done: null, cost: h.costCents != null ? String(h.costCents / 100) : "", busy: false })));
    } catch (e) {
      setReadError((e as Error).message.replace(/^Forbidden:\s*/, ""));
    } finally { setReading(false); }
  };

  const rd = result?.reading as InvestorDocReading | undefined;
  const block = rd ? sharingBlock(rd) : null;

  const recordHolding = async (i: number) => {
    const h = rd!.holdings[i]!;
    const st = holdings[i]!;
    if (h.valueCents == null) return;
    const matchId = result!.matches[i] ?? null;
    const cost = matchId ? 0 : toCents(st.cost);
    if (!matchId && cost == null) { toast.error("Enter what the fund paid for this investment first."); return; }
    setHoldings((l) => l.map((x, j) => (j === i ? { ...x, busy: true } : x)));
    try {
      const assetId = matchId ?? (await addAsset({ data: { fundId: offeringId, issuerName: h.companyName, assetName: h.assetName, assetClass: h.assetClass, instrument: null, acquisitionDate: null, costCents: cost!, note: `Added from ${file?.name ?? "an investor document"}` } })).id;
      const r = await mark({ data: { fundId: offeringId, assetId, valueCents: h.valueCents, date: h.valuationDate || asOf || today(), method: markMethodFor(h.method), note: `From ${file?.name ?? "investor document"}${h.page ? `, page ${h.page}` : ""}` } });
      setHoldings((l) => l.map((x, j) => (j === i ? { ...x, busy: false, done: r.status === "effective" ? "recorded" : "review" } : x)));
      toast.success(r.status === "effective" ? "Value recorded." : "Value sent to Harmonious to approve.");
      void invalidateFund(qc, offeringId);
    } catch (e) {
      setHoldings((l) => l.map((x, j) => (j === i ? { ...x, busy: false } : x)));
      toast.error((e as Error).message);
    }
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const path = `${offeringId}/investor-documents/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("offering-files").upload(path, file);
      if (error) throw new Error(error.message);
      const r = await add({ data: { offeringId, docType: kind, title: title.trim(), filePath: path, fileName: file.name.slice(0, 200), fileSizeBytes: file.size, asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null } });
      toast.success("Added. It's ticked below: choose investors and press Send.");
      onAdded(r.documentId);
      void invalidateFund(qc, offeringId);
      setConfirm(false);
      reset();
    } catch (e) {
      toast.error((e as Error).message.replace(/^Forbidden:\s*/, ""));
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><FilePlus2 className="h-5 w-5" /> Add a document for investors</CardTitle>
        <CardDescription className="text-base">
          Add a valuation report, quarterly letter or other update. We read it for you and suggest the name, a short note and any investment values. Nothing is used until you press its button.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-base">
        {!file ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-6 text-center hover:bg-muted/40">
            <Sparkles className="h-6 w-6 text-accent" />
            <span className="font-medium">Choose a file</span>
            <span className="text-sm text-muted-foreground">PDF or photo is best, so we can read it. Word and other files can be added too.</span>
            <input type="file" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <span className="font-medium">{file.name}</span>
              <Button variant="ghost" size="sm" onClick={reset} disabled={saving || reading}>Choose a different file</Button>
            </div>

            {reading && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading your document…</p>}
            {readError && <p className="text-sm text-muted-foreground">{readError}</p>}

            {block ? (
              <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
                <p className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /> {block}</p>
                {rd?.kind === "fund_agreement" && onOpenTab && <Button variant="outline" onClick={() => onOpenTab("approve")}>Go to Review &amp; approve</Button>}
              </div>
            ) : !reading && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2"><Label>Name investors will see</Label><Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Type</Label>
                    <Select value={kind} onValueChange={(v) => setKind(v as ShareableKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SHAREABLE_KINDS.map((k) => <SelectItem key={k} value={k}>{SHAREABLE_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>As of date (optional)</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
                </div>

                {rd?.summary && (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-4">
                    <p className="text-sm font-medium text-muted-foreground">Suggested note for the email</p>
                    <p>{rd.summary}</p>
                    <Button variant="outline" size="sm" onClick={() => { onUseNote(rd.summary!); toast.success("Note added below."); }}>Use this note</Button>
                  </div>
                )}

                {rd && rd.holdings.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium">Investment values found</p>
                      <p className="text-sm text-muted-foreground">
                        Record these on the fund's investments so fund totals match the report.{result?.staff ? "" : " Values you record wait for Harmonious to approve before they change fund totals."}
                      </p>
                    </div>
                    {rd.holdings.map((h, i) => {
                      const st = holdings[i];
                      const match = result!.matches[i] ? result!.holdings.find((a) => a.id === result!.matches[i]) : null;
                      return (
                        <div key={i} className="space-y-2 rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{h.assetName}{h.companyName !== h.assetName ? <span className="text-muted-foreground"> · {h.companyName}</span> : null}</span>
                            <span>{h.valueCents != null ? usd(h.valueCents) : "No value stated"}{h.valuationDate ? ` · ${fmtDate(h.valuationDate)}` : ""}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {h.method ? `Method: ${h.method}. ` : ""}{h.page ? `Page ${h.page}. ` : ""}
                            {match ? `Matches "${match.asset_name}"${match.latestValueCents != null ? `, last value ${usd(match.latestValueCents)}` : ""}${match.pendingMark ? `, ${usd(match.pendingMark.valueCents)} already waiting for approval` : ""}.` : "Not on the fund's investments yet."}
                          </p>
                          {st?.done ? (
                            <Badge variant="outline">{st.done === "recorded" ? "Value recorded" : "Sent to Harmonious to approve"}</Badge>
                          ) : h.valueCents != null ? (
                            <div className="flex flex-wrap items-end gap-2">
                              {!match && (
                                <div className="space-y-1"><Label className="text-sm">What the fund paid</Label>
                                  <Input className="w-40" inputMode="decimal" placeholder="$0" value={st?.cost ?? ""} onChange={(e) => setHoldings((l) => l.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} /></div>
                              )}
                              <Button size="sm" variant="outline" disabled={st?.busy} onClick={() => void recordHolding(i)}>
                                {st?.busy ? "Saving…" : match ? "Record this value" : "Add investment and value"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {rd && rd.notes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Worth checking</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{rd.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                  </div>
                )}

                <Button size="lg" disabled={saving || !title.trim()} onClick={() => setConfirm(true)}>Add to the send list</Button>
              </>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirm} onOpenChange={(o) => !saving && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add "{title.trim()}" for investors?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Every investor in this fund will be able to open it in their portal. It is read only: nobody is asked to sign it. Emails go only to the investors you pick next.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Go back</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); void save(); }}>{saving ? "Adding…" : "Yes, add it"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
