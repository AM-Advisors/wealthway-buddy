import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OfferingDocumentFile } from "@/components/offering-document-file";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteOfferingDocument,
  listManagedFundDocuments,
  saveOfferingDocument,
} from "@/lib/offerings.functions";

export const Route = createFileRoute("/_authenticated/manager/documents")({
  head: () => ({
    meta: [
      { title: "Fund Documents — Harmonious Manager" },
      {
        name: "description",
        content:
          "Fund managers add, edit and order the offering documents investors read and sign for the funds they manage.",
      },
      { property: "og:title", content: "Fund Documents — Harmonious Manager" },
      {
        property: "og:description",
        content: "Manage the offering documents for your funds in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerDocumentsPage,
});

type Draft = {
  id?: string;
  title: string;
  doc_type: string;
  body: string;
  requires_signature: boolean;
  sort_order: number;
};

const emptyDraft = (sortOrder: number): Draft => ({
  title: "",
  doc_type: "subscription_agreement",
  body: "",
  requires_signature: true,
  sort_order: sortOrder,
});

function ManagerDocumentsPage() {
  const load = useServerFn(listManagedFundDocuments);
  const save = useServerFn(saveOfferingDocument);
  const remove = useServerFn(deleteOfferingDocument);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["managed-fund-documents"],
    queryFn: () => load(),
    retry: false,
  });

  const [fundId, setFundId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const offerings = (data?.offerings ?? []) as any[];
  const activeFund = useMemo(
    () => offerings.find((o) => o.id === fundId) ?? offerings[0],
    [offerings, fundId],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["managed-fund-documents"] });

  const saveMutation = useMutation({
    mutationFn: (input: Draft) =>
      save({ data: { ...input, offering_id: activeFund.id } }),
    onSuccess: () => {
      toast.success("Document saved.");
      setDraft(null);
      void invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save that document."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed.");
      void invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not remove that document."),
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  if (error || !data || offerings.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">No funds to manage</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Fund documents are available once a fund has been assigned to you.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to your dashboard</Link>
        </Button>
      </main>
    );
  }

  const documents = (activeFund?.documents ?? []) as any[];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Fund documents</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add and edit the documents investors read and sign. Every change is recorded in the
            fund's change history.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/manager">Back to my funds</Link>
        </Button>
      </div>

      <div className="mt-6 max-w-sm space-y-2">
        <Label>Fund</Label>
        <Select value={activeFund?.id ?? ""} onValueChange={setFundId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a fund" />
          </SelectTrigger>
          <SelectContent>
            {offerings.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {activeFund && (
        <div className="mt-8">
          <TemplatePackPicker
            offeringId={activeFund.id}
            offeringName={activeFund.name}
            onApplied={invalidate}
          />
        </div>
      )}



      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Documents</CardTitle>
          <Button size="sm" onClick={() => setDraft(emptyDraft(documents.length))}>
            Add a document
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This fund has no documents yet. Add the first one.
            </p>
          )}
          {documents.map((doc) => (
            <div key={doc.id} className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.doc_type} · position {doc.sort_order}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {doc.requires_signature && <Badge variant="secondary">Needs signature</Badge>}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      id: doc.id,
                      title: doc.title,
                      doc_type: doc.doc_type,
                      body: doc.body,
                      requires_signature: Boolean(doc.requires_signature),
                      sort_order: doc.sort_order ?? 0,
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(doc.id)}
                >
                  Remove
                </Button>
              </div>
              </div>
              <OfferingDocumentFile
                documentId={doc.id}
                offeringId={activeFund.id}
                fileName={doc.file_name}
                fileSizeBytes={doc.file_size_bytes}
                canEdit
                onChanged={() => void invalidate()}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {draft && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{draft.id ? "Edit document" : "New document"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="doc-title">Title</Label>
                <Input
                  id="doc-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Subscription Agreement"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-type">Type</Label>
                <Input
                  id="doc-type"
                  value={draft.doc_type}
                  onChange={(e) => setDraft({ ...draft, doc_type: e.target.value })}
                  placeholder="subscription_agreement"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-order">Position</Label>
                <Input
                  id="doc-order"
                  type="number"
                  min={0}
                  value={draft.sort_order}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <label className="flex items-end gap-3 pb-2 text-sm">
                <Checkbox
                  checked={draft.requires_signature}
                  onCheckedChange={(v) => setDraft({ ...draft, requires_signature: Boolean(v) })}
                />
                <span>Investors must sign this document</span>
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-body">Document text</Label>
              <Textarea
                id="doc-body"
                rows={14}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Paste the full document text investors will read and sign."
              />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={saveMutation.isPending || draft.title.trim().length < 2}
                onClick={() => saveMutation.mutate(draft)}
              >
                {saveMutation.isPending ? "Saving…" : "Save document"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
