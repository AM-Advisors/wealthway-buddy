import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  MANAGER_DOC_STATUS_LABELS,
  MANAGER_DOC_TYPES,
  listManagerOnboardingDocs,
  openManagerOnboardingDoc,
  refileManagerOnboardingDoc,
  reviewManagerOnboardingDoc,
  submitManagerOnboardingDoc,
  withdrawManagerOnboardingDoc,
  type ManagerDocRow,
} from "@/lib/manager-onboarding.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/manager/onboarding")({
  head: () => ({
    meta: [
      { title: "My Onboarding Documents — Harmonious Fund Managers" },
      {
        name: "description",
        content:
          "Fund managers submit their own onboarding paperwork and follow each document through review to approval.",
      },
      { property: "og:title", content: "My Onboarding Documents — Harmonious Fund Managers" },
      {
        property: "og:description",
        content: "Submit manager onboarding paperwork and track its review status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerOnboardingPage,
  errorComponent: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">My onboarding documents</h1>
      <p className="mt-2 text-muted-foreground">
        This page could not be loaded. Refresh, or check that your account still manages a fund.
      </p>
    </main>
  ),
  notFoundComponent: () => <p className="p-6">Page not found.</p>,
});

function typeLabel(value: string) {
  return MANAGER_DOC_TYPES.find((t) => t.value === value)?.label ?? value.replace(/_/g, " ");
}

function statusTone(status: string): "default" | "secondary" | "destructive" {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

function ManagerOnboardingPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listManagerOnboardingDocs);
  const submit = useServerFn(submitManagerOnboardingDoc);
  const open = useServerFn(openManagerOnboardingDoc);
  const withdraw = useServerFn(withdrawManagerOnboardingDoc);
  const review = useServerFn(reviewManagerOnboardingDoc);
  const refile = useServerFn(refileManagerOnboardingDoc);

  const [docType, setDocType] = useState<string>(MANAGER_DOC_TYPES[0].value);
  const [fundId, setFundId] = useState<string>("none");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["manager-onboarding-docs"],
    queryFn: () => list(),
    refetchInterval: 30000,
  });

  const documents: ManagerDocRow[] = (data as any)?.documents ?? [];
  const funds: { id: string; name: string }[] = (data as any)?.funds ?? [];
  const isAdmin: boolean = (data as any)?.isAdmin ?? false;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["manager-onboarding-docs"] });

  const counts = {
    submitted: documents.filter((d) => d.status === "submitted").length,
    approved: documents.filter((d) => d.status === "approved").length,
    rejected: documents.filter((d) => d.status === "rejected").length,
  };

  const openMutation = useMutation({
    mutationFn: (id: string) => open({ data: { id } }),
    onSuccess: (res: any) => window.open(res.url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e?.message ?? "Could not open that file."),
  });

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => withdraw({ data: { id } }),
    onSuccess: () => {
      toast.success("Document withdrawn.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that document."),
  });

  const reviewMutation = useMutation({
    mutationFn: (vars: { id: string; decision: "approved" | "rejected" }) =>
      review({ data: { id: vars.id, decision: vars.decision, notes: reviewNotes[vars.id] ?? null } }),
    onSuccess: (res: any) => {
      const filing = res?.filing;
      if (filing?.ok) toast.success("Approved and filed to the shared folder.");
      else if (filing?.error) toast.warning("Approved, but filing to the shared folder failed.");
      else toast.success("Decision saved.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that decision."),
  });

  const refileMutation = useMutation({
    mutationFn: (id: string) => refile({ data: { id } }),
    onSuccess: () => {
      toast.success("Filed to the shared folder.");
      refresh();
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
      const { error } = await supabase.storage.from("manager-uploads").upload(path, file);
      if (error) throw new Error(error.message);
      await submit({
        data: {
          storage_path: path,
          file_name: file.name,
          doc_type: docType as never,
          offering_id: fundId === "none" ? null : fundId,
          note,
        },
      });
      setNote("");
      toast.success("Document submitted for review.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">My onboarding documents</h1>
          <p className="mt-1 text-muted-foreground">
            Send in the paperwork Harmonious needs from you as a fund manager, and follow each item
            through review.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/manager">Back to my funds</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Awaiting review</p>
            <p className="text-2xl">{counts.submitted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Approved</p>
            <p className="text-2xl">{counts.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Sent back</p>
            <p className="text-2xl">{counts.rejected}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Submit a document</CardTitle>
          <CardDescription>
            Only you and the Harmonious administrators can see what you send here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mgr-doc-type">Document type</Label>
              <select
                id="mgr-doc-type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {MANAGER_DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mgr-doc-fund">Related fund (optional)</Label>
              <select
                id="mgr-doc-fund"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
              >
                <option value="none">Not fund specific</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mgr-doc-note">Note (optional)</Label>
              <Input
                id="mgr-doc-note"
                value={note}
                maxLength={500}
                placeholder="Anything the reviewer should know"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mgr-doc-file">Choose file</Label>
              <Input id="mgr-doc-file" type="file" disabled={uploading} onChange={onFile} />
              <p className="text-xs text-muted-foreground">PDF, image or document up to 25 MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Submitted documents</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Every manager submission, newest first. Approve it or send it back with a note."
              : "Newest first. A reviewer's note appears here when something needs redoing."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && documents.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
          )}
          {documents.map((d) => (
            <div key={d.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusTone(d.status)}>
                      {MANAGER_DOC_STATUS_LABELS[d.status] ?? d.status}
                    </Badge>
                    <span className="font-medium">{d.file_name}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {typeLabel(d.doc_type)}
                    {d.offeringName ? ` · ${d.offeringName}` : ""}
                    {isAdmin && d.submittedBy ? ` · ${d.submittedBy}` : ""}
                    {` · sent ${new Date(d.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
                  </p>
                  {d.note && <p className="mt-1 text-sm">Your note: {d.note}</p>}
                  {d.status === "approved" && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {d.box_uploaded_at
                        ? `Filed to the shared folder on ${new Date(d.box_uploaded_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
                        : d.box_error
                          ? `Not filed yet — ${d.box_error}`
                          : "Not filed to the shared folder yet"}
                    </p>
                  )}
                  {d.review_notes && (
                    <p className="mt-1 text-sm">
                      Reviewer: {d.review_notes}
                      {d.reviewed_at
                        ? ` (${new Date(d.reviewed_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })})`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={openMutation.isPending}
                    onClick={() => openMutation.mutate(d.id)}
                  >
                    View
                  </Button>
                  {isAdmin && d.status === "approved" && !d.box_uploaded_at && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={refileMutation.isPending}
                      onClick={() => refileMutation.mutate(d.id)}
                    >
                      File to shared folder
                    </Button>
                  )}
                  {d.status === "submitted" && !isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={withdrawMutation.isPending}
                      onClick={() => withdrawMutation.mutate(d.id)}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </div>

              {isAdmin && d.status === "submitted" && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <Label htmlFor={`review-${d.id}`}>Note to the manager</Label>
                  <Textarea
                    id={`review-${d.id}`}
                    rows={2}
                    value={reviewNotes[d.id] ?? ""}
                    placeholder="Required when sending a document back"
                    onChange={(e) =>
                      setReviewNotes((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ id: d.id, decision: "approved" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ id: d.id, decision: "rejected" })}
                    >
                      Send back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
