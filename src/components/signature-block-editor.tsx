import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getOfferingDocumentFileUrl } from "@/lib/offering-files.functions";
import {
  BLOCK_TYPES,
  listSignatureBlocks,
  saveSignatureBlocks,
  type SignatureBlockType,
} from "@/lib/signature-blocks.functions";

type Block = {
  key: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  block_type: SignatureBlockType;
  required: boolean;
  signer_role: "investor" | "fund_manager";
};

const DEFAULT_SIZE: Record<SignatureBlockType, { width: number; height: number }> = {
  signature: { width: 0.28, height: 0.05 },
  initials: { width: 0.1, height: 0.04 },
  date: { width: 0.18, height: 0.035 },
  full_name: { width: 0.28, height: 0.035 },
  title: { width: 0.24, height: 0.035 },
  entity_name: { width: 0.3, height: 0.035 },
  text: { width: 0.24, height: 0.035 },
};

const typeLabel = (t: SignatureBlockType) =>
  BLOCK_TYPES.find((b) => b.value === t)?.label ?? t;

/**
 * Lets the client drag signature, initials, date and name boxes onto the actual
 * pages of an uploaded PDF. Investors' typed details are stamped into these
 * exact spots when they sign.
 */
export function SignatureBlockEditor({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose?: () => void;
}) {
  const loadBlocks = useServerFn(listSignatureBlocks);
  const saveBlocks = useServerFn(saveSignatureBlocks);
  const getUrl = useServerFn(getOfferingDocumentFileUrl);

  const [pages, setPages] = useState<{ number: number; dataUrl: string; ratio: number }[]>([]);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tool, setTool] = useState<SignatureBlockType>("signature");
  const [role, setRole] = useState<"investor" | "fund_manager">("investor");
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ key: string; dx: number; dy: number } | null>(null);

  const meta = useQuery({
    queryKey: ["signature-blocks", documentId],
    queryFn: () => loadBlocks({ data: { documentId } }),
    retry: false,
  });

  useEffect(() => {
    if (!meta.data) return;
    setBlocks(
      meta.data.blocks.map((b, i) => ({
        key: `${b.id}-${i}`,
        page_number: b.page_number,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        block_type: b.block_type,
        required: b.required,
        signer_role: b.signer_role,
      })),
    );
  }, [meta.data]);

  useEffect(() => {
    let cancelled = false;
    if (!meta.data?.hasFile) {
      setRendering(false);
      return;
    }
    (async () => {
      try {
        setRendering(true);
        const { url } = (await getUrl({ data: { documentId } })) as any;
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const pdfjs: any = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        const out: { number: number; dataUrl: string; ratio: number }[] = [];
        const count = Math.min(pdf.numPages, 25);
        for (let i = 1; i <= count; i += 1) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 900 / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          out.push({
            number: i,
            dataUrl: canvas.toDataURL("image/png"),
            ratio: viewport.height / viewport.width,
          });
        }
        if (!cancelled) setPages(out);
      } catch (err) {
        if (!cancelled) {
          setRenderError(
            err instanceof Error ? err.message : "That file could not be shown as pages.",
          );
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, meta.data?.hasFile, getUrl]);

  const addBlock = (pageNumber: number, x: number, y: number) => {
    const size = DEFAULT_SIZE[tool];
    setBlocks((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        page_number: pageNumber,
        x: Math.max(0, Math.min(1 - size.width, x - size.width / 2)),
        y: Math.max(0, Math.min(1 - size.height, y - size.height / 2)),
        width: size.width,
        height: size.height,
        block_type: tool,
        required: true,
        signer_role: role,
      },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveBlocks({
        data: {
          documentId,
          blocks: blocks.map((b) => ({
            page_number: b.page_number,
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            block_type: b.block_type,
            required: b.required,
            signer_role: b.signer_role,
          })),
        },
      });
      toast.success("Signature blocks saved.");
      void meta.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save those blocks.");
    } finally {
      setSaving(false);
    }
  };

  if (meta.isLoading) {
    return <p className="text-sm text-muted-foreground">Opening the document…</p>;
  }
  if (meta.error) {
    return (
      <p className="text-sm text-muted-foreground">
        {meta.error instanceof Error ? meta.error.message : "That document is unavailable."}
      </p>
    );
  }
  if (!meta.data?.hasFile) {
    return (
      <p className="text-sm text-muted-foreground">
        Upload a PDF for this document first. Signature blocks can only be placed on a PDF —
        Word files are still accepted, and investors sign those with the standard signature page.
      </p>
    );
  }

  const canEdit = Boolean(meta.data.canEdit);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border p-3">
        <div className="grid gap-2">
          <Label>Block to place</Label>
          <Select value={tool} onValueChange={(v) => setTool(v as SignatureBlockType)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOCK_TYPES.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Signer</Label>
          <Select value={role} onValueChange={(v) => setRole(v as "investor" | "fund_manager")}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="investor">Investor</SelectItem>
              <SelectItem value="fund_manager">Fund Manager</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Click a page to place it, then drag it into place. Investor fields are teal, Fund Manager fields are navy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {blocks.length} block{blocks.length === 1 ? "" : "s"} on{" "}
            {new Set(blocks.map((b) => b.page_number)).size} page
            {new Set(blocks.map((b) => b.page_number)).size === 1 ? "" : "s"}
          </Badge>
          {canEdit && (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save blocks"}
            </Button>
          )}
          {onClose && (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          You can see where investors sign, but only this fund&apos;s managers and Harmonious can
          move the blocks.
        </p>
      )}

      {rendering && <p className="text-sm text-muted-foreground">Preparing the pages…</p>}
      {renderError && <p className="text-sm text-muted-foreground">{renderError}</p>}

      <div className="space-y-6">
        {pages.map((page) => (
          <div key={page.number} className="space-y-1">
            <p className="text-xs text-muted-foreground">Page {page.number}</p>
            <div
              className="relative w-full select-none overflow-hidden rounded-md border"
              style={{ paddingTop: `${page.ratio * 100}%` }}
              onPointerMove={(e) => {
                const drag = dragRef.current;
                if (!drag) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - drag.dx;
                const y = (e.clientY - rect.top) / rect.height - drag.dy;
                setBlocks((prev) =>
                  prev.map((b) =>
                    b.key === drag.key
                      ? {
                          ...b,
                          x: Math.max(0, Math.min(1 - b.width, x)),
                          y: Math.max(0, Math.min(1 - b.height, y)),
                        }
                      : b,
                  ),
                );
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              onClick={(e) => {
                if (!canEdit || dragRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                addBlock(
                  page.number,
                  (e.clientX - rect.left) / rect.width,
                  (e.clientY - rect.top) / rect.height,
                );
              }}
            >
              <img
                src={page.dataUrl}
                alt={`Page ${page.number} of the fund document`}
                className="absolute inset-0 h-full w-full"
                draggable={false}
              />
              {blocks
                .filter((b) => b.page_number === page.number)
                .map((b) => (
                  <div
                    key={b.key}
                    className={`absolute flex items-center justify-between gap-1 rounded border-2 px-1 text-[10px] ${b.signer_role === "fund_manager" ? "border-primary/80 bg-primary/15 text-primary" : "border-accent bg-accent/20 text-accent-foreground"}`}
                    style={{
                      left: `${b.x * 100}%`,
                      top: `${b.y * 100}%`,
                      width: `${b.width * 100}%`,
                      height: `${b.height * 100}%`,
                      cursor: canEdit ? "move" : "default",
                    }}
                    onPointerDown={(e) => {
                      if (!canEdit) return;
                      e.stopPropagation();
                      const rect = (
                        e.currentTarget.parentElement as HTMLElement
                      ).getBoundingClientRect();
                      dragRef.current = {
                        key: b.key,
                        dx: (e.clientX - rect.left) / rect.width - b.x,
                        dy: (e.clientY - rect.top) / rect.height - b.y,
                      };
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="truncate">
                      {b.signer_role === "fund_manager" ? "FM · " : "Inv · "}
                      {typeLabel(b.block_type)}
                      {b.required ? "" : " (optional)"}
                    </span>
                    {canEdit && (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="underline"
                          onClick={() =>
                            setBlocks((prev) =>
                              prev.map((p) =>
                                p.key === b.key ? { ...p, required: !p.required } : p,
                              ),
                            )
                          }
                        >
                          {b.required ? "req" : "opt"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBlocks((prev) => prev.filter((p) => p.key !== b.key))
                          }
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
