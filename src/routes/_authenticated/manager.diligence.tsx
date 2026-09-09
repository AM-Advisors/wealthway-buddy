import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  addDiligenceDocument,
  ensureDiligenceRoom,
  getDiligenceRoomTraffic,
  listManagedDiligenceRooms,
  removeDiligenceDocument,
  syncDiligenceFolder,
} from "@/lib/diligence.functions";
import { categoriesFor } from "@/lib/diligence-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/manager/diligence")({
  head: () => ({
    meta: [
      { title: "Diligence Room Manager — Harmonious" },
      {
        name: "description",
        content:
          "Open a diligence room for each fund you manage, upload materials and sort them into the categories investors expect.",
      },
      { property: "og:title", content: "Diligence Room Manager — Harmonious" },
      {
        property: "og:description",
        content: "Upload and categorize fund diligence materials for Harmonious investors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerDiligencePage,
});

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

function ManagerDiligencePage() {
  const load = useServerFn(listManagedDiligenceRooms);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["managed-diligence-rooms"],
    queryFn: () => load(),
    retry: false,
  });

  const funds = (data?.funds ?? []) as any[];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => funds.find((f) => f.offeringId === selectedId) ?? funds[0] ?? null,
    [funds, selectedId],
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Diligence rooms</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add the materials investors ask for and sort them into the right section. Everything you
            upload appears in the fund's diligence room straight away.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/manager">Back to panel</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading your funds…</p>
      ) : isError ? (
        <p className="mt-8 text-sm text-muted-foreground">
          This area is for fund managers. Ask an administrator to assign you to a fund.
        </p>
      ) : funds.length === 0 ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>No funds assigned yet</CardTitle>
            <CardDescription>
              Once you are assigned to a fund, its diligence room will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {funds.map((f) => (
              <Button
                key={f.offeringId}
                size="sm"
                variant={selected?.offeringId === f.offeringId ? "default" : "outline"}
                onClick={() => setSelectedId(f.offeringId)}
              >
                {f.name}
                <span className="ml-2 text-xs opacity-70">{f.readiness.score}%</span>
              </Button>
            ))}
          </div>

          <RoomTraffic />

          {selected ? <FundPanel key={selected.offeringId} fund={selected} /> : null}
        </>
      )}
    </main>
  );
}

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function RoomTraffic() {
  const load = useServerFn(getDiligenceRoomTraffic);
  const { data, isLoading } = useQuery({
    queryKey: ["diligence-room-traffic"],
    queryFn: () => load(),
    retry: false,
    refetchInterval: 120_000,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const rooms = (data?.rooms ?? []) as any[];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Who is looking</CardTitle>
        <CardDescription>
          Investor visits and downloads for each room. Your own team's activity is left out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms to report on yet.</p>
        ) : (
          rooms.map((r) => (
            <div key={r.offeringId} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.visitorCount} investor{r.visitorCount === 1 ? "" : "s"} · {r.opens} room
                    open{r.opens === 1 ? "" : "s"} · {r.downloads} download
                    {r.downloads === 1 ? "" : "s"} · {r.views} read in the room · last activity{" "}
                    {when(r.lastActivityAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.opens > 0 ? "default" : "secondary"}>
                    {r.opens > 0 ? "Active" : "Quiet"}
                  </Badge>
                  {r.visitors.length > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenId(openId === r.offeringId ? null : r.offeringId)}
                    >
                      {openId === r.offeringId ? "Hide people" : "See people"}
                    </Button>
                  ) : null}
                </div>
              </div>

              {openId === r.offeringId ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {r.visitors.map((v: any) => (
                    <div
                      key={v.actorId}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate">{v.name ?? v.email ?? "Investor"}</span>
                      <span className="text-muted-foreground">
                        {v.opens} open{v.opens === 1 ? "" : "s"} · {v.downloads} download
                        {v.downloads === 1 ? "" : "s"} · last seen {when(v.lastSeen)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}


function FundPanel({ fund }: { fund: any }) {
  const queryClient = useQueryClient();
  const ensure = useServerFn(ensureDiligenceRoom);
  const add = useServerFn(addDiligenceDocument);
  const remove = useServerFn(removeDiligenceDocument);
  const sync = useServerFn(syncDiligenceFolder);
  const [lastSync, setLastSync] = useState<{ at: string; added: number; checked: number } | null>(
    null,
  );
  const syncMutation = useMutation({
    mutationFn: () => sync({ data: { offering_id: fund.offeringId } }),
    onSuccess: (res: any) => {
      setLastSync({ at: res.syncedAt, added: res.added, checked: res.checked });
      toast.success(
        res.added > 0
          ? `${res.added} file${res.added === 1 ? "" : "s"} pulled in — your managers have been notified`
          : "Everything in the folder is already listed",
      );
      queryClient.invalidateQueries({ queryKey: ["managed-diligence-rooms"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not check the folder."),
  });

  const categories = categoriesFor(fund.entityType);
  const [category, setCategory] = useState<string>(categories[0]!.value);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["managed-diligence-rooms"] });
    queryClient.invalidateQueries({ queryKey: ["diligence-rooms"] });
    queryClient.invalidateQueries({ queryKey: ["diligence-room", fund.offeringId] });
  }

  const openRoom = useMutation({
    mutationFn: (entityType: "fund" | "startup") =>
      ensure({ data: { offering_id: fund.offeringId, entity_type: entityType } }),
    onSuccess: () => {
      toast.success("Diligence room is open.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open the room."),
  });

  const removeDoc = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that document."),
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
          offering_id: fund.offeringId,
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

  const grouped = categories
    .map((c) => ({
      ...c,
      docs: (fund.documents as any[]).filter((d) => d.category === c.value),
    }))
    .filter((g) => g.docs.length > 0 || g.required);

  if (!fund.hasRoom) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{fund.name}</CardTitle>
          <CardDescription>
            This fund does not have a diligence room yet. Open one to start adding materials.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={openRoom.isPending} onClick={() => openRoom.mutate("fund")}>
            {openRoom.isPending ? "Opening…" : "Open a fund room"}
          </Button>
          <Button
            variant="outline"
            disabled={openRoom.isPending}
            onClick={() => openRoom.mutate("startup")}
          >
            Open a company room
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{fund.name}</CardTitle>
              <CardDescription>
                {fund.documentCount} document{fund.documentCount === 1 ? "" : "s"} on file
                {fund.readiness.missing.length > 0
                  ? ` · still to add: ${fund.readiness.missing.map((m: any) => m.label).join(", ")}`
                  : " · every core section is covered"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={fund.readiness.score === 100 ? "default" : "secondary"}>
                {fund.readiness.score}% complete
              </Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                {syncMutation.isPending ? "Checking…" : "Sync from Box"}
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/diligence/$offeringId" params={{ offeringId: fund.offeringId }}>
                  Open full room
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={fund.readiness.score} />
          <p className="text-xs text-muted-foreground">
            {lastSync
              ? `Box folder checked at ${new Date(lastSync.at).toLocaleTimeString()} — ${lastSync.checked} file${
                  lastSync.checked === 1 ? "" : "s"
                } there, ${lastSync.added} newly added.`
              : "Drop files straight into the Box folder, then hit Sync from Box to list them here."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a document</CardTitle>
          <CardDescription>
            Pick the section it belongs in, then choose the file. Investors see it right away.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="md-category">Section</Label>
            <select
              id="md-category"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                  {c.required ? " (core)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="md-title">Title</Label>
            <Input
              id="md-title"
              value={title}
              placeholder="Leave blank to use the file name"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="md-description">Note for investors (optional)</Label>
            <Textarea
              id="md-description"
              value={description}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="md-file">File</Label>
            <Input id="md-file" type="file" disabled={busy} onChange={onFile} />
            <p className="text-xs text-muted-foreground">
              {busy ? "Uploading…" : "Up to 20 MB per file."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What is on file</CardTitle>
          <CardDescription>Sections marked core are the ones investors expect first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {grouped.map((group) => (
            <div key={group.value}>
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  {group.label}
                  {group.required ? <span className="text-muted-foreground"> · core</span> : null}
                </p>
                <span className="text-xs text-muted-foreground">
                  {group.docs.length} file{group.docs.length === 1 ? "" : "s"}
                </span>
              </div>
              {group.docs.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Nothing here yet.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {group.docs.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.file_name} · added {new Date(doc.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={removeDoc.isPending}
                        onClick={() => removeDoc.mutate(doc.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
