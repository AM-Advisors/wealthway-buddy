import { useMemo, useRef, useState } from "react";

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  TAX_DOC_TYPES,
  deleteTaxDocument,
  getOpsFundOptions,
  getOpsQueue,
  getOpsSs4Url,
  getTaxDocumentUrl,
  inviteOperationsMember,
  listOperationsTeam,
  removeOperationsMember,
  reviewBankRequest,
  reviewEntityDetails,
  reviewTaxDocument,
  uploadTaxDocument,
} from "@/lib/operations.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BANK_LABELS: Record<string, string> = {
  mercury: "Mercury",
  texas_capital: "Texas Capital Bank",
  customers: "Customers Bank",
};

const BANK_STAGES = [
  { value: "requested", label: "Requested" },
  { value: "in_progress", label: "In progress" },
  { value: "opened", label: "Account opened" },
  { value: "cancelled", label: "Cancelled" },
];

const DOC_LABELS = Object.fromEntries(TAX_DOC_TYPES.map((t) => [t.value, t.label])) as Record<
  string,
  string
>;

function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function ReviewBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge>Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Sent back</Badge>;
  return <Badge variant="secondary">Waiting for review</Badge>;
}

function useOpsQueue() {
  const load = useServerFn(getOpsQueue);
  return useQuery({ queryKey: ["ops-queue"], queryFn: () => load(), refetchInterval: 60_000 });
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {[
          { to: "/ops", label: "Overview" },
          { to: "/ops/banking", label: "Banking" },
          { to: "/ops/ss4", label: "EIN and SS-4" },
          { to: "/ops/tax-documents", label: "Tax documents" },
          { to: "/ops/team", label: "Team" },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to as never}
            className="rounded-md border px-3 py-1.5 hover:bg-accent"
            activeOptions={{ exact: item.to === "/ops" }}
            activeProps={{ className: "rounded-md border bg-primary px-3 py-1.5 text-primary-foreground" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <h1 className="text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

function Loading({ query }: { query: { isLoading: boolean; isError: boolean; error?: unknown } }) {
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <p className="text-sm text-muted-foreground">
      {(query.error as any)?.message ?? "This is unavailable right now."}
    </p>
  );
}

/* ---------------------------------------------------------------- Overview */

export function OperationsHome() {
  const q = useOpsQueue();
  if (!q.data) {
    return (
      <Shell title="Operations" description="Everything waiting on the operations team.">
        <Loading query={q} />
      </Shell>
    );
  }
  const d = q.data;
  const banksPending = d.bankRequests.filter((r) => r.reviewStatus === "pending");
  const entitiesPending = d.entities.filter(
    (e) => e.einStatus === "pending" || e.ss4Status === "pending",
  );
  const taxPending = d.taxDocuments.filter((t) => t.reviewStatus === "pending");

  return (
    <Shell
      title="Operations"
      description="Banking requests, EINs and tax paperwork are checked here before fund managers see them."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Banking requests waiting" value={String(banksPending.length)} to="/ops/banking" />
        <Stat label="EIN / SS-4 waiting" value={String(entitiesPending.length)} to="/ops/ss4" />
        <Stat label="Tax documents waiting" value={String(taxPending.length)} to="/ops/tax-documents" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oldest items first</CardTitle>
          <CardDescription>Start at the top of this list.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ...banksPending.map((r) => ({
              key: `b-${r.id}`,
              at: r.requestedAt,
              text: `${r.fundName} — bank account with ${BANK_LABELS[r.bank] ?? r.bank}`,
              to: "/ops/banking",
            })),
            ...entitiesPending.map((e) => ({
              key: `e-${e.offeringId}`,
              at: e.updatedAt ?? "",
              text: `${e.fundName} — EIN and Form SS-4`,
              to: "/ops/ss4",
            })),
            ...taxPending.map((t) => ({
              key: `t-${t.id}`,
              at: t.uploadedAt,
              text: `${t.fundName} — ${DOC_LABELS[t.docType] ?? t.docType}${
                t.investorName ? ` for ${t.investorName}` : ""
              }`,
              to: "/ops/tax-documents",
            })),
          ]
            .sort((a, b) => (a.at < b.at ? -1 : 1))
            .slice(0, 20)
            .map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{row.text}</p>
                  <p className="text-xs text-muted-foreground">Waiting since {when(row.at)}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to={row.to as never}>Review</Link>
                </Button>
              </div>
            ))}
          {banksPending.length + entitiesPending.length + taxPending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing is waiting. You are all caught up.</p>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Stat({ label, value, to }: { label: string; value: string; to: string }) {
  return (
    <Link to={to as never} className="rounded-lg border p-4 hover:bg-accent">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl">{value}</p>
    </Link>
  );
}

/* ----------------------------------------------------------------- Banking */

export function OperationsBanking({ fundId }: { fundId?: string }) {
  const q = useOpsQueue();
  const queryClient = useQueryClient();
  const review = useServerFn(reviewBankRequest);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (input: { id: string; reviewStatus: "approved" | "rejected" | "pending" }) =>
      review({
        data: {
          id: input.id,
          reviewStatus: input.reviewStatus,
          ...(stages[input.id] ? { status: stages[input.id] as any } : {}),
          note: notes[input.id] ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that."),
  });

  const body = !q.data ? (
    <Loading query={q} />
  ) : (
    <>
      {q.data.bankRequests
        .filter((r) => !fundId || r.offeringId === fundId)
        .map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {r.fundName} — {BANK_LABELS[r.bank] ?? r.bank}
                </CardTitle>
                <ReviewBadge status={r.reviewStatus} />
              </div>
              <CardDescription>
                Requested {when(r.requestedAt)}
                {r.requestedBy ? ` by ${r.requestedBy}` : ""} · stage:{" "}
                {BANK_STAGES.find((s) => s.value === r.status)?.label ?? r.status}
                {r.legalEntityName ? ` · ${r.legalEntityName}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.note ? <p className="text-sm">Manager note: {r.note}</p> : null}
              {r.reviewNote ? (
                <p className="text-sm text-muted-foreground">
                  Your note: {r.reviewNote} · {when(r.reviewedAt)}
                  {r.reviewedBy ? ` by ${r.reviewedBy}` : ""}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Where it stands</Label>
                  <Select
                    value={stages[r.id] ?? r.status}
                    onValueChange={(v) => setStages((s) => ({ ...s, [r.id]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BANK_STAGES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Note back to the manager</Label>
                  <Textarea
                    rows={2}
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ id: r.id, reviewStatus: "approved" })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ id: r.id, reviewStatus: "rejected" })}
                >
                  Send back
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ id: r.id, reviewStatus: "pending" })}
                >
                  Keep in review
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      {q.data.bankRequests.filter((r) => !fundId || r.offeringId === fundId).length === 0 && (
        <p className="text-sm text-muted-foreground">No banking requests yet.</p>
      )}
    </>
  );

  if (fundId) return <div className="space-y-4">{body}</div>;
  return (
    <Shell
      title="Banking requests"
      description="Every fund that asked Harmonious to open its bank account."
    >
      {body}
    </Shell>
  );
}

/* --------------------------------------------------------------- EIN / SS-4 */

export function OperationsSs4({ fundId }: { fundId?: string }) {
  const q = useOpsQueue();
  const queryClient = useQueryClient();
  const review = useServerFn(reviewEntityDetails);
  const openSs4 = useServerFn(getOpsSs4Url);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (input: { offeringId: string; status: "approved" | "rejected" | "pending" }) =>
      review({
        data: {
          offeringId: input.offeringId,
          einStatus: input.status,
          ss4Status: input.status,
          note: notes[input.offeringId] ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that."),
  });

  const open = useMutation({
    mutationFn: (offeringId: string) => openSs4({ data: { offeringId } }),
    onSuccess: (res: any) => {
      if (res?.url) window.open(res.url, "_blank", "noopener");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open that form."),
  });

  const body = !q.data ? (
    <Loading query={q} />
  ) : (
    <>
      {q.data.entities
        .filter((e) => !fundId || e.offeringId === fundId)
        .map((e) => (
          <Card key={e.offeringId}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{e.fundName}</CardTitle>
                <div className="flex gap-2">
                  <ReviewBadge status={e.einStatus} />
                </div>
              </div>
              <CardDescription>
                {e.legalEntityName ?? "No legal entity name yet"}
                {e.entityType ? ` · ${e.entityType}` : ""}
                {e.stateFormed ? ` · formed in ${e.stateFormed}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                EIN: {e.hasEin && e.ein ? e.ein : "not provided yet"} · Form SS-4:{" "}
                {e.hasSs4File ? `generated ${when(e.ss4GeneratedAt)}` : "not generated"}
              </p>
              {e.reviewNote ? (
                <p className="text-sm text-muted-foreground">
                  Your note: {e.reviewNote} · {when(e.reviewedAt)}
                </p>
              ) : null}
              <div>
                <Label className="text-xs">Note back to the manager</Label>
                <Textarea
                  rows={2}
                  value={notes[e.offeringId] ?? ""}
                  onChange={(ev) => setNotes((n) => ({ ...n, [e.offeringId]: ev.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {e.hasSs4File && (
                  <Button size="sm" variant="outline" onClick={() => open.mutate(e.offeringId)}>
                    Open Form SS-4
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ offeringId: e.offeringId, status: "approved" })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ offeringId: e.offeringId, status: "rejected" })}
                >
                  Send back
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      {q.data.entities.filter((e) => !fundId || e.offeringId === fundId).length === 0 && (
        <p className="text-sm text-muted-foreground">No fund has entered EIN or SS-4 details yet.</p>
      )}
    </>
  );

  if (fundId) return <div className="space-y-4">{body}</div>;
  return (
    <Shell
      title="EIN and Form SS-4"
      description="Check each fund's tax ID and its generated Form SS-4 before the fund team relies on it."
    >
      {body}
    </Shell>
  );
}

/* ----------------------------------------------------------- Tax documents */

export function OperationsTaxDocuments({ fundId }: { fundId?: string }) {
  const q = useOpsQueue();
  const optionsFn = useServerFn(getOpsFundOptions);
  const options = useQuery({ queryKey: ["ops-fund-options"], queryFn: () => optionsFn() });
  const queryClient = useQueryClient();

  const upload = useServerFn(uploadTaxDocument);
  const review = useServerFn(reviewTaxDocument);
  const remove = useServerFn(deleteTaxDocument);
  const openDoc = useServerFn(getTaxDocumentUrl);

  const fileRef = useRef<HTMLInputElement>(null);
  const [offeringId, setOfferingId] = useState(fundId ?? "");
  const [investorUserId, setInvestorUserId] = useState("none");
  const [docType, setDocType] = useState("w9");
  const [taxYear, setTaxYear] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const investors = useMemo(
    () => (options.data?.investors ?? []).filter((i) => i.offeringId === offeringId),
    [options.data, offeringId],
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Choose a file first.");
      if (!offeringId) throw new Error("Choose a fund first.");
      if (file.size > 20 * 1024 * 1024) throw new Error("That file is larger than 20 MB.");
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      return upload({
        data: {
          offeringId,
          investorUserId: investorUserId === "none" ? null : investorUserId,
          docType: docType as any,
          taxYear: taxYear ? Number(taxYear) : null,
          note,
          fileName: file.name,
          contentBase64: btoa(binary),
        },
      });
    },
    onSuccess: () => {
      toast.success("Uploaded");
      setNote("");
      setTaxYear("");
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not upload that file."),
  });

  const reviewMutation = useMutation({
    mutationFn: (input: { id: string; reviewStatus: "approved" | "rejected" | "pending" }) =>
      review({ data: { id: input.id, reviewStatus: input.reviewStatus, note: notes[input.id] ?? "" } }),
    onSuccess: () => {
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that document."),
  });

  const openMutation = useMutation({
    mutationFn: (id: string) => openDoc({ data: { id } }),
    onSuccess: (res: any) => {
      if (res?.url) window.open(res.url, "_blank", "noopener");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open that document."),
  });

  const rows = (q.data?.taxDocuments ?? []).filter(
    (t) =>
      (!fundId || t.offeringId === fundId) && (filter === "all" || t.reviewStatus === filter),
  );

  const body = (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a tax document</CardTitle>
          <CardDescription>W-9, W-8BEN, W-8BEN-E, K-1 or anything else.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Fund</Label>
              <Select value={offeringId} onValueChange={setOfferingId} disabled={Boolean(fundId)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a fund" />
                </SelectTrigger>
                <SelectContent>
                  {(options.data?.funds ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Document</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Investor (optional)</Label>
              <Select value={investorUserId} onValueChange={setInvestorUserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not tied to one investor</SelectItem>
                  {investors.map((i) => (
                    <SelectItem key={i.userId} value={i.userId}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tax year (optional)</Label>
              <Input
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="2025"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Input ref={fileRef} type="file" accept="application/pdf" />
          <Button
            size="sm"
            disabled={uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            {uploadMutation.isPending ? "Uploading…" : "Upload"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Label className="text-xs">Show</Label>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Waiting for review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Sent back</SelectItem>
            <SelectItem value="all">Everything</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!q.data ? (
        <Loading query={q} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        rows.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {DOC_LABELS[t.docType] ?? t.docType}
                  {t.taxYear ? ` · ${t.taxYear}` : ""}
                </CardTitle>
                <ReviewBadge status={t.reviewStatus} />
              </div>
              <CardDescription>
                {t.fundName}
                {t.investorName ? ` · ${t.investorName}` : ""} · {t.fileName} · added {when(t.uploadedAt)}
                {t.uploadedBy ? ` by ${t.uploadedBy}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {t.note ? <p className="text-sm">{t.note}</p> : null}
              {t.reviewNote ? (
                <p className="text-sm text-muted-foreground">
                  Review note: {t.reviewNote} · {when(t.reviewedAt)}
                  {t.reviewedBy ? ` by ${t.reviewedBy}` : ""}
                </p>
              ) : null}
              <Textarea
                rows={2}
                placeholder="Note (optional)"
                value={notes[t.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openMutation.mutate(t.id)}>
                  Open file
                </Button>
                <Button
                  size="sm"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: t.id, reviewStatus: "approved" })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: t.id, reviewStatus: "rejected" })}
                >
                  Send back
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(t.id)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </>
  );

  if (fundId) return <div className="space-y-4">{body}</div>;
  return (
    <Shell
      title="Tax documents"
      description="W-9s, W-8s and K-1s. Fund managers only see the ones you approve."
    >
      {body}
    </Shell>
  );
}

/* -------------------------------------------------------------------- Team */

export function OperationsTeam() {
  const listFn = useServerFn(listOperationsTeam);
  const inviteFn = useServerFn(inviteOperationsMember);
  const removeFn = useServerFn(removeOperationsMember);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const team = useQuery({ queryKey: ["ops-team"], queryFn: () => listFn() });

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { email, name } }),
    onSuccess: () => {
      toast.success("Added to the operations team");
      setEmail("");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["ops-team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add that person."),
  });

  const drop = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Removed");
      queryClient.invalidateQueries({ queryKey: ["ops-team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that person."),
  });

  return (
    <Shell title="Operations team" description="Who can review banking, EINs and tax paperwork.">
      {team.data?.isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add someone</CardTitle>
            <CardDescription>They get an email with a link to set their password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </div>
              <div>
                <Label className="text-xs">Name (optional)</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <Button size="sm" disabled={!email || invite.isPending} onClick={() => invite.mutate()}>
              {invite.isPending ? "Adding…" : "Add to operations"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!team.data ? (
            <Loading query={team} />
          ) : team.data.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one has the operations role yet.</p>
          ) : (
            team.data.members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{m.name ?? m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                {team.data?.isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => drop.mutate(m.userId)}>
                    Remove
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

/* -------------------------------------------------------------- One fund */

export function OperationsFund({ fundId }: { fundId: string }) {
  const q = useOpsQueue();
  const fundName =
    q.data?.bankRequests.find((r) => r.offeringId === fundId)?.fundName ??
    q.data?.entities.find((e) => e.offeringId === fundId)?.fundName ??
    q.data?.taxDocuments.find((t) => t.offeringId === fundId)?.fundName ??
    "This fund";

  return (
    <Shell title={fundName} description="Everything operations holds for this fund.">
      <h2 className="text-lg">Banking</h2>
      <OperationsBanking fundId={fundId} />
      <h2 className="text-lg">EIN and Form SS-4</h2>
      <OperationsSs4 fundId={fundId} />
      <h2 className="text-lg">Tax documents</h2>
      <OperationsTaxDocuments fundId={fundId} />
    </Shell>
  );
}
