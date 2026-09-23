import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  confirmGovernmentIdUpload,
  getMyGovernmentId,
  startGovernmentIdUpload,
} from "@/lib/government-id.functions";
import { ID_SIDE_LABELS, isAllowedIdFile, requiredSides, type IdSide } from "@/lib/government-id";

export const GOVERNMENT_ID_QUERY = ["government-id"] as const;

export function useGovernmentId() {
  const load = useServerFn(getMyGovernmentId);
  return useQuery({ queryKey: GOVERNMENT_ID_QUERY, queryFn: () => load() });
}

export function GovernmentIdUpload({ documentType, error }: { documentType: string; error?: string | undefined }) {
  const { data } = useGovernmentId();
  const sides = requiredSides(documentType);

  return (
    <div className="space-y-3 sm:col-span-2">
      <div>
        <p className="text-sm font-medium">Government ID</p>
        <p className="text-xs text-muted-foreground">
          Upload a clear copy of the government-issued ID entered above.
        </p>
      </div>
      {data?.providedByVerification ? (
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" /> ID provided
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sides.map((side) => (
            <SideSlot
              key={side}
              side={side}
              documentType={documentType}
              current={data?.uploads.find((u) => u.side === side && u.documentType === documentType)}
            />
          ))}
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SideSlot({
  side,
  documentType,
  current,
}: {
  side: IdSide;
  documentType: string;
  current?: { id: string; fileName: string } | undefined;
}) {
  const start = useServerFn(startGovernmentIdUpload);
  const confirm = useServerFn(confirmGovernmentIdUpload);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const inputId = `gov-id-${side}`;

  async function onFile(file: File) {
    const bad = isAllowedIdFile(file.type, file.size, file.name);
    if (bad) return toast.error(bad);
    setBusy(true);
    try {
      const ticket = await start({
        data: { side, documentType: documentType as any, fileName: file.name, mimeType: file.type, size: file.size },
      });
      const { error } = await supabase.storage
        .from("government-ids")
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (error) throw new Error("The upload didn't go through. Please try again.");
      const res = await confirm({ data: { id: ticket.id } });
      toast.success(
        res.reReview
          ? "ID replaced. Your identity check will be reviewed again."
          : current
            ? "ID replaced."
            : "ID uploaded.",
      );
      await qc.invalidateQueries({ queryKey: GOVERNMENT_ID_QUERY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{ID_SIDE_LABELS[side]}</p>
        <span className="text-xs text-muted-foreground">Required</span>
      </div>
      {current ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="truncate">ID provided</span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Driver's license, passport, state/national ID · PDF, JPG, JPEG or PNG
        </p>
      )}
      <input
        id={inputId}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" className="mt-3" disabled={busy} asChild>
        <label htmlFor={inputId} className="cursor-pointer">
          <Upload className="mr-2 h-4 w-4" />
          {busy ? "Uploading…" : current ? "Replace ID" : "Upload ID"}
        </label>
      </Button>
    </div>
  );
}
