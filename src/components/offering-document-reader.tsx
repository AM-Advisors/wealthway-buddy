import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readOfferingDocument } from "@/lib/offering-documents.functions";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/load-error";

export function OfferingDocumentReader({ documentId, title, onReachedEnd }: { documentId: string; title: string; onReachedEnd: () => void }) {
  const load = useServerFn(readOfferingDocument);
  const query = useQuery({ queryKey: ["offering-document-read", documentId], queryFn: () => load({ data: { document_id: documentId } }), retry: false, staleTime: 0 });
  const content = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState(false);
  const [rendering, setRendering] = useState(false);
  const doc = query.data;
  const isWord = doc?.kind === "file" && /\.docx$/i.test(doc.filename ?? "");
  useEffect(() => {
    let cancelled = false;
    if (!isWord || !doc?.url || !content.current) return;
    const container = content.current;
    setRendering(true); setRenderError(false);
    const fit = () => {
      const wrapper = container.querySelector<HTMLElement>(".docx-wrapper");
      const page = wrapper?.querySelector<HTMLElement>("section.docx");
      if (wrapper && page) { wrapper.style.zoom = "1"; wrapper.style.zoom = String(Math.min(1, (container.clientWidth - 8) / (page.offsetWidth + 32))); }
    };
    (async () => {
      const response = await fetch(doc.url);
      if (!response.ok) throw new Error("File unavailable");
      const bytes = await response.arrayBuffer();
      const { renderAsync } = await import("docx-preview");
      if (cancelled) return;
      await renderAsync(bytes, container, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: false });
      if (!cancelled) fit();
    })().catch(() => { if (!cancelled) setRenderError(true); }).finally(() => { if (!cancelled) setRendering(false); });
    const observer = new ResizeObserver(fit); observer.observe(container);
    return () => { cancelled = true; observer.disconnect(); };
  }, [isWord, doc?.url]);
  useEffect(() => {
    if (doc?.kind === "text" && content.current && content.current.scrollHeight <= content.current.clientHeight + 24) onReachedEnd();
  }, [doc, onReachedEnd]);
  if (query.isPending) return <p className="text-sm text-muted-foreground">Opening the document…</p>;
  if (query.error) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  if (!doc) return null;
  return <div className="min-w-0 space-y-3">
    {doc.url && <Button asChild size="sm" variant="outline"><a href={doc.url} target="_blank" rel="noreferrer">Open or download document</a></Button>}
    {rendering && <p className="text-sm text-muted-foreground">Opening the document…</p>}
    {renderError && <p className="text-sm text-destructive">Couldn’t display the file here. Open or download the document above.</p>}
    {doc.kind === "text" || isWord ? <div ref={content} onScroll={() => {
      const el = content.current;
      if (el && !rendering && !renderError && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) onReachedEnd();
    }} className={isWord ? "document-surface max-h-[65vh] min-w-0 overflow-auto rounded-md border" : "max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-4 text-sm leading-relaxed"}>{doc.kind === "text" ? doc.body : null}</div>
      : doc.url && <iframe title={title} src={doc.url} className="h-[65vh] w-full rounded-md border bg-card" />}
  </div>;
}