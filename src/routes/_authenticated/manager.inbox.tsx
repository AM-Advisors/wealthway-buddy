import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getInboxUploadUrl,
  listInboxUploads,
  setUploadReview,
  type InboxItem,
} from "@/lib/manager-inbox.functions";
import { fileUploadToBox } from "@/lib/investor-uploads.functions";
import { UPLOAD_KINDS } from "@/lib/investor-uploads.functions";

export const Route = createFileRoute("/_authenticated/manager/inbox")({
  head: () => ({
    meta: [
      { title: "Document Inbox — Harmonious Manager" },
      {
        name: "description",
        content:
          "Every document your investors upload arrives here automatically, ready to open, accept or send back for follow-up.",
      },
      { property: "og:title", content: "Document Inbox — Harmonious Manager" },
      {
        property: "og:description",
        content: "Review investor documents in one place, without chasing links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerInboxPage,
});

const KIND_LABEL = new Map(UPLOAD_KINDS.map((k) => [k.value as string, k.label]));

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: InboxItem["review_status"] }) {
  if (status === "accepted") return <Badge variant="secondary">Accepted</Badge>;
  if (status === "needs_followup") return <Badge variant="destructive">Needs follow-up</Badge>;
  return <Badge>New</Badge>;
}

function ManagerInboxPage() {
  const load = useServerFn(listInboxUploads);
  const openFile = useServerFn(getInboxUploadUrl);
  const review = useServerFn(setUploadReview);
  const refile = useServerFn(fileUploadToBox);
  const queryClient = useQueryClient();

  const [fundId, setFundId] = useState("all");
  const [status, setStatus] = useState("new");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["manager-inbox"],
    queryFn: () => load(),
    retry: false,
    refetchInterval: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["manager-inbox"] });

  const reviewMutation = useMutation({
    mutationFn: (input: { id: string; status: InboxItem["review_status"]; note?: string }) =>
      review({ data: input }),
    onSuccess: () => {
      toast.success("Review saved.");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that review."),
  });

  const refileMutation = useMutation({
    mutationFn: (id: string) => refile({ data: { id } }),
    onSuccess: () => {
      toast.success("Filed to the shared folder.");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not file that document."),
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    const term = search.trim().toLowerCase();
    return all.filter((item) => {
      if (fundId !== "all" && item.offering_id !== fundId) return false;
      if (status !== "all" && item.review_status !== status) return false;
      if (!term) return true;
      return [item.investor_name, item.investor_email, item.file_name, item.fund_name]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term));
    });
  }, [data, fundId, status, search]);

  async function open(id: string) {
    try {
      const result = await openFile({ data: { id } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open that file.");
    }
  }

  const counts = data?.counts;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Document inbox</h1>
        <p className="text-muted-foreground max-w-2xl">
          Everything your investors upload arrives here automatically. Open a file, accept it, or
          send it back for follow-up — no links to chase.
        </p>
        <Button asChild variant="link" className="px-0">
          <Link to="/manager">Back to your panel</Link>
        </Button>
      </header>

      {counts ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Waiting on you", value: counts.newItems },
            { label: "Needs follow-up", value: counts.followUp },
            { label: "Accepted", value: counts.accepted },
            { label: "Not in shared folder", value: counts.unfiled },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">{stat.label}</p>
                <p className="text-2xl font-semibold">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Uploads</CardTitle>
            <CardDescription>
              {isLoading ? "Loading…" : `${items.length} document${items.length === 1 ? "" : "s"}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search investor or file"
              className="w-56"
            />
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All funds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All funds</SelectItem>
                {(data?.funds ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="needs_followup">Needs follow-up</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="all">Everything</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isError ? (
            <p className="text-destructive text-sm">
              {(error as any)?.message ?? "Could not load the inbox."}
            </p>
          ) : null}
          {!isLoading && !isError && items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing here right now.</p>
          ) : null}

          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.file_name}</span>
                    <StatusBadge status={item.review_status} />
                    <Badge variant="outline">
                      {KIND_LABEL.get(item.doc_kind) ?? item.doc_kind}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {item.investor_name ?? item.investor_email ?? "Investor"} ·{" "}
                    {item.fund_name ?? "Fund"} · uploaded {when(item.uploaded_at)}
                  </p>
                  {item.note ? <p className="text-sm">Investor note: {item.note}</p> : null}
                  {item.review_note ? (
                    <p className="text-sm">Your note: {item.review_note}</p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {item.box_uploaded_at
                      ? `In the shared folder ${when(item.box_uploaded_at)}`
                      : item.box_error
                        ? `Not in the shared folder: ${item.box_error}`
                        : "Not in the shared folder yet"}
                    {item.reviewed_at ? ` · reviewed ${when(item.reviewed_at)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => open(item.id)}>
                    Open
                  </Button>
                  {!item.box_file_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={refileMutation.isPending}
                      onClick={() => refileMutation.mutate(item.id)}
                    >
                      File it
                    </Button>
                  ) : null}
                  {item.review_status !== "accepted" ? (
                    <Button
                      size="sm"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ id: item.id, status: "accepted" })}
                    >
                      Accept
                    </Button>
                  ) : null}
                  {item.review_status !== "needs_followup" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={reviewMutation.isPending}
                      onClick={() => {
                        const note = window.prompt("What does the investor need to fix?") ?? "";
                        reviewMutation.mutate({
                          id: item.id,
                          status: "needs_followup",
                          note: note.trim() || undefined,
                        });
                      }}
                    >
                      Needs follow-up
                    </Button>
                  ) : null}
                  {item.review_status !== "new" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ id: item.id, status: "new" })}
                    >
                      Reopen
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      to="/manager/$applicationId"
                      params={{ applicationId: item.application_id }}
                    >
                      Investor file
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
