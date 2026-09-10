import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ActivityPanel } from "@/components/activity-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getProviderFileUrl,
  getProviderSubmissionsBoard,
  reviewProviderDocument,
  reviewProviderExpense,
  setProviderContact,
} from "@/lib/provider-portal.functions";

const money = (cents: number, currency = "USD") =>
  (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency });

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

const day = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-US") : "—";

const tone = (status: string) =>
  status === "accepted"
    ? "default"
    : status === "declined" || status === "rejected"
      ? "destructive"
      : status === "withdrawn"
        ? "outline"
        : "secondary";

const ageDays = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** Harmonious view of everything third-party providers have sent in: costs
 *  waiting to be accepted, documents on file, and who can sign in for them. */
export function ProviderSubmissionsBoard() {
  const load = useServerFn(getProviderSubmissionsBoard);
  const reviewExpense = useServerFn(reviewProviderExpense);
  const reviewDocument = useServerFn(reviewProviderDocument);
  const saveContact = useServerFn(setProviderContact);
  const fileUrl = useServerFn(getProviderFileUrl);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"waiting" | "all">("waiting");
  const [draft, setDraft] = useState<Record<string, { clientId: string; offeringId: string; note: string }>>(
    {},
  );
  const [contact, setContact] = useState({ providerId: "", email: "", contactName: "", title: "" });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["provider-submissions"],
    queryFn: () => load(),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["provider-submissions"] });

  const decide = useMutation({
    mutationFn: (input: any) => reviewExpense({ data: input }),
    onSuccess: (_r, input: any) => {
      toast.success(input.decision === "accepted" ? "Cost accepted and recorded." : "Cost declined.");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't go through."),
  });

  const decideDoc = useMutation({
    mutationFn: (input: any) => reviewDocument({ data: input }),
    onSuccess: () => {
      toast.success("Document updated.");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't go through."),
  });

  const addContact = useMutation({
    mutationFn: (input: any) => saveContact({ data: input }),
    onSuccess: () => {
      toast.success("Provider contact updated.");
      setContact({ providerId: "", email: "", contactName: "", title: "" });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't go through."),
  });

  const openFile = async (path: string) => {
    try {
      const { url } = await fileUrl({ data: { path } });
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("That file isn't available.");
    } catch (e: any) {
      toast.error(e?.message ?? "That file isn't available.");
    }
  };

  const submissions = (data?.submissions ?? []) as any[];
  const waiting = useMemo(
    () => submissions.filter((s) => s.status === "submitted"),
    [submissions],
  );
  const shown = tab === "waiting" ? waiting : submissions;
  const canManage = !!data?.canManage;
  const funds = (data?.funds ?? []) as any[];

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading provider submissions…</p>;
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        {(error as any)?.message ?? "This area isn't available to you."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Costs sent by providers</CardTitle>
          <CardDescription>
            Oldest first. Accepting a cost records it as a pass-through cost against a client, so it
            can be billed on. Nothing reaches a client invoice until you accept it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant={tab === "waiting" ? "default" : "outline"} onClick={() => setTab("waiting")}>
              Waiting ({waiting.length})
            </Button>
            <Button size="sm" variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>
              All ({submissions.length})
            </Button>
          </div>

          {shown.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Providers submit costs from their own portal once you give a contact
              access below.
            </p>
          )}

          {shown.map((s) => {
            const d = draft[s.id] ?? { clientId: "", offeringId: "", note: "" };
            const set = (patch: Partial<typeof d>) =>
              setDraft((prev) => ({ ...prev, [s.id]: { ...d, ...patch } }));
            return (
              <div key={s.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.providerName} · {money(s.amount_cents, s.currency)}
                    </p>
                    <p className="text-sm">{s.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Incurred {day(s.incurred_on)} · submitted {when(s.submitted_at)}
                      {s.status === "submitted" ? ` · waiting ${ageDays(s.submitted_at)} day(s)` : ""}
                      {s.reference ? ` · ref ${s.reference}` : ""}
                    </p>
                    {s.note && <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>}
                    {s.review_note && (
                      <p className="mt-1 text-xs text-muted-foreground">Review note: {s.review_note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.file_path && (
                      <Button size="sm" variant="outline" onClick={() => openFile(s.file_path)}>
                        Open invoice
                      </Button>
                    )}
                    <Badge variant={tone(s.status) as any}>{s.status.replace(/_/g, " ")}</Badge>
                  </div>
                </div>

                {s.status === "submitted" && canManage && (
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Client</Label>
                      <Select value={d.clientId} onValueChange={(v) => set({ clientId: v, offeringId: "" })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a client" />
                        </SelectTrigger>
                        <SelectContent>
                          {(data.clients as any[]).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fund (optional)</Label>
                      <Select value={d.offeringId} onValueChange={(v) => set({ offeringId: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="No specific fund" />
                        </SelectTrigger>
                        <SelectContent>
                          {funds
                            .filter((f) => !d.clientId || f.client_id === d.clientId)
                            .map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Note</Label>
                      <Input
                        value={d.note}
                        onChange={(e) => set({ note: e.target.value })}
                        placeholder="Why this was accepted or declined"
                      />
                    </div>
                    <div className="flex gap-2 md:col-span-4">
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({
                            id: s.id,
                            decision: "accepted",
                            clientId: d.clientId || null,
                            offeringId: d.offeringId || null,
                            reviewNote: d.note || null,
                          })
                        }
                      >
                        Accept and record
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({ id: s.id, decision: "declined", reviewNote: d.note || null })
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                )}

                {s.status === "submitted" && !canManage && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Accepting or declining a cost needs legal, compliance, finance, client success,
                    executive or admin authority.
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents from providers</CardTitle>
          <CardDescription>
            Contracts, insurance certificates, tax forms and security reports the provider uploaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data.documents as any[]).length === 0 && (
            <p className="text-sm text-muted-foreground">No documents have been uploaded yet.</p>
          )}
          {(data.documents as any[]).map((doc) => (
            <div key={doc.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-4">
              <div className="min-w-0">
                <p className="font-medium">
                  {doc.providerName} · {doc.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {String(doc.doc_type).replace(/_/g, " ")} · sent {when(doc.submitted_at)}
                  {doc.expires_on ? ` · expires ${day(doc.expires_on)}` : ""}
                </p>
                {doc.review_note && (
                  <p className="mt-1 text-xs text-muted-foreground">Review note: {doc.review_note}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openFile(doc.file_path)}>
                  Open
                </Button>
                {canManage && doc.status === "submitted" && (
                  <>
                    <Button
                      size="sm"
                      disabled={decideDoc.isPending}
                      onClick={() => decideDoc.mutate({ id: doc.id, decision: "accepted" })}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decideDoc.isPending}
                      onClick={() => decideDoc.mutate({ id: doc.id, decision: "rejected" })}
                    >
                      Reject
                    </Button>
                  </>
                )}
                <Badge variant={tone(doc.status) as any}>{doc.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who can sign in for a provider</CardTitle>
          <CardDescription>
            Add the person's work email. They sign in with that address and see only their own
            company's submissions — no client or fund records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage && (
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Provider</Label>
                <Select
                  value={contact.providerId}
                  onValueChange={(v) => setContact({ ...contact, providerId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data.providers as any[]).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                  placeholder="name@provider.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={contact.contactName}
                  onChange={(e) => setContact({ ...contact, contactName: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  disabled={!contact.providerId || !contact.email || addContact.isPending}
                  onClick={() =>
                    addContact.mutate({
                      providerId: contact.providerId,
                      email: contact.email,
                      contactName: contact.contactName || null,
                      title: contact.title || null,
                      active: true,
                    })
                  }
                >
                  Give access
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {(data.contacts as any[]).length === 0 && (
              <p className="text-sm text-muted-foreground">No provider contacts yet.</p>
            )}
            {(data.contacts as any[]).map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {c.contact_name || c.email} · {c.providerName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.email}
                    {c.user_id ? " · has signed in" : " · invited, not signed in yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === "active" ? "default" : "outline"}>{c.status}</Badge>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={addContact.isPending}
                      onClick={() =>
                        addContact.mutate({
                          providerId: c.provider_id,
                          email: c.email,
                          contactName: c.contact_name,
                          title: c.title,
                          active: c.status !== "active",
                        })
                      }
                    >
                      {c.status === "active" ? "Remove access" : "Restore access"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ActivityPanel
        areas={["provider submission", "provider document", "provider access"]}
        title="Provider activity"
        description="Every submission, decision and access change, with who did it and when."
      />
    </div>
  );
}
