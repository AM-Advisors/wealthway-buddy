import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getPortal } from "@/lib/portal.functions";
import { getSignedDocumentUrl, signDocument } from "@/lib/documents.functions";
import { downloadOfferingDocument } from "@/lib/offering-documents.functions";
import { savePdf } from "@/lib/download-pdf";
import { startIdentityCheck } from "@/lib/didit.functions";
import {
  getSigningProvider,
  refreshBoxSignatures,
  startBoxSigning,
} from "@/lib/box-sign.functions";

import { PortalMessageThread } from "@/components/portal-message-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountSwitcher } from "@/components/account-switcher";
import { MyServiceRequests } from "@/components/service-request-signing";
import { ClientOffboardingPanel } from "@/components/client-offboarding-panel";
import { ClientInvoicesPanel } from "@/components/client-invoices-panel";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({
    meta: [
      { title: "Investor Portal — Harmonious" },
      {
        name: "description",
        content:
          "Your Harmonious investor portal: review your subscription status, compliance checks, funding details and download your signed fund documents.",
      },
      { property: "og:title", content: "Investor Portal — Harmonious" },
      {
        property: "og:description",
        content: "Application status, funding details and signed fund documents in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Portal,
});

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  pending: "Pending",
  in_progress: "In progress",
  review: "In review",
  approved: "Approved",
  declined: "Declined",
  awaiting_wire: "Awaiting wire",
  processing: "Processing",
  settled: "Received",
  returned: "Returned",
  cancelled: "Cancelled",
  funded: "Funded",
  draft: "Draft",
};

function label(value: string | null | undefined) {
  if (!value) return "Not started";
  return STATUS_LABEL[value] ?? value.replace(/_/g, " ");
}

function tone(value: string | null | undefined) {
  if (value === "approved" || value === "settled" || value === "funded") return "default" as const;
  if (value === "declined" || value === "returned" || value === "cancelled") return "destructive" as const;
  return "secondary" as const;
}

function money(cents: number | null | undefined) {
  if (!cents && cents !== 0) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function Portal() {
  const load = useServerFn(getPortal);
  const download = useServerFn(getSignedDocumentUrl);
  const startCheck = useServerFn(startIdentityCheck);
  const [busy, setBusy] = useState<string | null>(null);
  const getPdf = useServerFn(downloadOfferingDocument);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const downloadPdf = async (documentId: string) => {
    setPdfBusy(documentId);
    try {
      const res = await getPdf({ data: { document_id: documentId } });
      savePdf(res.filename, res.base64);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not prepare the PDF.");
    } finally {
      setPdfBusy(null);
    }
  };
  const [starting, setStarting] = useState(false);
  const sign = useServerFn(signDocument);
  const startBox = useServerFn(startBoxSigning);
  const refreshBox = useServerFn(refreshBoxSignatures);
  const providerQuery = useQuery({
    queryKey: ["signing-provider"],
    queryFn: () => getSigningProvider(),
    staleTime: 5 * 60 * 1000,
  });
  const [signerName, setSignerName] = useState("");
  const [initials, setInitials] = useState("");
  const [consent, setConsent] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);

  // Which fund the investor is looking at, when they are in more than one.
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["portal", selectedApp],
    queryFn: () => load({ data: { applicationId: selectedApp } }),
    // Keep polling while any check is still moving so webhook results appear live.
    refetchInterval: (query) => {
      const app = query.state.data?.application;
      if (!app) return false;
      const open = [app.kyc_status, app.aml_status].some(
        (s) => s === "pending" || s === "review" || s === "not_started",
      );
      return open ? 8000 : false;
    },
    refetchOnWindowFocus: true,
  });

  async function startVerification() {
    setStarting(true);
    try {
      const res = await startCheck({});
      window.open(res.url, "_blank", "noopener,noreferrer");
      toast.success("Verification opened in a new tab. This page updates as soon as it completes.");
      void refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start identity verification.");
    } finally {
      setStarting(false);
    }
  }

  async function openDocument(signatureId: string) {
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

  const app = data?.application;
  const documents = data?.documents ?? [];

  useEffect(() => {
    const legal = data?.profile?.legal_name;
    if (!legal) return;
    setSignerName((n) => n || legal);
    setInitials(
      (i) =>
        i ||
        legal
          .split(/\s+/)
          .map((p) => p[0] ?? "")
          .join("")
          .toUpperCase(),
    );
  }, [data?.profile?.legal_name]);

  const signatureByDoc = new Map(documents.map((d) => [d.offering_document_id, d]));
  const completedDocIds = new Set(
    documents
      .filter((d) => d.provider !== "box_sign" || d.provider_status === "completed")
      .map((d) => d.offering_document_id),
  );
  const signableDocs = (data?.offeringDocuments ?? []).filter((d: any) => d.requires_signature);
  const pendingDocs = signableDocs.filter((d: any) => !completedDocIds.has(d.id));
  const hasSubscription = Boolean(data?.subscription?.commitment_cents);
  const useBox = providerQuery.data?.provider === "box_sign";
  const awaitingBox = documents.some(
    (d) => d.provider === "box_sign" && d.provider_status === "out_for_signature",
  );

  // While a document sits with Box, pull its status so the page settles on its own.
  useEffect(() => {
    if (!awaitingBox) return;
    const timer = setInterval(async () => {
      try {
        const res = await refreshBox({});
        if (res.updated > 0) await refetch();
      } catch {
        /* transient; the webhook is the primary path */
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [awaitingBox, refreshBox, refetch]);


  async function onSign(documentId: string) {
    if (!consent) {
      toast.error("Please tick the electronic signature consent first.");
      return;
    }
    setSigningId(documentId);
    try {
      if (useBox) {
        const res = await startBox({ data: { offering_document_id: documentId } });
        if (res.url) {
          window.open(res.url, "_blank", "noopener,noreferrer");
          toast.success("Box Sign opened in a new tab. This page updates the moment you finish.");
        } else {
          toast.success("The document was emailed to you for signature from Box Sign.");
        }
        await refetch();
        return;
      }

      if (!signerName.trim()) {
        toast.error("Enter your full legal name.");
        return;
      }
      await sign({
        data: {
          offering_document_id: documentId,
          signer_name: signerName.trim(),
          signature_type: "typed",
          signature_value: signerName.trim(),
          initials: initials.trim(),
          consent_electronic: true,
        },
      });
      toast.success("Signed. Your countersigned copy is being prepared.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign that document.");
    } finally {
      setSigningId(null);
    }
  }




  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Investor portal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data?.profile?.legal_name ? `${data.profile.legal_name} — ` : ""}
            {data?.offering?.name ?? "Your fund subscription"}
            {data?.offering?.reg_type ? ` (Reg D ${data.offering.reg_type})` : ""}
          </p>
        </div>
        <AccountSwitcher className="mt-3" />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/apply">Apply to a fund</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">Continue onboarding</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading your application…</p>
      ) : !app ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">No application yet</CardTitle>
            <CardDescription>Start your subscription to see status and documents here.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link to="/onboarding/kyc">Begin your application</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PortalHomeLink
              title="Wire confirmation"
              description="Tell the fund your wire is on its way."
              to="/wire-confirmation"
            />
            <PortalHomeLink
              title="Messages"
              description="A private line to the fund team."
              href="#portal-messages"
            />
            {app.offering_id ? (
              <PortalHomeLink
                title="Cap table"
                description="Your ownership in the fund's room."
                to="/diligence/$offeringId"
                params={{ offeringId: app.offering_id as string }}
              />
            ) : null}
            <PortalHomeLink
              title="Portfolio value"
              description="What your shares are worth today."
              to="/my-portfolio"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your fund commitments</CardTitle>
              <CardDescription>
                {(data?.commitments?.length ?? 0) > 1
                  ? "Choose a fund to see its steps, documents and funding below."
                  : "What you have committed and how much has arrived."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.commitments ?? []).map((c) => {
                const active = c.application_id === app.id;
                return (
                  <button
                    key={c.application_id}
                    type="button"
                    onClick={() => setSelectedApp(c.application_id)}
                    className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-left transition ${
                      active ? "border-primary bg-muted/50" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {c.offering_name}
                        {c.reg_type ? ` (Reg D ${c.reg_type})` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Committed {money(c.commitment_cents)} · Received{" "}
                        {money(c.funded_cents)}
                      </p>
                    </div>
                    <Badge variant={tone(c.status)}>{label(c.status)}</Badge>
                  </button>
                );
              })}
              {(data?.commitments?.length ?? 0) > 1 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  Total committed{" "}
                  {money(
                    (data?.commitments ?? []).reduce(
                      (sum, c) => sum + (c.commitment_cents ?? 0),
                      0,
                    ),
                  )}{" "}
                  · Total received{" "}
                  {money((data?.commitments ?? []).reduce((sum, c) => sum + c.funded_cents, 0))}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Subscription</CardTitle>
                <CardDescription>Overall status of your commitment.</CardDescription>
              </div>
              <Badge variant={tone(app.status)}>{label(app.status)}</Badge>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail term="Commitment" value={money(data?.subscription?.commitment_cents)} />
              <Detail term="Title held as" value={data?.subscription?.ownership_title ?? "—"} />
              <Detail
                term="Funding method"
                value={data?.payment?.method ? data.payment.method.toUpperCase() : "Not chosen"}
              />
              <Detail term="Reference code" value={data?.payment?.reference_code ?? "—"} />
              <Detail term="Funds" value={label(data?.payment?.status ?? app.funding_status)} />
              <Detail
                term="Confirmed"
                value={
                  data?.payment?.confirmed_at
                    ? new Date(data.payment.confirmed_at).toLocaleDateString()
                    : "—"
                }
              />
            </CardContent>
          </Card>

          <IdentityVerificationCard
            kycStatus={app.kyc_status}
            hasSession={Boolean(data?.kyc?.session_url)}
            starting={starting}
            onStart={startVerification}
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Fund manager approval</CardTitle>
                <CardDescription>
                  Your fund manager gives your file a final look before funding opens.
                </CardDescription>
              </div>
              <Badge variant={tone((app as any).manager_review_status)}>
                {(app as any).manager_review_status === "approved"
                  ? "Approved"
                  : (app as any).manager_review_status === "declined"
                    ? "Sent back"
                    : "In review"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {(app as any).manager_review_status === "approved"
                  ? "Your application is approved. You can send your funds when you're ready."
                  : (app as any).manager_review_status === "declined"
                    ? "Your fund manager needs something changed before approving your application."
                    : "Nothing to do right now — we'll email you the moment it's approved."}
              </p>
              {(app as any).manager_review_notes && (
                <p>Message from your fund manager: {(app as any).manager_review_notes}</p>
              )}
              {(app as any).manager_reviewed_at && (
                <p className="text-xs text-muted-foreground">
                  Reviewed {new Date((app as any).manager_reviewed_at).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Questions for you</CardTitle>
              <CardDescription>
                Questions your fund manager has assigned to you as part of due diligence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(data?.questions ?? []).length === 0 ? (
                <p className="text-muted-foreground">No questions have been assigned to you.</p>
              ) : (
                <>
                  {(data?.questions ?? []).map((q: any) => (
                    <div
                      key={q.assignment_id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{q.prompt}</p>
                        <p className="text-xs text-muted-foreground">
                          {q.category ? `${String(q.category).replace(/_/g, " ")} · ` : ""}
                          {q.is_required ? "required" : "optional"}
                          {q.due_date ? ` · due ${new Date(q.due_date).toLocaleDateString()}` : ""}
                          {q.answered_at
                            ? ` · answered ${new Date(q.answered_at).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                      <Badge
                        variant={
                          q.status === "accepted"
                            ? "default"
                            : q.status === "needs_followup"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {q.status === "accepted"
                          ? "Accepted"
                          : q.status === "answered"
                            ? "Answered"
                            : q.status === "needs_followup"
                              ? "Needs more"
                              : "Waiting on you"}
                      </Badge>
                    </div>
                  ))}
                  {app.offering_id && (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to="/diligence/$offeringId"
                        params={{ offeringId: app.offering_id as string }}
                      >
                        Answer in the due diligence room
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your wire confirmations</CardTitle>
              <CardDescription>
                What you told us you sent, and where each one stands with the fund team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(data?.wireConfirmations ?? []).length === 0 ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground">
                    No wire confirmation submitted yet. Send one once your funds are on their way.
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/wire-confirmation">Submit a wire confirmation</Link>
                  </Button>
                </div>
              ) : (
                (data?.wireConfirmations ?? []).map((w: any) => (
                  <div key={w.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium">
                        {money(w.amount_cents)}
                        {w.sent_on ? ` sent ${new Date(w.sent_on).toLocaleDateString()}` : ""}
                      </p>
                      <Badge
                        variant={
                          w.status === "approved" || w.status === "matched"
                            ? "default"
                            : w.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {w.status === "approved" || w.status === "matched"
                          ? "Funds received"
                          : w.status === "rejected"
                            ? "Sent back"
                            : "In review"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {w.sending_bank_name ?? "Your bank"}
                      {w.sending_account_last4 ? ` ••${w.sending_account_last4}` : ""}
                      {w.bank_reference ? ` · reference ${w.bank_reference}` : ""}
                      {w.reviewed_at
                        ? ` · reviewed ${new Date(w.reviewed_at).toLocaleDateString()}`
                        : ""}
                    </p>
                    {w.review_notes && <p className="mt-1">Note: {w.review_notes}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compliance checks</CardTitle>
              <CardDescription>Updated automatically as each review completes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row title="Identity verification" status={app.kyc_status} />
              <Separator />
              <Row title="AML screening" status={app.aml_status} />
              <Separator />
              <Row title="Accreditation" status={app.accreditation_status} />
              <Separator />
              <Row title="Fund documents" status={app.documents_status} />
              <Separator />
              <Row title="Funding" status={app.funding_status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fund documents</CardTitle>
              <CardDescription>
                The full paperwork for {data?.offering?.name ?? "your fund"}, as downloadable PDFs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.offeringDocuments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No fund documents have been published yet.
                </p>
              ) : (
                (data?.offeringDocuments ?? []).map((doc: any) => (
                  <div
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {String(doc.doc_type).replace(/_/g, " ")} ·{" "}
                        {doc.requires_signature ? "signature required" : "review only"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pdfBusy === doc.id}
                      onClick={() => downloadPdf(doc.id)}
                    >
                      {pdfBusy === doc.id ? "Preparing…" : "Download PDF"}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sign your fund documents</CardTitle>
              <CardDescription>
                {useBox
                  ? "Sign the subscription agreement and the private placement memorandum through Box Sign. Your certified copy returns here automatically, with the exact completion time on record."
                  : "Sign the subscription agreement and the private placement memorandum here before you fund. Each signature is stored with a tamper-evident hash, date and audit trail."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {signableDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No documents currently need your signature.
                </p>
              ) : !hasSubscription ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Add your commitment amount and how you'll hold title first — then you can sign
                    right here.
                  </p>
                  <Button asChild size="sm">
                    <Link to="/onboarding/documents">Add subscription details</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {!useBox && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="portal_signer">Full legal name (your signature)</Label>
                        <Input
                          id="portal_signer"
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                        />
                        <p className="font-display text-2xl">{signerName || "—"}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="portal_initials">Initials</Label>
                        <Input
                          id="portal_initials"
                          value={initials}
                          onChange={(e) => setInitials(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="portal_consent"
                      checked={consent}
                      onCheckedChange={(v) => setConsent(v === true)}
                    />
                    <Label htmlFor="portal_consent" className="text-sm font-normal leading-relaxed">
                      {useBox
                        ? "I agree to sign this agreement electronically through Box Sign, under the U.S. E-SIGN Act."
                        : "I agree to sign electronically and that my typed name is my legal signature under the U.S. E-SIGN Act."}
                    </Label>
                  </div>

                  <div className="space-y-3">
                    {signableDocs.map((doc: any) => {
                      const sig = signatureByDoc.get(doc.id);
                      const signed = completedDocIds.has(doc.id);
                      const waiting =
                        sig?.provider === "box_sign" && sig.provider_status === "out_for_signature";
                      const completedAt = sig?.provider_completed_at ?? (signed ? sig?.signed_at : null);
                      return (
                        <div
                          key={doc.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                        >
                          <div>
                            <p className="font-medium">{doc.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {String(doc.doc_type).replace(/_/g, " ")}
                            </p>
                            {signed && completedAt ? (
                              <p className="text-xs text-muted-foreground">
                                Completed {new Date(completedAt).toLocaleString()}
                              </p>
                            ) : waiting ? (
                              <p className="text-xs text-muted-foreground">
                                Waiting on your signature in Box Sign
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pdfBusy === doc.id}
                              onClick={() => downloadPdf(doc.id)}
                            >
                              {pdfBusy === doc.id ? "Preparing…" : "Read"}
                            </Button>
                            {signed ? (
                              <Badge>Signed</Badge>
                            ) : (
                              <Button
                                size="sm"
                                disabled={signingId === doc.id || !consent}
                                onClick={() => onSign(doc.id)}
                              >
                                {signingId === doc.id
                                  ? "Opening…"
                                  : waiting
                                    ? "Resume signing"
                                    : useBox
                                      ? "Sign with Box"
                                      : "Sign"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {pendingDocs.length === 0 ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-muted-foreground">
                        Everything is signed — you can fund your commitment now.
                      </p>
                      <Button asChild size="sm">
                        <Link to="/onboarding/funding">Continue to funding</Link>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {pendingDocs.length} document{pendingDocs.length === 1 ? "" : "s"} still need
                      your signature before funding.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents you sent us</CardTitle>
              <CardDescription>
                Files you uploaded for this fund and where they stand with the team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.uploads?.length ?? 0) === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You have not sent us any files for this fund yet.
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/documents">Upload a document</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {(data?.uploads ?? []).map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{u.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.doc_kind.replace(/_/g, " ")} · sent{" "}
                          {new Date(u.uploaded_at).toLocaleDateString()}
                          {u.filed_at ? " · filed in the shared folder" : ""}
                          {u.review_note ? ` · ${u.review_note}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant={
                          u.review_status === "accepted"
                            ? "default"
                            : u.review_status === "needs_followup"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {u.review_status === "accepted"
                          ? "Accepted"
                          : u.review_status === "needs_followup"
                            ? "Needs follow-up"
                            : "With the team"}
                      </Badge>
                    </div>
                  ))}
                  <Button asChild size="sm" variant="outline">
                    <Link to="/documents">Upload another</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your signed documents</CardTitle>
              <CardDescription>
                Download links open a secure copy that expires after five minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing signed yet. Signed copies appear here as soon as you complete the fund
                  documents step.
                </p>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.signature_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Signed by {doc.signer_name}
                        {doc.signed_at ? ` on ${new Date(doc.signed_at).toLocaleDateString()}` : ""}
                        {doc.document_hash ? ` · ${doc.document_hash.slice(0, 12)}…` : ""}
                      </p>
                    </div>
                    {doc.downloadable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === doc.signature_id}
                        onClick={() => openDocument(doc.signature_id)}
                      >
                        {busy === doc.signature_id ? "Preparing…" : "Download"}
                      </Button>
                    ) : (
                      <Badge variant="outline">Preparing copy</Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {app?.id ? (
            <Card id="portal-messages" className="scroll-mt-24">
              <CardHeader>
                <CardTitle>Messages</CardTitle>
                <CardDescription>
                  A private line to the fund team. Ask a question here and they reply in the portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PortalMessageThread
                  applicationId={app.id}
                  placeholder="Ask the fund team a question…"
                />
              </CardContent>
            </Card>
          ) : null}
          <ClientInvoicesPanel />
          <MyServiceRequests />
          <ClientOffboardingPanel />
        </div>
      )}
    </main>
  );
}

function PortalHomeLink({
  title,
  description,
  to,
  params,
  href,
}: {
  title: string;
  description: string;
  to?: string;
  params?: Record<string, string>;
  href?: string;
}) {
  const body = (
    <>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </>
  );
  const className =
    "block rounded-lg border p-4 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (to) {
    return (
      <Link to={to} params={params as never} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {body}
    </a>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{term}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Row({ title, status }: { title: string; status: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{title}</span>
      <Badge variant={tone(status)}>{label(status)}</Badge>
    </div>
  );
}
