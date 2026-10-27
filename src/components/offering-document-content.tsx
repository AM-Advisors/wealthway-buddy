import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { documentReachedEnd } from "@/lib/document-review-model";

type DocumentSource = { kind: "text" | "file"; body?: string | null; url?: string | null; filename?: string | null };

/** Browser rendering is separate from the authorized source read; it never signs or saves review. */
export function OfferingDocumentContent({ doc, title, onReachedEnd }: {
  doc: DocumentSource; title: string; onReachedEnd: () => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const callback = useRef(onReachedEnd);
  callback.current = onReachedEnd;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const isWord = doc.kind === "file" && /\.docx$/i.test(doc.filename ?? "");
  const isPdf = doc.kind === "file" && /\.pdf$/i.test(doc.filename ?? "");
  const canRender = doc.kind === "text" || isWord || isPdf;

  useEffect(() => {
    const container = content.current;
    if (!container) { setState("error"); return; }
    let cancelled = false;
    let ready = false;
    let destroyPdf: (() => void) | undefined;
    setState("loading");
    container.scrollTop = 0;
    const check = () => {
      if (!cancelled && documentReachedEnd({ ready, scrollTop: container.scrollTop, clientHeight: container.clientHeight, scrollHeight: container.scrollHeight })) callback.current();
    };
    const fit = () => {
      if (isWord) {
        const wrapper = container.querySelector<HTMLElement>(".docx-wrapper");
        const page = wrapper?.querySelector<HTMLElement>("section.docx");
        if (wrapper && page) {
          wrapper.style.zoom = "1";
          wrapper.style.zoom = String(Math.min(1, (container.clientWidth - 8) / (page.offsetWidth + 32)));
        }
      }
      check();
    };
    container.addEventListener("scroll", check);
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    (async () => {
      if (doc.kind !== "text") {
        container.replaceChildren();
        if (!doc.url || !canRender) throw new Error("Unsupported file");
        const response = await fetch(doc.url);
        if (!response.ok) throw new Error("File unavailable");
        const bytes = await response.arrayBuffer();
        if (cancelled) return;
        if (isWord) {
          const { renderAsync } = await import("docx-preview");
          if (cancelled) return;
          await renderAsync(bytes, container, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: false });
        } else {
          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
          if (cancelled) return;
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          const task = pdfjs.getDocument({ data: bytes });
          destroyPdf = () => { void task.destroy(); };
          const pdf = await task.promise;
          for (let number = 1; number <= pdf.numPages; number += 1) {
            if (cancelled) return;
            const page = await pdf.getPage(number);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(2, Math.max(1, container.clientWidth / base.width)) });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            canvas.className = "block h-auto w-full";
            canvas.setAttribute("role", "img");
            canvas.setAttribute("aria-label", `${title}, page ${number} of ${pdf.numPages}`);
            const canvasContext = canvas.getContext("2d");
            if (!canvasContext) throw new Error("Document display unavailable");
            await page.render({ canvas, canvasContext, viewport }).promise;
            if (cancelled) return;
            container.append(canvas);
          }
        }
      }
      if (cancelled) return;
      ready = true;
      setState("ready");
      fit();
    })().catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; observer.disconnect(); container.removeEventListener("scroll", check); destroyPdf?.(); };
  }, [doc.kind, doc.body, doc.url, isWord, isPdf, canRender, title]);

  return <div className="min-w-0 space-y-3">
    {doc.url && <Button asChild size="sm" variant="outline"><a href={doc.url} target="_blank" rel="noreferrer">Open or download document</a></Button>}
    {state === "loading" && <p className="text-sm text-muted-foreground">Opening the document…</p>}
    {state === "error" && <div className="space-y-2"><p className="text-sm text-destructive">Couldn’t display the file here. Open or download the document above.</p>
      {doc.url && <Button size="sm" variant="outline" onClick={() => callback.current()}>I have read the downloaded document</Button>}
    </div>}
    {canRender ? <div ref={content} role="region" aria-label={title} tabIndex={0} aria-busy={state === "loading"}
      className={doc.kind === "file" ? "document-surface max-h-[65vh] min-w-0 space-y-3 overflow-auto rounded-md border" : "max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-4 text-sm leading-relaxed"}>
      {doc.kind === "text" ? doc.body : null}
    </div> : doc.url && <iframe title={title} src={doc.url} className="h-[65vh] w-full rounded-md border bg-card" />}
  </div>;
}