import { useEffect, useRef, useState } from "react";

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ENTITY_TYPES,
  categoriesFor,
  entityTypeLabel,
  sectionsFor,
  setDiligenceEntityType,
  acceptDiligenceNda,
  addDiligenceDocument,
  addDocumentVersion,
  askDiligenceQuestion,
  ensureDiligenceRoom,
  getDiligenceAccess,
  getDiligenceDownloadUrl,
  getDiligenceOnboarding,
  getDiligenceRoom,
  startOnboardingFromRoom,
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
import { CapTableSection } from "@/components/cap-table-section";
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
  const [entityType, setEntityType] = useState<"fund" | "startup">("fund");

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
    mutationFn: () => ensure({ data: { offering_id: offeringId, entity_type: entityType } }),
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
                ? "Choose what is being raised. The room's sections, checklist and readiness score follow from your choice."
                : "Your fund team hasn't opened this room yet. Check back shortly."}
            </CardDescription>
          </CardHeader>
          {canManage ? (
            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {ENTITY_TYPES.map((t) => {
                  const active = entityType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setEntityType(t.value)}
                      className={`rounded-lg border p-4 text-left transition ${
                        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="block text-sm font-medium">{t.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{t.description}</span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-md border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sections you'll get
                </p>
                <ul className="mt-2 space-y-2 text-sm">
                  {sectionsFor(entityType).map((s) => (
                    <li key={s.section}>
                      <span className="font-medium">{s.section}:</span>{" "}
                      <span className="text-muted-foreground">
                        {s.categories.map((c) => c.label).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
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

      {canManage ? null : <InvestingPath offeringId={offeringId} />}



      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          {canManage ? <TabsTrigger value="engagement">Who's viewing</TabsTrigger> : null}
          {canManage ? <TabsTrigger value="settings">Agreement</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab data={data} access={a} />
        </TabsContent>
        <TabsContent value="documents" className="mt-6">
          <DocumentsTab offeringId={offeringId} data={data} canManage={canManage} />
        </TabsContent>
        <TabsContent value="checklist" className="mt-6">
          <ChecklistTab
            offeringId={offeringId}
            canManage={canManage}
            entityType={data?.entityType ?? "fund"}
          />
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

/* ------------------------------ Overview ------------------------------ */

function money(cents?: number | null) {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

function OverviewTab({ data, access }: { data: any; access: any }) {
  const offering = data?.offering ?? {};
  const readiness = data?.readiness ?? { score: 0, covered: [], missing: [] };
  const categories: any[] = data?.categories ?? [];
  const documents: any[] = data?.documents ?? [];
  const required = categories.filter((c) => c.required);
  const covered: string[] = readiness.covered ?? [];

  const facts = [
    { label: "Structure", value: entityTypeLabel(data?.entityType ?? "fund") },
    { label: "Exemption", value: offering.reg_type ? `Reg D ${offering.reg_type}` : null },
    { label: "Minimum investment", value: money(offering.min_investment_cents) },
    { label: "Target raise", value: money(offering.target_raise_cents) },
    { label: "Status", value: offering.is_open === false ? "Closed to new investors" : "Open to new investors" },
    { label: "Room opened", value: data?.room?.created_at ? when(data.room.created_at) : null },
  ].filter((f) => f.value);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{offering.name}</CardTitle>
          <CardDescription>
            {offering.summary ?? "Confidential materials for prospective and existing investors."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data?.room?.intro ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.room.intro}</p>
          ) : null}
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                <dd className="text-sm font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What has been filed</CardTitle>
          <CardDescription>
            {covered.length} of {required.length} core sections complete · {documents.length}{" "}
            {documents.length === 1 ? "document" : "documents"} in the room
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={readiness.score ?? 0} />
          <ul className="grid gap-2 sm:grid-cols-2">
            {required.map((c) => {
              const done = covered.includes(c.value);
              return (
                <li key={c.value} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{c.label}</span>
                  <Badge variant={done ? "secondary" : "outline"}>{done ? "Filed" : "Pending"}</Badge>
                </li>
              );
            })}
          </ul>
          {access?.accepted ? (
            <p className="text-xs text-muted-foreground">
              Confidentiality agreement accepted{access.acceptedAt ? ` ${when(access.acceptedAt)}` : ""}.
            </p>
          ) : null}
        </CardContent>
      </Card>
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

  const roomCategories = categoriesFor(data?.entityType);
  const [category, setCategory] = useState<string>(roomCategories[0]!.value);
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

  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null);

  const downloadMutation = useMutation({
    mutationFn: async (doc: { id: string; title: string }) => ({
      res: (await download({ data: { id: doc.id } })) as any,
      title: doc.title,
    }),
    onSuccess: ({ res, title }: any) => setViewer({ url: res.url, title }),
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

      {canManage ? <StructureCard offeringId={offeringId} entityType={data?.entityType ?? "fund"} /> : null}

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
                {roomCategories.map((c) => (
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

      {roomCategories.map((cat, index) => {
        const items = documents.filter((d) => d.category === cat.value);
        const isCapTable = cat.value === "cap_table";
        if (items.length === 0 && !cat.required && !isCapTable) return null;
        const newSection = index === 0 || roomCategories[index - 1]?.section !== cat.section;
        return (
          <div key={cat.value} className="space-y-3">
          {newSection ? (
            <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {cat.section}
            </h2>
          ) : null}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{cat.label}</CardTitle>
                  {cat.hint ? <CardDescription>{cat.hint}</CardDescription> : null}
                </div>
                {items.length === 0 && !isCapTable ? <Badge variant="outline">Pending</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isCapTable ? <CapTableSection offeringId={offeringId} /> : null}
              {items.length === 0 ? (
                isCapTable ? null : (
                  <p className="text-sm text-muted-foreground">Nothing filed here yet.</p>
                )
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
                            onClick={() => downloadMutation.mutate({ id: doc.id, title: doc.title })}
                          >
                            View
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
          </div>
        );
      })}
    </div>
  );
}

function StructureCard({ offeringId, entityType }: { offeringId: string; entityType: string }) {
  const queryClient = useQueryClient();
  const setType = useServerFn(setDiligenceEntityType);
  const mutation = useMutation({
    mutationFn: (value: "fund" | "startup") =>
      setType({ data: { offering_id: offeringId, entity_type: value } }),
    onSuccess: () => {
      toast.success("Diligence structure updated.");
      queryClient.invalidateQueries({ queryKey: ["diligence-room", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["diligence-checklist", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["diligence-activity", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not change the structure."),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Diligence structure</CardTitle>
            <CardDescription>
              Currently set up as {entityTypeLabel(entityType).toLowerCase()}. Sections, the starter
              checklist and the readiness score follow this choice.
            </CardDescription>
          </div>
          <Badge variant="secondary">{entityTypeLabel(entityType)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {ENTITY_TYPES.map((t) => {
          const active = entityType === t.value;
          return (
            <button
              key={t.value}
              type="button"
              disabled={active || mutation.isPending}
              onClick={() => mutation.mutate(t.value)}
              className={`rounded-lg border p-4 text-left transition ${
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
              }`}
            >
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{t.description}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
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

function ChecklistTab({
  offeringId,
  canManage,
  entityType,
}: {
  offeringId: string;
  canManage: boolean;
  entityType: string;
}) {
  const roomCategories = categoriesFor(entityType);
  const queryClient = useQueryClient();
  const list = useServerFn(listDiligenceChecklist);
  const save = useServerFn(saveChecklistItem);
  const drop = useServerFn(removeChecklistItem);
  const seed = useServerFn(seedDiligenceChecklist);

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>(roomCategories[0]!.value);
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
                {roomCategories.map((c) => (
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

/* --------------------- Path from the room to funding --------------------- */

const STEP_LINKS = {
  kyc: "/onboarding/kyc",
  aml: "/onboarding/aml",
  accreditation: "/onboarding/accreditation",
  documents: "/onboarding/documents",
  funding: "/onboarding/funding",
} as const;

function stateDot(state: string) {
  if (state === "done") return "bg-primary text-primary-foreground border-primary";
  if (state === "current") return "bg-background text-foreground border-primary";
  if (state === "review") return "bg-background text-foreground border-amber-500";
  return "bg-muted text-muted-foreground border-transparent";
}

function InvestingPath({ offeringId }: { offeringId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getDiligenceOnboarding);
  const start = useServerFn(startOnboardingFromRoom);

  const q = useQuery({
    queryKey: ["diligence-onboarding", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
    refetchInterval: 60_000,
  });

  const startMutation = useMutation({
    mutationFn: () => start({ data: { offering_id: offeringId } }),
    onSuccess: () => {
      toast.success("Your application is open — let's start with your identity check.");
      queryClient.invalidateQueries({ queryKey: ["diligence-onboarding", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["nav-state"] });
      window.location.href = STEP_LINKS.kyc;
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start your application."),
  });

  const d = q.data as any;
  if (!d) return null;

  const nextKey = (d.nextStep ?? "kyc") as keyof typeof STEP_LINKS;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg">Your path to investing</CardTitle>
        <CardDescription>
          Review the materials here, then move through each step. You can come back to the room at any
          time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(d.steps ?? []).map((s: any, index: number) => (
            <li key={s.key} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${stateDot(s.state)}`}
              >
                {s.state === "done" ? "✓" : index + 1}
              </span>
              <div>
                <p className="text-sm">{s.label}</p>
                <p className="text-xs text-muted-foreground">
                  {s.state === "done"
                    ? "Complete"
                    : s.state === "review"
                      ? "With our team for review"
                      : s.state === "current"
                        ? "Up next"
                        : "Not started"}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          {d.complete ? (
            <Badge>Onboarding complete</Badge>
          ) : d.hasApplication ? (
            <Button asChild>
              <Link to={STEP_LINKS[nextKey] ?? STEP_LINKS.kyc}>Continue onboarding</Link>
            </Button>
          ) : d.otherOfferingId ? (
            <Button asChild variant="outline">
              <Link to="/dashboard">Go to your application</Link>
            </Button>
          ) : d.invited ? (
            <Button
              disabled={startMutation.isPending || (d.ndaRequired && !d.ndaAccepted)}
              onClick={() => startMutation.mutate()}
            >
              {startMutation.isPending ? "Starting…" : "Start onboarding for this fund"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask your fund contact to invite you to invest in this fund.
            </p>
          )}
          <Button asChild variant="ghost">
            <Link to="/dashboard">Your dashboard</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
