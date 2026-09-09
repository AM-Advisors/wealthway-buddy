import { useState } from "react";

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  DILIGENCE_CATEGORIES,
  addDiligenceDocument,
  ensureDiligenceRoom,
  getDiligenceDownloadUrl,
  getDiligenceRoom,
  removeDiligenceDocument,
  syncDiligenceFolder,
} from "@/lib/diligence.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/diligence/$offeringId")({
  head: () => ({
    meta: [
      { title: "Fund Due Diligence Room — Harmonious" },
      {
        name: "description",
        content:
          "Formation documents, financials, track record, team materials and offering terms for a Harmonious fund, with a live readiness score.",
      },
      { property: "og:title", content: "Fund Due Diligence Room — Harmonious" },
      {
        property: "og:description",
        content: "Secure fund diligence materials with a live readiness score.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiligenceRoomPage,
});

function label(category: string) {
  return DILIGENCE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

function fileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function DiligenceRoomPage() {
  const { offeringId } = useParams({ from: "/_authenticated/diligence/$offeringId" });
  const queryClient = useQueryClient();

  const load = useServerFn(getDiligenceRoom);
  const ensure = useServerFn(ensureDiligenceRoom);
  const add = useServerFn(addDiligenceDocument);
  const remove = useServerFn(removeDiligenceDocument);
  const download = useServerFn(getDiligenceDownloadUrl);
  const sync = useServerFn(syncDiligenceFolder);

  const { data, isLoading } = useQuery({
    queryKey: ["diligence-room", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
  });

  const [category, setCategory] = useState<string>(DILIGENCE_CATEGORIES[0].value);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["diligence-room", offeringId] });
    queryClient.invalidateQueries({ queryKey: ["diligence-rooms"] });
  }

  const openMutation = useMutation({
    mutationFn: () => ensure({ data: { offering_id: offeringId } }),
    onSuccess: () => {
      toast.success("Diligence room is open.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open the room."),
  });

  const syncMutation = useMutation({
    mutationFn: () => sync({ data: { offering_id: offeringId } }),
    onSuccess: (res: any) => {
      toast.success(
        res.added > 0
          ? `${res.added} file${res.added === 1 ? "" : "s"} pulled in from Box`
          : "Everything in Box is already listed",
      );
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not check Box."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that document."),
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => download({ data: { id } }),
    onSuccess: (res: any) => window.open(res.url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e?.message ?? "Could not open that document."),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Files must be 20 MB or smaller.");
      e.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const content = await toBase64(file);
      await add({
        data: {
          offering_id: offeringId,
          category: category as never,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          description,
          file_name: file.name,
          content_type: file.type || "application/octet-stream",
          content_base64: content,
        },
      });
      setTitle("");
      setDescription("");
      toast.success("Document added to Box and the investor view.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading room…</div>;
  }

  const room = (data as any)?.room ?? null;
  const offering = (data as any)?.offering;
  const documents = ((data as any)?.documents ?? []) as any[];
  const readiness = (data as any)?.readiness;
  const canManage = Boolean((data as any)?.canManage);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl">{offering?.name} — due diligence</h1>
      {offering?.summary ? <p className="mt-2 text-muted-foreground">{offering.summary}</p> : null}

      {!room ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>No diligence room yet</CardTitle>
            <CardDescription>
              {canManage
                ? "Open a room to create this fund's Box folder and start adding materials."
                : "Your fund team hasn't opened this room yet. Check back shortly."}
            </CardDescription>
          </CardHeader>
          {canManage ? (
            <CardContent>
              <Button disabled={openMutation.isPending} onClick={() => openMutation.mutate()}>
                {openMutation.isPending ? "Opening…" : "Open diligence room"}
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <>
          <Card className="mt-8">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Readiness</CardTitle>
                  <CardDescription>
                    {readiness.missing.length === 0
                      ? "Every core diligence category has materials on file."
                      : `Still to add: ${readiness.missing.map((m: any) => m.label).join(", ")}`}
                  </CardDescription>
                </div>
                <Badge variant={readiness.score === 100 ? "default" : "secondary"}>
                  {readiness.score}% complete
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={readiness.score} />
            </CardContent>
          </Card>

          {canManage ? (
            <Card className="mt-6">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Add a document</CardTitle>
                    <CardDescription>
                      Files are stored in this fund's Box folder and appear for investors right away.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={syncMutation.isPending}
                    onClick={() => syncMutation.mutate()}
                  >
                    {syncMutation.isPending ? "Checking…" : "Pull in files from Box"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dd-category">Category</Label>
                  <select
                    id="dd-category"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {DILIGENCE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                        {c.required ? " (core)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dd-title">Title</Label>
                  <Input
                    id="dd-title"
                    value={title}
                    maxLength={200}
                    placeholder="Defaults to the file name"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="dd-description">Description (optional)</Label>
                  <Textarea
                    id="dd-description"
                    value={description}
                    maxLength={1000}
                    rows={2}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="dd-file">File</Label>
                  <Input id="dd-file" type="file" disabled={busy} onChange={onFile} />
                  <p className="text-xs text-muted-foreground">Up to 20 MB per file.</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="mt-6 space-y-6">
            {DILIGENCE_CATEGORIES.map((cat) => {
              const items = documents.filter((d) => d.category === cat.value);
              if (items.length === 0 && !cat.required) return null;
              return (
                <Card key={cat.value}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-lg">{cat.label}</CardTitle>
                      {items.length === 0 ? <Badge variant="outline">Pending</Badge> : null}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing filed here yet.</p>
                    ) : (
                      <ul className="divide-y rounded-md border">
                        {items.map((doc) => (
                          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{doc.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {doc.file_name}
                                {doc.size_bytes ? ` · ${fileSize(doc.size_bytes)}` : ""} ·{" "}
                                {new Date(doc.uploaded_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
                                {doc.description ? ` · ${doc.description}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={downloadMutation.isPending}
                                onClick={() => downloadMutation.mutate(doc.id)}
                              >
                                Open
                              </Button>
                              {canManage ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={removeMutation.isPending}
                                  onClick={() => removeMutation.mutate(doc.id)}
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Document links expire after a few minutes for your security.{" "}
        <Link to="/diligence" className="underline">
          All diligence rooms
        </Link>
      </p>
    </div>
  );
}

function _unused(_: string) {
  return label(_);
}
