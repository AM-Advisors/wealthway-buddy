import { useEffect, useRef, useState } from "react";

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  DILIGENCE_CATEGORIES,
  acceptDiligenceNda,
  addDiligenceDocument,
  addDocumentVersion,
  askDiligenceQuestion,
  ensureDiligenceRoom,
  getDiligenceAccess,
  getDiligenceDownloadUrl,
  getDiligenceRoom,
  getVersionDownloadUrl,
  getDiligenceEngagement,
  listDiligenceActivity,
  listDiligenceChecklist,
  recordRoomVisit,
  listDiligenceQuestions,
  listDocumentVersions,
  removeChecklistItem,
  removeDiligenceDocument,
  replyToDiligenceQuestion,
  saveChecklistItem,
  seedDiligenceChecklist,
  syncDiligenceFolder,
  updateDiligenceNda,
  updateDiligenceQuestion,
} from "@/lib/diligence.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/diligence/$offeringId")({
  head: () => ({
    meta: [
      { title: "Fund Due Diligence Room — Harmonious" },
      {
        name: "description",
        content:
          "Confidential fund diligence: documents with version history, a diligence checklist, investor questions and a full activity trail.",
      },
      { property: "og:title", content: "Fund Due Diligence Room — Harmonious" },
      {
        property: "og:description",
        content: "Confidential fund diligence materials, checklist, Q&A and activity trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiligenceRoomPage,
});

function fileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function when(value: string) {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
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

  const loadRoom = useServerFn(getDiligenceRoom);
  const loadAccess = useServerFn(getDiligenceAccess);
  const ensure = useServerFn(ensureDiligenceRoom);
  const acceptNda = useServerFn(acceptDiligenceNda);

  const access = useQuery({
    queryKey: ["diligence-access", offeringId],
    queryFn: () => loadAccess({ data: { offering_id: offeringId } }),
  });

  const gated =
    Boolean((access.data as any)?.ndaRequired) &&
    !(access.data as any)?.accepted &&
    !(access.data as any)?.canManage;

  const room = useQuery({
    queryKey: ["diligence-room", offeringId],
    queryFn: () => loadRoom({ data: { offering_id: offeringId } }),
    enabled: access.isSuccess && !gated,
  });

  const [signer, setSigner] = useState("");

  // Record that this person actually opened the room (once per page visit; the
  // server keeps at most one entry per 30 minutes).
  const visit = useServerFn(recordRoomVisit);
  const visitLogged = useRef(false);
  useEffect(() => {
    if (visitLogged.current || gated || !access.isSuccess) return;
    visitLogged.current = true;
    void visit({ data: { offering_id: offeringId } }).catch(() => {});
  }, [access.isSuccess, gated, offeringId, visit]);

  const acceptMutation = useMutation({
    mutationFn: () => acceptNda({ data: { offering_id: offeringId, signer_name: signer.trim() } }),
    onSuccess: () => {
      toast.success("Thank you — the diligence materials are now open to you.");
      queryClient.invalidateQueries({ queryKey: ["diligence-access", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record your acceptance."),
  });

  const openRoomMutation = useMutation({
    mutationFn: () => ensure({ data: { offering_id: offeringId } }),
    onSuccess: () => {
      toast.success("Diligence room is open.");
      queryClient.invalidateQueries({ queryKey: ["diligence-room", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["diligence-access", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["diligence-rooms"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open the room."),
  });

  if (access.isLoading) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading room…</div>;
  }

  const a = access.data as any;
  const canManage = Boolean(a?.canManage);

  // No room yet.
  if (!a?.room) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>No diligence room yet</CardTitle>
            <CardDescription>
              {canManage
                ? "Open a room to create this fund's secure folder and start adding materials."
                : "Your fund team hasn't opened this room yet. Check back shortly."}
            </CardDescription>
          </CardHeader>
          {canManage ? (
            <CardContent>
              <Button disabled={openRoomMutation.isPending} onClick={() => openRoomMutation.mutate()}>
                {openRoomMutation.isPending ? "Opening…" : "Open diligence room"}
              </Button>
            </CardContent>
          ) : null}
        </Card>
      </div>
    );
  }

  // NDA gate.
  if (gated) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-3xl">Confidentiality agreement</h1>
        <p className="mt-2 text-muted-foreground">
          Please read and accept before the fund's diligence materials are shown.
        </p>
        <Card className="mt-6">
          <CardContent className="pt-6">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
              {a.ndaText}
            </pre>
            <div className="mt-6 space-y-2">
              <Label htmlFor="nda-name">Type your full legal name to accept</Label>
              <Input
                id="nda-name"
                value={signer}
                maxLength={160}
                placeholder="Jane Q. Investor"
                onChange={(e) => setSigner(e.target.value)}
              />
            </div>
            <Button
              className="mt-4"
              disabled={signer.trim().length < 2 || acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
            >
              {acceptMutation.isPending ? "Recording…" : "I agree — open the room"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Your name, the date and time and your network address are recorded with this acceptance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (room.isLoading) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading room…</div>;
  }

  const data = room.data as any;
  const offering = data?.offering;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-3xl">{offering?.name} — due diligence</h1>
      {offering?.summary ? <p className="mt-2 text-muted-foreground">{offering.summary}</p> : null}
      {a.accepted ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Confidentiality agreement accepted {a.acceptedAt ? when(a.acceptedAt) : ""}.
        </p>
      ) : null}

      <Tabs defaultValue="documents" className="mt-8">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          {canManage ? <TabsTrigger value="engagement">Who's viewing</TabsTrigger> : null}
          {canManage ? <TabsTrigger value="settings">Agreement</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="documents" className="mt-6">
          <DocumentsTab offeringId={offeringId} data={data} canManage={canManage} />
        </TabsContent>
        <TabsContent value="checklist" className="mt-6">
          <ChecklistTab offeringId={offeringId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="questions" className="mt-6">
          <QuestionsTab offeringId={offeringId} />
        </TabsContent>
        <TabsContent value="activity" className="mt-6">
          <ActivityTab offeringId={offeringId} />
        </TabsContent>
        {canManage ? (
          <TabsContent value="engagement" className="mt-6">
            <EngagementTab offeringId={offeringId} />
          </TabsContent>
        ) : null}
        {canManage ? (
          <TabsContent value="settings" className="mt-6">
            <NdaSettings offeringId={offeringId} access={a} />
          </TabsContent>
        ) : null}
      </Tabs>

      <p className="mt-8 text-xs text-muted-foreground">
        Document links expire after a few minutes for your security.{" "}
        <Link to="/diligence" className="underline">
          All diligence rooms
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------ Documents ------------------------------ */

function DocumentsTab({
  offeringId,
  data,
  canManage,
}: {
  offeringId: string;
  data: any;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const add = useServerFn(addDiligenceDocument);
  const remove = useServerFn(removeDiligenceDocument);
  const download = useServerFn(getDiligenceDownloadUrl);
  const sync = useServerFn(syncDiligenceFolder);

  const [category, setCategory] = useState<string>(DILIGENCE_CATEGORIES[0].value);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const documents = (data?.documents ?? []) as any[];
  const readiness = data?.readiness;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["diligence-room", offeringId] });
    queryClient.invalidateQueries({ queryKey: ["diligence-rooms"] });
    queryClient.invalidateQueries({ queryKey: ["diligence-activity", offeringId] });
  }

  const syncMutation = useMutation({
    mutationFn: () => sync({ data: { offering_id: offeringId } }),
    onSuccess: (res: any) => {
      toast.success(res.added > 0 ? `${res.added} file(s) pulled in` : "Everything is already listed");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not check the folder."),
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
      toast.success("Document added.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Readiness</CardTitle>
              <CardDescription>
                {readiness?.missing?.length === 0
                  ? "Every core diligence category has materials on file."
                  : `Still to add: ${(readiness?.missing ?? []).map((m: any) => m.label).join(", ")}`}
              </CardDescription>
            </div>
            <Badge variant={readiness?.score === 100 ? "default" : "secondary"}>
              {readiness?.score ?? 0}% complete
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={readiness?.score ?? 0} />
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Add a document</CardTitle>
                <CardDescription>Stored securely and visible to investors right away.</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                {syncMutation.isPending ? "Checking…" : "Pull in files from the folder"}
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
                    <li key={doc.id} className="p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {doc.title}{" "}
                            {doc.version > 1 ? (
                              <Badge variant="secondary" className="ml-1">
                                v{doc.version}
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.file_name}
                            {doc.size_bytes ? ` · ${fileSize(doc.size_bytes)}` : ""} · {when(doc.uploaded_at)}
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setOpenHistory(openHistory === doc.id ? null : doc.id)}
                          >
                            {openHistory === doc.id ? "Hide history" : "History"}
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
                      </div>
                      {openHistory === doc.id ? (
                        <VersionHistory documentId={doc.id} offeringId={offeringId} canManage={canManage} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VersionHistory({
  documentId,
  offeringId,
  canManage,
}: {
  documentId: string;
  offeringId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const list = useServerFn(listDocumentVersions);
  const addVersion = useServerFn(addDocumentVersion);
  const downloadVersion = useServerFn(getVersionDownloadUrl);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["diligence-versions", documentId],
    queryFn: () => list({ data: { document_id: documentId } }),
  });
  const versions = ((data as any)?.versions ?? []) as any[];

  const downloadMutation = useMutation({
    mutationFn: (id: string) => downloadVersion({ data: { id } }),
    onSuccess: (res: any) => window.open(res.url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e?.message ?? "Could not open that version."),
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
      const res: any = await addVersion({
        data: {
          document_id: documentId,
          file_name: file.name,
          content_type: file.type || "application/octet-stream",
          content_base64: content,
          note,
        },
      });
      setNote("");
      toast.success(`Version ${res.version} uploaded.`);
      queryClient.invalidateQueries({ queryKey: ["diligence-versions", documentId] });
      queryClient.invalidateQueries({ queryKey: ["diligence-room", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["diligence-activity", offeringId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version history</p>
      {versions.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Only the original version has been filed so far.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                Version {v.version} · {when(v.uploaded_at)}
                {v.note ? ` · ${v.note}` : ""}
              </span>
              <Button size="sm" variant="ghost" onClick={() => downloadMutation.mutate(v.id)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="What changed? (optional)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
          <Input type="file" disabled={busy} onChange={onFile} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Checklist ------------------------------ */

function ChecklistTab({ offeringId, canManage }: { offeringId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listDiligenceChecklist);
  const save = useServerFn(saveChecklistItem);
  const drop = useServerFn(removeChecklistItem);
  const seed = useServerFn(seedDiligenceChecklist);

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>(DILIGENCE_CATEGORIES[0].value);
  const [required, setRequired] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["diligence-checklist", offeringId],
    queryFn: () => list({ data: { offering_id: offeringId } }),
  });
  const items = ((data as any)?.items ?? []) as any[];

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["diligence-checklist", offeringId] });
    queryClient.invalidateQueries({ queryKey: ["diligence-activity", offeringId] });
  }

  const saveMutation = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e?.message ?? "Could not save that item."),
  });
  const dropMutation = useMutation({
    mutationFn: (id: string) => drop({ data: { id } }),
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that item."),
  });
  const seedMutation = useMutation({
    mutationFn: () => seed({ data: { offering_id: offeringId } }),
    onSuccess: (res: any) => {
      toast.success(res.added > 0 ? `${res.added} items added` : "Starter items already exist");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not build the checklist."),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Diligence checklist</CardTitle>
              <CardDescription>What still needs to be provided for this fund.</CardDescription>
            </div>
            <Badge variant={(data as any)?.progress === 100 ? "default" : "secondary"}>
              {(data as any)?.progress ?? 0}% done
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(data as any)?.progress ?? 0} />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No checklist yet.</p>
              {canManage ? (
                <Button size="sm" disabled={seedMutation.isPending} onClick={() => seedMutation.mutate()}>
                  {seedMutation.isPending ? "Building…" : "Build a starter checklist"}
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="flex items-start gap-3">
                    {canManage ? (
                      <Checkbox
                        checked={item.status === "complete"}
                        onCheckedChange={(checked) =>
                          saveMutation.mutate({
                            id: item.id,
                            offering_id: offeringId,
                            category: item.category,
                            label: item.label,
                            description: item.description,
                            is_required: item.is_required,
                            status: checked ? "complete" : "pending",
                          })
                        }
                      />
                    ) : null}
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.is_required ? "Required" : "Optional"}
                        {item.completed_at ? ` · completed ${when(item.completed_at)}` : ""}
                        {item.description ? ` · ${item.description}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        item.status === "complete" || item.status === "waived" ? "default" : "outline"
                      }
                    >
                      {item.status === "in_progress" ? "In progress" : item.status}
                    </Badge>
                    {canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => dropMutation.mutate(item.id)}>
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

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add an item</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cl-label">What's needed</Label>
              <Input
                id="cl-label"
                value={label}
                maxLength={200}
                placeholder="Audited financials, 2024"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cl-category">Category</Label>
              <select
                id="cl-category"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {DILIGENCE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-3">
              <Checkbox
                id="cl-required"
                checked={required}
                onCheckedChange={(v) => setRequired(Boolean(v))}
              />
              <Label htmlFor="cl-required">Required for this fund</Label>
            </div>
            <div className="sm:col-span-3">
              <Button
                size="sm"
                disabled={label.trim().length < 2 || saveMutation.isPending}
                onClick={() =>
                  saveMutation.mutate(
                    {
                      offering_id: offeringId,
                      category,
                      label: label.trim(),
                      is_required: required,
                      status: "pending",
                    },
                    { onSuccess: () => setLabel("") },
                  )
                }
              >
                Add to checklist
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/* ------------------------------ Questions ------------------------------ */

function QuestionsTab({ offeringId }: { offeringId: string }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listDiligenceQuestions);
  const ask = useServerFn(askDiligenceQuestion);
  const reply = useServerFn(replyToDiligenceQuestion);
  const update = useServerFn(updateDiligenceQuestion);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["diligence-questions", offeringId],
    queryFn: () => list({ data: { offering_id: offeringId } }),
  });
  const questions = ((data as any)?.questions ?? []) as any[];
  const canManage = Boolean((data as any)?.canManage);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["diligence-questions", offeringId] });
    queryClient.invalidateQueries({ queryKey: ["diligence-activity", offeringId] });
  }

  const askMutation = useMutation({
    mutationFn: () =>
      ask({ data: { offering_id: offeringId, subject: subject.trim(), body: body.trim() } }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      toast.success("Question sent to the fund team.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send that question."),
  });

  const replyMutation = useMutation({
    mutationFn: (vars: { id: string; text: string }) =>
      reply({ data: { question_id: vars.id, body: vars.text } }),
    onSuccess: (_res, vars) => {
      setReplies((r) => ({ ...r, [vars.id]: "" }));
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not post that reply."),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: any) => update({ data: payload }),
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e?.message ?? "Could not update that question."),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ask the fund team</CardTitle>
          <CardDescription>
            Questions go to the fund's managers. Answers appear here, and can be shared with other
            investors when they're useful to everyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Subject"
            value={subject}
            maxLength={200}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Textarea
            placeholder="Your question"
            rows={3}
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button
            size="sm"
            disabled={subject.trim().length < 3 || body.trim().length < 3 || askMutation.isPending}
            onClick={() => askMutation.mutate()}
          >
            {askMutation.isPending ? "Sending…" : "Send question"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading questions…</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : (
        questions.map((q) => (
          <Card key={q.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{q.subject}</CardTitle>
                  <CardDescription>
                    {q.asker_name ? `${q.asker_name} · ` : ""}
                    {when(q.created_at)}
                    {q.is_published ? " · shared with all investors" : ""}
                  </CardDescription>
                </div>
                <Badge variant={q.status === "open" ? "outline" : "default"}>{q.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm">{q.body}</p>
              {q.messages.map((m: any) => (
                <div key={m.id} className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    {m.from_reviewer ? "Fund team" : (m.author_name ?? "Investor")} · {when(m.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                </div>
              ))}
              <div className="space-y-2">
                <Textarea
                  rows={2}
                  placeholder="Write a reply"
                  value={replies[q.id] ?? ""}
                  maxLength={5000}
                  onChange={(e) => setReplies((r) => ({ ...r, [q.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={(replies[q.id] ?? "").trim().length === 0 || replyMutation.isPending}
                    onClick={() => replyMutation.mutate({ id: q.id, text: (replies[q.id] ?? "").trim() })}
                  >
                    Reply
                  </Button>
                  {canManage ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateMutation.mutate({ question_id: q.id, is_published: !q.is_published })
                        }
                      >
                        {q.is_published ? "Unshare" : "Share with all investors"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateMutation.mutate({
                            question_id: q.id,
                            status: q.status === "closed" ? "open" : "closed",
                          })
                        }
                      >
                        {q.status === "closed" ? "Reopen" : "Close"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

/* ------------------------------- Activity ------------------------------ */

function ActivityTab({ offeringId }: { offeringId: string }) {
  const list = useServerFn(listDiligenceActivity);
  const { data, isLoading } = useQuery({
    queryKey: ["diligence-activity", offeringId],
    queryFn: () => list({ data: { offering_id: offeringId, limit: 100 } }),
  });
  const events = ((data as any)?.events ?? []) as any[];
  const canManage = Boolean((data as any)?.canManage);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity trail</CardTitle>
        <CardDescription>
          {canManage
            ? "Every action taken in this room, in order, kept permanently."
            : "A record of your own activity in this room."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {events.map((e) => (
              <li key={e.id} className="p-3">
                <p className="text-sm">{e.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {e.actor_name || e.actor_email || "Someone"} · {when(e.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------- Who's viewing (engagement) ------------------ */

function EngagementTab({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getDiligenceEngagement);
  const { data, isLoading } = useQuery({
    queryKey: ["diligence-engagement", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
    refetchInterval: 60_000,
  });

  const viewers = ((data as any)?.viewers ?? []) as any[];
  const neverOpened = ((data as any)?.neverOpened ?? []) as any[];
  const totalDocuments = Number((data as any)?.totalDocuments ?? 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Who's opening this room</CardTitle>
          <CardDescription>
            Real activity inside the room — when each person came in and which documents they
            actually opened. Repeat visits within 30 minutes count once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : viewers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has opened the room yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {viewers.map((v) => (
                <li key={v.actor_id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{v.name || v.email || "Someone"}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.email && v.name ? `${v.email} · ` : ""}
                        {v.visits} visit{v.visits === 1 ? "" : "s"} · last active {when(v.lastSeen)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {v.documents.length} of {totalDocuments} documents opened
                      </Badge>
                      {v.ndaAcceptedAt ? (
                        <Badge variant="outline">Agreement signed</Badge>
                      ) : null}
                      {v.questionsAsked > 0 ? (
                        <Badge variant="outline">
                          {v.questionsAsked} question{v.questionsAsked === 1 ? "" : "s"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {v.documents.length > 0 ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {v.documents.map((d: any) => (
                        <li key={d.id}>
                          {d.title} — opened {d.opens} time{d.opens === 1 ? "" : "s"}, last{" "}
                          {when(d.lastOpened)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Came into the room but has not opened a document yet.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Has access, never opened it</CardTitle>
          <CardDescription>
            People who can reach this room but have not been in yet — worth a nudge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : neverOpened.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Everyone with access has been in at least once.
            </p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {neverOpened.map((p) => (
                <li key={p.user_id} className="p-3">
                  {p.name || p.email || "Investor"}
                  {p.name && p.email ? (
                    <span className="text-xs text-muted-foreground"> · {p.email}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------- NDA settings ----------------------------- */

function NdaSettings({ offeringId, access }: { offeringId: string; access: any }) {
  const queryClient = useQueryClient();
  const update = useServerFn(updateDiligenceNda);
  const [required, setRequired] = useState<boolean>(Boolean(access.ndaRequired));
  const [text, setText] = useState<string>(access.ndaText ?? "");
  const [bump, setBump] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      update({
        data: { offering_id: offeringId, nda_required: required, nda_text: text, bump_version: bump },
      }),
    onSuccess: () => {
      toast.success("Agreement saved.");
      setBump(false);
      queryClient.invalidateQueries({ queryKey: ["diligence-access", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["diligence-activity", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the agreement."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confidentiality agreement</CardTitle>
        <CardDescription>
          Investors must accept this before they can see any of this fund's materials. Currently
          version {access.ndaVersion}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="nda-required"
            checked={required}
            onCheckedChange={(v) => setRequired(Boolean(v))}
          />
          <Label htmlFor="nda-required">Require acceptance before documents are shown</Label>
        </div>
        <Textarea rows={12} value={text} maxLength={20000} onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center gap-2">
          <Checkbox id="nda-bump" checked={bump} onCheckedChange={(v) => setBump(Boolean(v))} />
          <Label htmlFor="nda-bump">
            This is a material change — ask everyone to accept it again
          </Label>
        </div>
        <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Saving…" : "Save agreement"}
        </Button>
      </CardContent>
    </Card>
  );
}
