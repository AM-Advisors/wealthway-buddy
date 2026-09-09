import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  getInvestorDocuments,
  type InvestorDocumentRow,
} from "@/lib/portal.functions";
import { getSignedDocumentUrl } from "@/lib/documents.functions";
import { downloadOfferingDocument } from "@/lib/offering-documents.functions";
import { savePdf } from "@/lib/download-pdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Fund Documents — Harmonious" },
      {
        name: "description",
        content:
          "Review the documents required for your Harmonious fund subscription and see which are pending signature and which are complete.",
      },
      { property: "og:title", content: "Fund Documents — Harmonious" },
      {
        property: "og:description",
        content: "Track which fund documents still need your signature and download completed ones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentsPage,
});

const STATUS_LABEL: Record<InvestorDocumentRow["status"], string> = {
  not_started: "Not started",
  awaiting_signature: "Awaiting signature",
  in_progress: "Out for signature",
  completed: "Completed",
  reference: "For your records",
};

function tone(status: InvestorDocumentRow["status"]) {
  if (status === "completed") return "default" as const;
  if (status === "not_started" || status === "awaiting_signature") return "secondary" as const;
  return "outline" as const;
}

function when(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function docType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DocumentsPage() {
  const fetchDocuments = useServerFn(getInvestorDocuments);
  const download = useServerFn(getSignedDocumentUrl);
  const getPdf = useServerFn(downloadOfferingDocument);
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["investor-documents"],
    queryFn: () => fetchDocuments(),
  });

  async function openSigned(signatureId: string) {
    setBusy(signatureId);
    try {
      const res = await download({ data: { signature_id: signatureId } });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that document.");
    } finally {
      setBusy(null);
    }
  }

  async function openCopy(documentId: string) {
    setBusy(documentId);
    try {
      const res = await getPdf({ data: { document_id: documentId } });
      savePdf(res.filename, res.base64);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare that PDF.");
    } finally {
      setBusy(null);
    }
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-4 w-80" />
        <Skeleton className="mt-8 h-48 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl">Your fund documents</h1>
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              We couldn't load your documents just now.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => query.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = query.data;
  const documents = data?.documents ?? [];

  if (!data?.application) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl">Your fund documents</h1>
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Once you select a fund and start onboarding, the documents you need to review and sign
              will appear here.
            </p>
            <Button asChild className="mt-4">
              <Link to="/onboarding/kyc">Start onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const required = documents.filter((d) => d.requires_signature);
  const complete = required.filter((d) => d.status === "completed");
  const pending = required.filter((d) => d.status !== "completed");
  const reference = documents.filter((d) => !d.requires_signature);
  const pct = required.length === 0 ? 0 : Math.round((complete.length / required.length) * 100);
  const allDone = required.length > 0 && pending.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header>
        <p className="text-sm text-muted-foreground">{data.offering?.name ?? "Your fund"}</p>
        <h1 className="text-2xl md:text-3xl">Your fund documents</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything required for your subscription, and where each one stands.
        </p>
        {required.length > 0 ? (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm">
              <span>
                {complete.length} of {required.length} documents complete
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="mt-2" />
          </div>
        ) : null}
      </header>

      {documents.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Documents for this fund haven't been published yet. We'll email you as soon as they're
              ready.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <Section
          title="Action needed"
          description="These require your signature before funding."
          rows={pending}
          busy={busy}
          onSigned={openSigned}
          onCopy={openCopy}
          primaryTo="/onboarding/documents"
        />
      ) : null}

      {complete.length > 0 ? (
        <Section
          title="Completed"
          description="Signed and stored securely in your investor record."
          rows={complete}
          busy={busy}
          onSigned={openSigned}
          onCopy={openCopy}
        />
      ) : null}

      {reference.length > 0 ? (
        <Section
          title="For your records"
          description="Read these carefully — no signature required."
          rows={reference}
          busy={busy}
          onSigned={openSigned}
          onCopy={openCopy}
        />
      ) : null}

      {allDone ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Documents complete</CardTitle>
            <CardDescription>
              Your signed documents are on file. The next step is funding your commitment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/onboarding/funding">Continue to funding</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <InvestorUploads />



      <p className="mt-8 text-xs text-muted-foreground">
        Download links expire after a few minutes for your security.{" "}
        <Link to="/dashboard" className="underline">
          Back to your dashboard
        </Link>
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  rows,
  busy,
  onSigned,
  onCopy,
  primaryTo,
}: {
  title: string;
  description: string;
  rows: InvestorDocumentRow[];
  busy: string | null;
  onSigned: (id: string) => void;
  onCopy: (id: string) => void;
  primaryTo?: string;
}) {
  return (
    <section className="mt-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {rows.map((doc) => {
              const stamp = doc.completed_at ?? doc.last_activity_at;
              return (
                <li
                  key={doc.document_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {docType(doc.doc_type)}
                      {doc.status === "completed" && doc.signer_name
                        ? ` · Signed by ${doc.signer_name}`
                        : ""}
                      {stamp ? ` · ${when(stamp)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={tone(doc.status)}>{STATUS_LABEL[doc.status]}</Badge>
                    {doc.status === "completed" && doc.downloadable && doc.signature_id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === doc.signature_id}
                        onClick={() => onSigned(doc.signature_id as string)}
                      >
                        {busy === doc.signature_id ? "Opening…" : "Download signed"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === doc.document_id}
                        onClick={() => onCopy(doc.document_id)}
                      >
                        {busy === doc.document_id ? "Preparing…" : "View copy"}
                      </Button>
                    )}
                    {primaryTo ? (
                      <Button asChild size="sm">
                        <Link to={primaryTo}>Review &amp; sign</Link>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
