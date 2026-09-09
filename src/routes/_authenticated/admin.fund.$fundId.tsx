import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getFundPage, getFundDocumentBody } from "@/lib/fund-page.functions";
import { downloadOfferingDocument, downloadOfferingPacket } from "@/lib/offering-documents.functions";
import { savePdf } from "@/lib/download-pdf";
import { OfferingDocumentFile } from "@/components/offering-document-file";
import { SignedDocumentsCard } from "@/components/signed-documents-card";
import { PacketEmailCard } from "@/components/packet-email-card";
import { Badge } from "@/components/ui/badge";
import { WireTrackingPanel } from "@/components/wire-tracking-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/fund/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund Overview — Harmonious Admin" },
      {
        name: "description",
        content:
          "One Harmonious fund at a glance: its description, offering documents and wire or ACH funding details.",
      },
      { property: "og:title", content: "Fund Overview — Harmonious Admin" },
      {
        property: "og:description",
        content: "Fund description, subscription documents and funding instructions in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundPage,
});

const WIRE_LABELS: Record<string, string> = {
  bank_name: "Receiving bank",
  bank_address: "Bank address",
  account_name: "Account name",
  account_number: "Account number",
  routing_number: "Routing number (ABA)",
  swift: "SWIFT / BIC",
  memo: "Reference / memo",
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

function FundPage() {
  const { fundId } = Route.useParams();
  const load = useServerFn(getFundPage);
  const loadBody = useServerFn(getFundDocumentBody);
  const getDocPdf = useServerFn(downloadOfferingDocument);
  const getPacket = useServerFn(downloadOfferingPacket);

  const queryClient = useQueryClient();
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-page", fundId],
    queryFn: () => load({ data: { fundId } }),
    retry: false,
  });

  const bodyQuery = useQuery({
    queryKey: ["fund-document-body", openDoc],
    queryFn: () => loadBody({ data: { documentId: openDoc as string } }),
    enabled: !!openDoc,
  });

  const downloadDoc = async (documentId: string) => {
    setBusy(documentId);
    try {
      const res = await getDocPdf({ data: { document_id: documentId } });
      savePdf(res.filename, res.base64);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not prepare that document.");
    } finally {
      setBusy(null);
    }
  };

  const downloadPacket = async () => {
    setBusy("packet");
    try {
      const res = await getPacket({ data: { offering_id: fundId } });
      savePdf(res.filename, res.base64);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not prepare the packet.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading fund…</main>;
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Fund unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "This fund is not available to your account."}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/admin/access">Back to fund access</Link>
        </Button>
      </main>
    );
  }

  const { offering, documents, wire, stats, isAdmin } = data as any;
  const wireEntries = Object.entries(WIRE_LABELS).filter(([key]) => (wire.details?.[key] ?? "").trim() !== "");

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl">{offering.name}</h1>
            <Badge variant="secondary">Reg D {offering.reg_type === "506c" ? "506(c)" : "506(b)"}</Badge>
            <Badge variant={offering.is_open ? "default" : "outline"}>
              {offering.is_open ? "Open" : "Closed"}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {offering.summary?.trim()
              ? offering.summary
              : "No fund description has been written yet. Add one in Fund setup so investors know what they are subscribing to."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/packet/$fundId" params={{ fundId }}>
              Offering packet
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/access">Fund access</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/diligence/$offeringId" params={{ offeringId: fundId }}>
              Diligence room
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/manager/diligence">Manage diligence materials</Link>
          </Button>
          {isAdmin && (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/funds">Edit in fund setup</Link>
            </Button>
          )}

        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Minimum investment" value={money(offering.min_investment_cents)} />
        <Stat
          label="Target raise"
          value={offering.target_raise_cents ? money(offering.target_raise_cents) : "Not set"}
        />
        <Stat label="Applications" value={`${stats.applications}`} note={`${stats.funded} funded`} />
        <Stat label="Committed" value={money(stats.committedCents)} note={`${money(stats.settledCents)} settled`} />
      </div>

      <div className="mt-8">
        <WireTrackingPanel offeringId={fundId} />
      </div>

      <Card className="mt-8">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Offering documents</CardTitle>
            <CardDescription>
              The paperwork investors read and sign for this fund, in the order they see it.
            </CardDescription>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" disabled={busy === "packet"} onClick={downloadPacket}>
              {busy === "packet" ? "Preparing…" : "Download full packet (PDF)"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No documents yet. Add the subscription agreement and offering memorandum in Fund setup.
            </p>
          )}
          {documents.map((doc: any) => (
            <div key={doc.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.doc_type}
                    {doc.requires_signature ? " · signature required" : " · for information"}
                    {doc.length ? ` · ${doc.length.toLocaleString("en-US")} characters` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenDoc(openDoc === doc.id ? null : doc.id)}
                  >
                    {openDoc === doc.id ? "Hide" : "Read"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === doc.id} onClick={() => downloadDoc(doc.id)}>
                    {busy === doc.id ? "Preparing…" : "PDF"}
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <OfferingDocumentFile
                  documentId={doc.id}
                  offeringId={offering.id}
                  fileName={doc.file_name}
                  fileSizeBytes={doc.file_size_bytes}
                  canEdit
                  onChanged={() => void queryClient.invalidateQueries({ queryKey: ["fund-page"] })}
                />
              </div>
              {openDoc === doc.id && (
                <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                  {bodyQuery.isLoading && "Loading document…"}
                  {bodyQuery.data?.document?.body}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mt-8">
        <SignedDocumentsCard offeringId={offering.id} />
      </div>

      <div className="mt-6">
        <PacketEmailCard fundId={offering.id} />
      </div>


      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Funding details</CardTitle>
          <CardDescription>
            The wire instructions investors see for this fund
            {wire.updatedAt ? ` · last updated ${new Date(wire.updatedAt).toLocaleDateString()}` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {wireEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No wire details saved for this fund yet. Investors cannot fund until these are added in Fund setup.
            </p>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              {wireEntries.map(([key, label]) => (
                <div key={key} className="rounded-md border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium">{wire.details[key]}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
            Harmonious never changes these details by email. Investors are told to confirm any instructions by
            phone with a known contact before sending funds.
          </p>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        {stats.investorsWithAccess} investor{stats.investorsWithAccess === 1 ? "" : "s"} granted access ·{" "}
        {stats.managers} fund manager{stats.managers === 1 ? "" : "s"} assigned.
      </p>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
