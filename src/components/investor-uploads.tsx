import { useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  UPLOAD_KINDS,
  deleteMyUpload,
  fileUploadToBox,
  getMyUploadUrl,
  listMyUploads,
  recordMyUpload,
  type InvestorUploadRow,
} from "@/lib/investor-uploads.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function kindLabel(value: string) {
  return UPLOAD_KINDS.find((k) => k.value === value)?.label ?? value.replace(/_/g, " ");
}

/**
 * When `fundId` is given the card only shows — and only files — paperwork for
 * that fund. Without it the person picks the fund themselves.
 */
export function InvestorUploads({ fundId }: { fundId?: string | null } = {}) {
  const queryClient = useQueryClient();
  const list = useServerFn(listMyUploads);
  const record = useServerFn(recordMyUpload);
  const openUrl = useServerFn(getMyUploadUrl);
  const remove = useServerFn(deleteMyUpload);
  const fileToBox = useServerFn(fileUploadToBox);

  const [kind, setKind] = useState<string>(UPLOAD_KINDS[0].value);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chosenFund, setChosenFund] = useState<string>("");

  const queryKey = ["investor-uploads", fundId ?? "all"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => list({ data: { fundId: fundId ?? null } }),
  });

  const uploads: InvestorUploadRow[] = (data as any)?.uploads ?? [];
  const funds: { id: string; name: string }[] = (data as any)?.funds ?? [];
  const targetFund = fundId ?? (chosenFund || funds[0]?.id) ?? null;

  const openMutation = useMutation({
    mutationFn: (id: string) => openUrl({ data: { id } }),
    onSuccess: (res: any) => window.open(res.url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e?.message ?? "Could not open that file."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("File removed.");
      queryClient.invalidateQueries({ queryKey: ["investor-uploads"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that file."),
  });

  const boxMutation = useMutation({
    mutationFn: (id: string) => fileToBox({ data: { id } }),
    onSuccess: () => {
      toast.success("Filed in the shared folder.");
      queryClient.invalidateQueries({ queryKey: ["investor-uploads"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not file that document."),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be 25 MB or smaller.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Your session expired. Please sign in again.");
      const path = `${uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("investor-uploads").upload(path, file);
      if (error) throw new Error(error.message);
      await record({
        data: {
          storage_path: path,
          file_name: file.name,
          doc_kind: kind as never,
          note,
          offering_id: targetFund,
        },
      });
      setNote("");
      toast.success("Document uploaded.");
      queryClient.invalidateQueries({ queryKey: ["investor-uploads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Your uploads</CardTitle>
        <CardDescription>
          Add any supporting paperwork your fund team asked for. Only you, the fund administrators and your fund's
          managers can see these files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="upload-kind">Document type</Label>
            <select
              id="upload-kind"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {UPLOAD_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-note">Note (optional)</Label>
            <Input
              id="upload-note"
              value={note}
              maxLength={500}
              placeholder="Anything we should know"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-file">Choose file</Label>
            <Input id="upload-file" type="file" disabled={uploading} onChange={onFile} />
            <p className="text-xs text-muted-foreground">PDF, image or document up to 25 MB.</p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your files…</p>
        ) : uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven't uploaded anything yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {uploads.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(u.uploaded_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    {u.note ? ` · ${u.note}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {u.box_uploaded_at
                      ? `Filed in the shared folder ${new Date(u.box_uploaded_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
                      : u.box_error
                        ? "Not filed in the shared folder yet"
                        : "Filing in the shared folder…"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{kindLabel(u.doc_kind)}</Badge>
                  {u.box_uploaded_at ? (
                    <Badge variant="outline">In shared folder</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={boxMutation.isPending}
                      onClick={() => boxMutation.mutate(u.id)}
                    >
                      File it
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={openMutation.isPending}
                    onClick={() => openMutation.mutate(u.id)}
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(u.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
