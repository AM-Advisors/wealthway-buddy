import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getPortal } from "@/lib/portal.functions";
import { getFunding } from "@/lib/funding.functions";
import { getSignedDocumentUrl } from "@/lib/documents.functions";
import { listMyUploads } from "@/lib/investor-uploads.functions";
import { downloadOfferingDocument } from "@/lib/offering-documents.functions";
import { savePdf } from "@/lib/download-pdf";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { QuickWireConfirm } from "@/components/quick-wire-confirm";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Investor Dashboard — Harmonious" },
      {
        name: "description",
        content:
          "Track your onboarding status, download your fund documents and view wire instructions for your Harmonious fund subscription.",
      },
      { property: "og:title", content: "Investor Dashboard — Harmonious" },
      {
        property: "og:description",
        content: "Onboarding status, fund documents and funding instructions in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const LABEL: Record<string, string> = {
  not_started: "Not started",
  pending: "Pending",
  in_progress: "In progress",
  review: "In review",
  approved: "Approved",
  declined: "Declined",
  awaiting_wire: "Awaiting wire",
  processing: "Processing",
  settled: "Received",
  failed: "Failed",
  returned: "Returned",
  cancelled: "Cancelled",
  funded: "Funded",
  draft: "Draft",
  submitted: "Submitted",
};

function label(v: string | null | undefined) {
  if (!v) return "Not started";
  return LABEL[v] ?? v.replace(/_/g, " ");
}

function tone(v: string | null | undefined) {
  if (v === "approved" || v === "settled" || v === "funded") return "default" as const;
  if (v === "declined" || v === "returned" || v === "cancelled" || v === "failed")
    return "destructive" as const;
  return "secondary" as const;
}

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function when(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const WIRE_CONFIRM_LABEL: Record<string, string> = {
  submitted: "Awaiting review",
  pending: "Awaiting review",
  approved: "Approved",
  rejected: "Sent back",
};

function wireConfirmTone(status: string) {
  if (status === "approved") return "default" as const;
  if (status === "rejected") return "destructive" as const;
  return "secondary" as const;
}

const WIRE_LABEL: Record<string, string> = {
  bank_name: "Bank name",
  bank_address: "Bank address",
  account_name: "Account name",
  account_number: "Account number",
  routing_number: "Routing number (ABA)",
  swift: "SWIFT / BIC",
  reference: "Reference",
  memo: "Memo",
};

function Dashboard() {
  const load = useServerFn(getPortal);
  const loadFunding = useServerFn(getFunding);
  const download = useServerFn(getSignedDocumentUrl);
  const getPdf = useServerFn(downloadOfferingDocument);
  const loadUploads = useServerFn(listMyUploads);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["portal"],
    queryFn: () => load(),
    refetchInterval: (query) => {
      const app = query.state.data?.application;
      if (!app) return false;
      const open = [app.kyc_status, app.aml_status].some(
        (s) => s === "pending" || s === "review",
      );
      return open ? 10000 : false;
    },
    refetchOnWindowFocus: true,
  });

  const { data: funding } = useQuery({
    queryKey: ["funding"],
    queryFn: () => loadFunding(),
    refetchInterval: (query) => {
      const rows = query.state.data?.wireConfirmations ?? [];
      return rows.some((r: { status: string }) => r.status === "submitted" || r.status === "pending")
        ? 10000
        : false;
    },
    refetchOnWindowFocus: true,
  });

  const { data: uploadsData } = useQuery({
    queryKey: ["my-uploads"],
    queryFn: () => loadUploads(),
    retry: false,
  });
  const myUploads = uploadsData?.uploads ?? [];

  const wireConfirmations = (funding?.wireConfirmations ?? []) as Array<{
    id: string;
    amount_cents: number;
    sent_on: string;
    sending_bank_name: string;
    sending_account_last4: string;
    bank_reference: string | null;
    investor_note: string | null;
    status: string;
    review_notes: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>;

  const hasPendingWireConfirmation = wireConfirmations.some(
    (w) => w.status === "submitted" || w.status === "pending",
  );
  const canQuickConfirm =
    funding?.payment?.method === "wire" &&
    funding?.payment?.status !== "settled" &&
    !hasPendingWireConfirmation;

  const app = data?.application;
  const documents = data?.documents ?? [];
  const offeringDocs = (data?.offeringDocuments ?? []) as Array<{
    id: string;
    title: string;
    doc_type: string;
    requires_signature: boolean;
  }>;
  const wire = data?.wireInstructions ?? {};
  const unlocked = app?.kyc_status === "approved" && app?.aml_status === "approved";
  const signatureByDoc = new Map(documents.map((d) => [d.offering_document_id, d]));

  // Plain-language tracker: everything between signing in and the money landing.
  const docsToSign = offeringDocs.filter((d) => d.requires_signature);
  const signedCount = docsToSign.filter((d) => signatureByDoc.has(d.id)).length;
  const wireApproved =
    wireConfirmations.some((w) => w.status === "approved") || funding?.payment?.status === "settled";
  const pathSteps = [
    {
      title: "Verify your identity",
      detail: "Photo ID and a quick liveness check.",
      done: app?.kyc_status === "approved",
      to: "/onboarding/kyc" as const,
      cta: "Verify",
    },
    {
      title: "Background screening",
      detail: "We run this for you — no action needed.",
      done: app?.aml_status === "approved",
      to: "/onboarding/aml" as const,
      cta: "View",
    },
    {
      title: "Confirm your accreditation",
      detail: "Answer the questionnaire and attach evidence.",
      done: app?.accreditation_status === "approved",
      to: "/onboarding/accreditation" as const,
      cta: "Continue",
    },
    {
      title: "Sign your fund documents",
      detail:
        docsToSign.length === 0
          ? "Your documents will appear here."
          : `${signedCount} of ${docsToSign.length} signed.`,
      done: docsToSign.length > 0 && signedCount === docsToSign.length,
      to: "/portal" as const,
      cta: "Sign",
    },
    {
      title: "Choose how you will send funds",
      detail: "Wire transfer or ACH debit.",
      done: Boolean(funding?.payment?.method),
      to: "/onboarding/funding" as const,
      cta: "Choose",
    },
    {
      title: "Send your wire and confirm it",
      detail: "Tell us the date, amount and sending bank.",
      done: wireConfirmations.length > 0 || funding?.payment?.status === "settled",
      to: "/wire-confirmation" as const,
      cta: "Confirm wire",
    },
    {
      title: "Funds received",
      detail: "We confirm the money has landed in the fund account.",
      done: wireApproved,
      to: "/wire" as const,
      cta: "View instructions",
    },
  ];
  const doneSteps = pathSteps.filter((s) => s.done).length;
  const nextStep = pathSteps.find((s) => !s.done) ?? null;

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

  async function downloadBlank(documentId: string) {
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

  async function copyWire() {
    const text = Object.entries(wire)
      .map(([k, v]) => `${WIRE_LABEL[k] ?? k.replace(/_/g, " ")}: ${v}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Wire instructions copied.");
    } catch {
      toast.error("Copy failed — please select and copy manually.");
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
      </main>
    );
  }

  if (!app) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl">Your dashboard</h1>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">No subscription in progress</CardTitle>
            <CardDescription>
              Start your onboarding and this dashboard will track every step, hold your fund
              documents and show your funding instructions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/onboarding/kyc">Begin onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">
            {data?.profile?.legal_name ? `Welcome, ${data.profile.legal_name}` : "Your dashboard"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data?.offering?.name ?? "Fund subscription"}
            {data?.offering?.reg_type ? ` — Reg D ${data.offering.reg_type}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/portal">Sign documents</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Summary title="Commitment" value={money(data?.subscription?.commitment_cents)} />
        <Summary title="Overall status" value={label(app.status)} />
        <Summary
          title="Funding"
          value={
            data?.payment
              ? `${data.payment.method === "ach" ? "ACH" : "Wire"} — ${label(data.payment.status)}`
              : label(app.funding_status)
          }
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Your path to the wire</CardTitle>
          <CardDescription>
            {doneSteps === pathSteps.length
              ? "Every step is complete — your funds are recorded."
              : `${doneSteps} of ${pathSteps.length} steps complete. Next: ${nextStep?.title ?? "—"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((doneSteps / pathSteps.length) * 100)}%` }}
            />
          </div>
          <ol className="mt-5 space-y-3">
            {pathSteps.map((step, index) => {
              const isNext = step === nextStep;
              return (
                <li key={step.title} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                        step.done
                          ? "bg-primary text-primary-foreground"
                          : isNext
                            ? "border border-primary text-primary"
                            : "border text-muted-foreground"
                      }`}
                    >
                      {step.done ? "✓" : index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm ${step.done ? "" : isNext ? "font-medium" : "text-muted-foreground"}`}>
                        {step.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{step.detail}</p>
                    </div>
                  </div>
                  {!step.done && isNext && step.to ? (
                    <Button asChild size="sm">
                      <Link to={step.to}>{step.cta}</Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="mt-10">
        <OnboardingStepper current={(app.current_step as "kyc") ?? "kyc"} />
      </div>

      <section className="mt-8">
        <h2 className="text-xl">Onboarding status</h2>
        <div className="mt-4 space-y-3">
          <StatusRow
            title="Identity verification (KYC)"
            status={app.kyc_status}
            detail={
              data?.kyc?.completed_at
                ? `Completed ${when(data.kyc.completed_at)}`
                : "Verified through our identity provider"
            }
            to="/onboarding/kyc"
            cta="Review"
          />
          <StatusRow
            title="AML screening"
            status={app.aml_status}
            detail="Sanctions, PEP and watchlist screening"
            to="/onboarding/aml"
            cta="Review"
          />
          <StatusRow
            title="Accreditation"
            status={app.accreditation_status}
            detail={unlocked ? "Reg D qualification evidence" : "Unlocks after KYC and AML approval"}
            to="/onboarding/accreditation"
            cta={app.accreditation_status === "not_started" ? "Start" : "Review"}
            locked={!unlocked}
          />
          <StatusRow
            title="Fund documents"
            status={app.documents_status}
            detail={unlocked ? "Subscription agreement and PPM" : "Unlocks after KYC and AML approval"}
            to="/onboarding/documents"
            cta={app.documents_status === "not_started" ? "Review & sign" : "View"}
            locked={!unlocked}
          />
          <StatusRow
            title="Funding"
            status={app.funding_status}
            detail={unlocked ? "Wire or ACH transfer" : "Unlocks after KYC and AML approval"}
            to="/onboarding/funding"
            cta={app.funding_status === "not_started" ? "Choose method" : "View"}
            locked={!unlocked}
          />
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Your documents</h2>
          <Button asChild variant="outline" size="sm">
            <Link to="/documents">View all documents</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/diligence">Due diligence</Link>
          </Button>
        </div>
        <Card className="mt-4">
          <CardContent className="pt-6">
            {offeringDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Fund documents appear here once your fund access is confirmed.
              </p>
            ) : (
              <ul className="divide-y">
                {offeringDocs.map((doc) => {
                  const sig = signatureByDoc.get(doc.id);
                  const completed = sig
                    ? sig.provider !== "box_sign" || sig.provider_status === "completed"
                    : false;
                  const signedAt = sig?.provider_completed_at ?? sig?.signed_at ?? null;
                  return (
                    <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {completed
                            ? `Signed${signedAt ? ` ${when(signedAt)}` : ""}`
                            : sig
                              ? "Awaiting signature"
                              : doc.requires_signature
                                ? "Signature required"
                                : "Reference copy"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={completed ? "default" : "secondary"}>
                          {completed ? "Signed" : sig ? "Out for signature" : "Unsigned"}
                        </Badge>
                        {completed && sig?.downloadable ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === sig.signature_id}
                            onClick={() => openSigned(sig.signature_id)}
                          >
                            {busy === sig.signature_id ? "Opening…" : "Download signed"}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === doc.id}
                            onClick={() => downloadBlank(doc.id)}
                          >
                            {busy === doc.id ? "Preparing…" : "Download PDF"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Documents you sent us</h2>
          <Button asChild variant="outline" size="sm">
            <Link to="/documents">Upload another</Link>
          </Button>
        </div>
        <Card className="mt-4">
          <CardContent className="pt-6">
            {myUploads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Anything you upload for your fund team appears here.
              </p>
            ) : (
              <ul className="divide-y">
                {myUploads.slice(0, 5).map((upload) => (
                  <li
                    key={upload.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-medium">{upload.file_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Sent {when(upload.uploaded_at)}
                        {upload.box_uploaded_at ? " · with your fund team" : ""}
                      </p>
                    </div>
                    <Badge variant={upload.box_uploaded_at ? "default" : "secondary"}>
                      {upload.box_uploaded_at ? "Delivered" : "Uploaded"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">Funding instructions</h2>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              {data?.payment?.method === "ach" ? "ACH transfer" : "Wire transfer"}
            </CardTitle>
            <CardDescription>
              {data?.payment?.reference_code
                ? `Include reference ${data.payment.reference_code} so we can match your funds.`
                : "Choose your funding method in the funding step to receive your reference code."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Field label="Amount due" value={money(data?.subscription?.commitment_cents)} />
              <Field label="Status" value={label(data?.payment?.status ?? app.funding_status)} />
              {data?.payment?.reference_code ? (
                <Field label="Reference code" value={data.payment.reference_code} />
              ) : null}
              {data?.payment?.confirmed_at ? (
                <Field label="Funds received" value={when(data.payment.confirmed_at) ?? "—"} />
              ) : null}
            </div>

            {Object.keys(wire).length > 0 ? (
              <>
                <Separator className="my-5" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Bank details</p>
                  <Button variant="outline" size="sm" onClick={copyWire}>
                    Copy details
                  </Button>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {Object.entries(wire).map(([key, value]) => (
                    <div key={key} className="rounded-md border p-3">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        {WIRE_LABEL[key] ?? key.replace(/_/g, " ")}
                      </dt>
                      <dd className="mt-1 break-words font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Always confirm these details by phone with Harmonious before sending funds. We
                  never change bank details by email.
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Bank details will appear here once your fund documents are signed.
              </p>
            )}

            {wireConfirmations.length > 0 ? (
              <>
                <Separator className="my-5" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Wire confirmations</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/wire-confirmation">Submit or update</Link>
                  </Button>
                </div>
                <ul className="mt-3 space-y-3">
                  {wireConfirmations.map((w) => (
                    <li key={w.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {money(w.amount_cents)} from {w.sending_bank_name} ····
                          {w.sending_account_last4}
                        </p>
                        <Badge variant={wireConfirmTone(w.status)}>
                          {WIRE_CONFIRM_LABEL[w.status] ?? w.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        Sent {w.sent_on} · Submitted {when(w.created_at) ?? "—"}
                        {w.reviewed_at ? ` · Reviewed ${when(w.reviewed_at) ?? "—"}` : ""}
                      </p>
                      {w.status === "rejected" && w.review_notes ? (
                        <p className="mt-2 rounded-md bg-destructive/10 p-2 text-destructive">
                          Sent back: {w.review_notes}
                        </p>
                      ) : null}
                      {w.status === "submitted" || w.status === "pending" ? (
                        <p className="mt-2 text-muted-foreground">
                          We&apos;re matching this wire to your account — this page updates
                          automatically once it&apos;s approved.
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {canQuickConfirm ? (
              <>
                <Separator className="my-5" />
                <QuickWireConfirm
                  commitmentCents={
                    data?.subscription?.commitment_cents ?? funding?.application?.commitment_cents
                  }
                  lastBankName={wireConfirmations[0]?.sending_bank_name ?? null}
                  lastAccountLast4={wireConfirmations[0]?.sending_account_last4 ?? null}
                />
              </>
            ) : null}

            <div className="mt-5">
              <Button asChild variant="outline" size="sm">
                <Link to="/onboarding/funding">Go to funding</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Summary({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="mt-1 text-lg font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label: name, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{name}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function StatusRow({
  title,
  status,
  detail,
  to,
  cta,
  locked,
}: {
  title: string;
  status: string | null | undefined;
  detail: string;
  to:
    | "/onboarding/kyc"
    | "/onboarding/aml"
    | "/onboarding/accreditation"
    | "/onboarding/documents"
    | "/onboarding/funding";
  cta: string;
  locked?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={tone(status)}>{label(status)}</Badge>
          {locked ? (
            <Badge variant="outline">Locked</Badge>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to={to}>{cta}</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
