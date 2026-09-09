import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestorUploads } from "@/components/investor-uploads";
import { getFundLegalDocuments } from "@/lib/document-templates.functions";
import {
  downloadOfferingDocument,
  getOfferingDocumentFileUrl,
} from "@/lib/offering-files.functions";

export const Route = createFileRoute("/_authenticated/fund-documents")({
  head: () => ({
    meta: [
      { title: "Fund Legal Documents — Harmonious Investor Portal" },
      {
        name: "description",
        content:
          "Read the partnership, subscription and offering documents for your fund, and send back your own paperwork, before you confirm a commitment.",
      },
      { property: "og:title", content: "Fund Legal Documents — Harmonious Investor Portal" },
      {
        property: "og:description",
        content: "Every legal document for your fund in one place, before you commit capital.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundDocumentsPage,
});

function fileSize(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function typeLabel(value: string) {
  return value.replace(/_/g, " ");
}

function FundDocumentsPage() {
  const load = useServerFn(getFundLegalDocuments);
  const fileUrl = useServerFn(getOfferingDocumentFileUrl);
  const asPdf = useServerFn(downloadOfferingDocument);

  const [fundId, setFundId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fund-legal-documents", fundId],
    queryFn: () => load({ data: { offering_id: fundId } }),
  });

  async function openFile(documentId: string) {
    setBusyId(documentId);
    try {
      const res = await fileUrl({ data: { documentId } });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that document.");
    } finally {
      setBusyId(null);
    }
  }

  async function openPdf(documentId: string) {
    setBusyId(documentId);
    try {
      const res: any = await asPdf({ data: { document_id: documentId } });
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = res.filename ?? "document.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare that document.");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  const funds = data?.funds ?? [];
  const selected = data?.selected ?? null;
  const documents = data?.documents ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Fund legal documents</h1>
        <p className="text-sm text-muted-foreground">
          Read everything here before you confirm how much you are committing. You can also send
          back your own paperwork from this page.
        </p>
      </header>

      {funds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            You are not attached to a fund yet. Once your invitation is accepted, the fund's
            documents will appear here.
          </CardContent>
        </Card>
      ) : (
        <>
          {funds.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {funds.map((fund) => (
                <Button
                  key={fund.id}
                  variant={selected?.id === fund.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFundId(fund.id)}
                >
                  {fund.name}
                </Button>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{selected?.name ?? "Your fund"}</CardTitle>
              <CardDescription>
                {documents.length} document{documents.length === 1 ? "" : "s"} for this fund
                {selected?.reg_type ? ` · Reg D ${selected.reg_type}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Your fund manager has not published documents for this fund yet.
                </p>
              )}
              {documents.map((doc) => (
                <div key={doc.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {typeLabel(doc.doc_type)}
                        {doc.file_name ? ` · ${doc.file_name}` : ""}
                        {fileSize(doc.file_size_bytes) ? ` · ${fileSize(doc.file_size_bytes)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {doc.signed_at ? (
                        <Badge>Signed</Badge>
                      ) : doc.requires_signature ? (
                        <Badge variant="secondary">Needs your signature</Badge>
                      ) : (
                        <Badge variant="outline">For reading</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === doc.id}
                        onClick={() => (doc.has_file ? openFile(doc.id) : openPdf(doc.id))}
                      >
                        {doc.has_file ? "Open file" : "Download"}
                      </Button>
                    </div>
                  </div>
                  {doc.body && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {doc.body.length > 600 ? `${doc.body.slice(0, 600)}…` : doc.body}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ready to commit?</CardTitle>
              <CardDescription>
                {data?.subscriptionConfirmed
                  ? "You have already confirmed your commitment for this fund."
                  : "Once you have read the documents above, confirm the amount you are subscribing for."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/subscription">
                  {data?.subscriptionConfirmed ? "Review your commitment" : "Confirm your commitment"}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/documents">Go to signing</Link>
              </Button>
            </CardContent>
          </Card>

          <InvestorUploads />
        </>
      )}
    </main>
  );
}
