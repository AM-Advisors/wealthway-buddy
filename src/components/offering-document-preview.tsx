import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye } from "lucide-react";
import { listDocumentVersions, getDocumentVersionUrl } from "@/lib/document-versions.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Explicit version selection: preview never substitutes the latest template. */
export function OfferingDocumentPreview({ offeringId, documentId, version, title, onClose }: { offeringId: string; documentId: string; version: number; title: string; onClose: () => void }) {
  const list = useServerFn(listDocumentVersions);
  const link = useServerFn(getDocumentVersionUrl);
  const q = useQuery({ queryKey: ["offering-version-preview", offeringId, documentId, version], retry: false, staleTime: 0, queryFn: async () => {
    const history = await list({ data: { offering_id: offeringId } });
    const selected = history.versions.find(v => v.document_id === documentId && v.version === version);
    if (!selected) throw new Error("This document version is not available.");
    return link({ data: { version_id: selected.id } });
  } });
  const content = useRef<HTMLDivElement>(null);
  const [wordState, setWordState] = useState<"loading" | "ready" | "failed">("loading");
  const word = /\.docx$/i.test(q.data?.fileName ?? "");
  useEffect(() => {
    const container = content.current;
    const url = q.data?.url;
    if (!word || !container || !url) return;
    let cancelled = false;
    setWordState("loading");
    const fit = () => {
      const wrapper = container.querySelector<HTMLElement>(".docx-wrapper");
      const page = wrapper?.querySelector<HTMLElement>("section.docx");
      if (wrapper && page) wrapper.style.zoom = String(Math.min(1, Math.max(0.1, (container.clientWidth - 8) / (page.offsetWidth + 32))));
    };
    void (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("File unavailable");
      const bytes = await response.arrayBuffer();
      const { renderAsync } = await import("docx-preview");
      if (cancelled) return;
      await renderAsync(bytes, container, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: false });
      if (!cancelled) { fit(); setWordState("ready"); }
    })().catch(() => { if (!cancelled) setWordState("failed"); });
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => { cancelled = true; observer.disconnect(); };
  }, [word, q.data?.url]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex h-[90dvh] w-[calc(100vw-2rem)] max-w-6xl flex-col overflow-hidden sm:max-w-6xl">
      <DialogHeader className="shrink-0 pr-6"><DialogTitle className="break-words">{title}</DialogTitle><DialogDescription>Version {version}{q.data?.fileName ? ` · ${q.data.fileName}` : ""}</DialogDescription></DialogHeader>
      {q.isPending ? <p className="text-sm text-muted-foreground">Opening document…</p> : q.error ? <div className="space-y-2"><p className="text-sm text-destructive">{q.error.message}</p><Button variant="outline" onClick={() => q.refetch()}>Retry</Button></div> : q.data && <>
        <div className="flex shrink-0 flex-wrap gap-2"><Button asChild size="sm" variant="outline"><a href={q.data.url} target="_blank" rel="noopener noreferrer"><Download className="size-4" /> Open or download</a></Button></div>
        {word && wordState === "loading" && <p className="text-sm text-muted-foreground">Opening document…</p>}
        {word && wordState === "failed" && <p className="text-sm text-destructive">This file could not be displayed. You can still open or download it.</p>}
        {word ? <div ref={content} className="document-surface min-h-0 min-w-0 flex-1 overflow-auto rounded-md border" /> : <iframe title={`${title} — Version ${version}`} src={q.data.url} className="min-h-0 w-full flex-1 rounded-md border bg-card" />}
      </>}
    </DialogContent>
  </Dialog>;
}

export function OfferingDocumentViewButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <Button size="sm" variant="outline" disabled={disabled} onClick={onClick}><Eye className="size-4" /> View</Button>;
}