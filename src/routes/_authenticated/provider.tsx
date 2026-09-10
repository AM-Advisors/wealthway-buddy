import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  DOCUMENT_TYPES,
  PROVIDER_BUCKET,
  getProviderFileUrl,
  getProviderPortal,
  submitProviderDocument,
  submitProviderExpense,
  withdrawProviderExpense,
} from "@/lib/provider-portal.functions";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/provider")({
  head: () => ({
    meta: [
      { title: "Provider Portal — Harmonious" },
      {
        name: "description",
        content:
          "Submit your costs and documents to Harmonious and follow where each one stands, from sent to accepted.",
      },
      { property: "og:title", content: "Provider Portal — Harmonious" },
      {
        property: "og:description",
        content: "Send costs and documents to Harmonious and track their status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderPortal,
});

const money = (cents: number, currency = "USD") =>
  (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency });

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

const day = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("en-US") : "—");

const STATUS_LABEL: Record<string, string> = {
  submitted: "Waiting for review",
  accepted: "Accepted",
  declined: "Declined",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};

const tone = (status: string) =>
  status === "accepted"
    ? "default"
    : status === "declined" || status === "rejected"
      ? "destructive"
      : status === "withdrawn"
        ? "outline"
        : "secondary";

const emptyExpense = {
  description: "",
  amount: "",
  currency: "USD",
  incurredOn: new Date().toISOString().slice(0, 10),
  reference: "",
  note: "",
};

const emptyDoc = { title: "", docType: "invoice", expiresOn: "", note: "" };

function ProviderPortal() {
  const load = useServerFn(getProviderPortal);
  const submitExpense = useServerFn(submitProviderExpense);
  const withdraw = useServerFn(withdrawProviderExpense);
  const submitDoc = useServerFn(submitProviderDocument);
  const fileUrl = useServerFn(getProviderFileUrl);
  const queryClient = useQueryClient();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [expense, setExpense] = useState({ ...emptyExpense });
  const [expenseFile, setExpenseFile] = useState<File | null>(null);
  const [doc, setDoc] = useState({ ...emptyDoc });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["provider-portal", providerId],
    queryFn: () => load({ data: { providerId } }),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["provider-portal"] });

  const upload = async (file: File, provider: string, folder: string) => {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${provider}/${folder}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from(PROVIDER_BUCKET).upload(path, file);
    if (error) throw new Error(error.message);
    return path;
  };

  const sendExpense = useMutation({
    mutationFn: async () => {
      const provider = data?.provider?.id as string;
      const amountCents = Math.round(Number(expense.amount) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("Enter an amount.");
      const filePath = expenseFile ? await upload(expenseFile, provider, "invoices") : null;
      return submitExpense({
        data: {
          providerId: provider,
          description: expense.description,
          amountCents,
          currency: expense.currency || "USD",
          incurredOn: expense.incurredOn,
          reference: expense.reference || null,
          note: expense.note || null,
          filePath,
        },
      });
    },
    onSuccess: () => {
      toast.success("Sent to Harmonious for review.");
      setExpense({ ...emptyExpense });
      setExpenseFile(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't send."),
  });

  const sendDoc = useMutation({
    mutationFn: async () => {
      const provider = data?.provider?.id as string;
      if (!docFile) throw new Error("Choose a file to upload.");
      const filePath = await upload(docFile, provider, "documents");
      return submitDoc({
        data: {
          providerId: provider,
          title: doc.title || docFile.name,
          docType: doc.docType,
          filePath,
          fileName: docFile.name,
          expiresOn: doc.expiresOn || null,
          note: doc.note || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Document uploaded.");
      setDoc({ ...emptyDoc });
      setDocFile(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't upload."),
  });

  const pullBack = useMutation({
    mutationFn: (id: string) => withdraw({ data: { id } }),
    onSuccess: () => {
      toast.success("Withdrawn.");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't go through."),
  });

  const openFile = async (path: string) => {
    try {
      setBusy(true);
      const { url } = await fileUrl({ data: { path } });
      if (url) window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "That file isn't available.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading your provider account…</p>
      </main>
    );
  }

  if (!data?.provider) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl">Provider portal</h1>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">No provider account linked yet</CardTitle>
            <CardDescription>
              This portal is for third parties Harmonious works with. Your sign-in isn't linked to a
              provider yet — ask your Harmonious contact to add your work email.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const provider = data.provider as any;
  const providers = (data.providers ?? []) as any[];
  const submissions = (data.submissions ?? []) as any[];
  const documents = (data.documents ?? []) as any[];
  const waiting = submissions.filter((s) => s.status === "submitted").length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{provider.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Send Harmonious the costs you've incurred and the documents we hold on file, and follow
            where each one stands. Harmonious reviews everything before it is recorded or passed on
            to a client.
          </p>
        </div>
        {providers.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={p.id === provider.id ? "default" : "outline"}
                onClick={() => setProviderId(p.id)}
              >
                {p.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Waiting for review</CardDescription>
            <CardTitle className="text-2xl">{waiting}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Costs sent</CardDescription>
            <CardTitle className="text-2xl">{submissions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Documents on file</CardDescription>
            <CardTitle className="text-2xl">{documents.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="costs" className="mt-8">
        <TabsList>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="costs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submit a cost</CardTitle>
              <CardDescription>
                Attach the invoice if you have one. Harmonious decides which client the cost belongs
                to — you don't need to tell us.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">What was it for</Label>
                <Input
                  value={expense.description}
                  onChange={(e) => setExpense({ ...expense, description: e.target.value })}
                  placeholder="Filing fee, identity checks, registered agent…"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expense.amount}
                  onChange={(e) => setExpense({ ...expense, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date incurred</Label>
                <Input
                  type="date"
                  value={expense.incurredOn}
                  onChange={(e) => setExpense({ ...expense, incurredOn: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Your reference</Label>
                <Input
                  value={expense.reference}
                  onChange={(e) => setExpense({ ...expense, reference: e.target.value })}
                  placeholder="Invoice number or matter reference"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Invoice file (optional)</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setExpenseFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Anything we should know</Label>
                <Textarea
                  value={expense.note}
                  onChange={(e) => setExpense({ ...expense, note: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  disabled={!expense.description || !expense.amount || sendExpense.isPending}
                  onClick={() => sendExpense.mutate()}
                >
                  {sendExpense.isPending ? "Sending…" : "Send for review"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your costs</CardTitle>
              <CardDescription>
                You can withdraw anything still waiting for review. Once reviewed, the decision and
                any note from Harmonious appear here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {submissions.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
              )}
              {submissions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-4">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {money(s.amount_cents, s.currency)} · {s.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Incurred {day(s.incurred_on)} · sent {when(s.submitted_at)}
                      {s.reference ? ` · ref ${s.reference}` : ""}
                    </p>
                    {s.review_note && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        From Harmonious: {s.review_note}
                      </p>
                    )}
                    {s.reviewed_at && (
                      <p className="text-xs text-muted-foreground">Reviewed {when(s.reviewed_at)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.file_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => openFile(s.file_path)}
                      >
                        Open file
                      </Button>
                    )}
                    {s.status === "submitted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pullBack.isPending}
                        onClick={() => pullBack.mutate(s.id)}
                      >
                        Withdraw
                      </Button>
                    )}
                    <Badge variant={tone(s.status) as any}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload a document</CardTitle>
              <CardDescription>
                Contracts, insurance certificates, tax forms and security reports. Files are private
                to your company and the Harmonious team.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input
                  value={doc.title}
                  onChange={(e) => setDoc({ ...doc, title: e.target.value })}
                  placeholder="2026 certificate of insurance"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={doc.docType} onValueChange={(v) => setDoc({ ...doc, docType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expires (optional)</Label>
                <Input
                  type="date"
                  value={doc.expiresOn}
                  onChange={(e) => setDoc({ ...doc, expiresOn: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">File</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="md:col-span-2">
                <Button disabled={!docFile || sendDoc.isPending} onClick={() => sendDoc.mutate()}>
                  {sendDoc.isPending ? "Uploading…" : "Upload"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
              )}
              {documents.map((d) => (
                <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(d.doc_type).replace(/_/g, " ")} · sent {when(d.submitted_at)}
                      {d.expires_on ? ` · expires ${day(d.expires_on)}` : ""}
                    </p>
                    {d.review_note && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        From Harmonious: {d.review_note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => openFile(d.file_path)}
                    >
                      Open
                    </Button>
                    <Badge variant={tone(d.status) as any}>{STATUS_LABEL[d.status] ?? d.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-xs text-muted-foreground">
        Harmonious coordinates third-party providers and keeps the records. Submitting a cost here is
        a request for Harmonious to record it; it is not an instruction to pay, and Harmonious does
        not hold funds as a bank, custodian or escrow agent.
      </p>
    </main>
  );
}
