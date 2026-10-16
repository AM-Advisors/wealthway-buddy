import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fundTemplateDocumentUrlFn, listFundTemplateDocumentsFn, removeFundTemplateDocumentFn } from "@/lib/fund-doc-templates.functions";
import { fmtDate } from "./shared";

const ROLE: Record<string, string> = { investor: "Investor", fund_signatory: "Fund manager" };

/** Harmonious template documents on this fund: review the filled document, or delete a draft that hasn't gone out. */
export function TemplateDocumentsCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listFundTemplateDocumentsFn);
  const del = useServerFn(removeFundTemplateDocumentFn);
  const q = useQuery({ queryKey: ["fund-template-docs", fundId], queryFn: () => list({ data: { offeringId: fundId } }) as Promise<any[]> });
  const [review, setReview] = useState<any | null>(null);
  const rm = useMutation({
    mutationFn: (d: any) => del({ data: { offeringId: fundId, documentId: d.id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const docs = q.data ?? [];
  if (!q.isLoading && docs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Harmonious template documents</CardTitle>
        <CardDescription>Review each filled document before it goes out. Drafts can be deleted until they're approved or sent.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <div className="divide-y rounded-md border">
            {docs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Made {fmtDate(d.usedAt)} · {d.signers.length ? `Signs: ${d.signers.map((r: string, i: number) => `${i + 1}. ${ROLE[r] ?? r}`).join(", ")}` : "No signatures"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!d.canDelete && <Badge variant="outline">Approved or sent</Badge>}
                  <Button size="sm" variant="outline" disabled={!d.versionId} onClick={() => setReview(d)}>Review</Button>
                  {d.canDelete && <Button size="sm" variant="ghost" disabled={rm.isPending} onClick={() => { if (confirm(`Delete "${d.title}"? It hasn't been sent, and it stays in Audit History.`)) rm.mutate(d); }}>Delete</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {review && <ReviewDialog fundId={fundId} doc={review} onClose={() => setReview(null)} />}
    </Card>
  );
}

function ReviewDialog({ fundId, doc, onClose }: { fundId: string; doc: any; onClose: () => void }) {
  const getUrl = useServerFn(fundTemplateDocumentUrlFn);
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const { url } = await getUrl({ data: { offeringId: fundId, versionId: doc.versionId } });
        if (off) return;
        setUrl(url);
        const bytes = await (await fetch(url)).arrayBuffer();
        if (!/\.docx$/i.test(doc.fileName ?? "")) { setState("ready"); return; }
        const { renderAsync } = await import("docx-preview");
        if (off || !box.current) return;
        await renderAsync(bytes, box.current, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: false });
        setState("ready");
      } catch { if (!off) setState("error"); }
    })();
    return () => { off = true; };
  }, [doc.versionId]);
  const isDocx = /\.docx$/i.test(doc.fileName ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
          <DialogDescription>Filled in from the fund's details. {url && <a href={url} className="underline" target="_blank" rel="noreferrer">Download</a>}</DialogDescription>
        </DialogHeader>
        {state === "loading" && <p className="text-sm text-muted-foreground">Opening the document…</p>}
        {state === "error" && <p className="text-sm text-destructive">Couldn't open the document. Try Download instead.</p>}
        {isDocx ? <div ref={box} className="max-h-[75vh] overflow-auto rounded-md border bg-muted" /> : url && state === "ready" && <iframe title={doc.title} src={url} className="h-[75vh] w-full rounded-md border" />}
      </DialogContent>
    </Dialog>
  );
}
