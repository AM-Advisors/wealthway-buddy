import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  OFFERING_FILES_BUCKET,
  attachOfferingDocumentFile,
  getOfferingDocumentFileUrl,
  removeOfferingDocumentFile,
} from "@/lib/offering-files.functions";

const MAX_BYTES = 50 * 1024 * 1024;

function prettySize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  documentId: string;
  offeringId: string;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  canEdit?: boolean;
  onChanged?: () => void;
};

export function OfferingDocumentFile({
  documentId,
  offeringId,
  fileName,
  fileSizeBytes,
  canEdit = false,
  onChanged,
}: Props) {
  const attach = useServerFn(attachOfferingDocumentFile);
  const drop = useServerFn(removeOfferingDocumentFile);
  const link = useServerFn(getOfferingDocumentFileUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "download" | "remove" | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("That file is larger than 50 MB.");
      return;
    }
    setBusy("upload");
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
      const path = `${offeringId}/${documentId}-${Date.now()}-${safe}`;
      const { error } = await supabase.storage
        .from(OFFERING_FILES_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw new Error(error.message);
      await attach({
        data: { documentId, filePath: path, fileName: file.name.slice(0, 200), fileSizeBytes: file.size },
      });
      toast.success("File uploaded.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const download = async () => {
    setBusy("download");
    try {
      const res = (await link({ data: { documentId } })) as { url: string };
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that file.");
    } finally {
      setBusy(null);
    }
  };

  const removeFile = async () => {
    setBusy("remove");
    try {
      await drop({ data: { documentId } });
      toast.success("File removed.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that file.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-transparent"
      }`}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void upload(file);
      }}
    >
      {fileName ? (
        <>
          <span className="text-muted-foreground">
            Attached: {fileName}
            {fileSizeBytes ? ` · ${prettySize(fileSizeBytes)}` : ""}
          </span>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={download}>
            {busy === "download" ? "Opening…" : "Open file"}
          </Button>
          {canEdit && (
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={removeFile}>
              {busy === "remove" ? "Removing…" : "Remove file"}
            </Button>
          )}
        </>
      ) : (
        canEdit && (
          <span className="text-muted-foreground">
            No file uploaded yet. Drag a PDF or Word file here, or browse.
          </span>
        )
      )}
      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === "upload" ? "Uploading…" : fileName ? "Replace file" : "Upload file"}
          </Button>
        </>
      )}
    </div>
  );
}
