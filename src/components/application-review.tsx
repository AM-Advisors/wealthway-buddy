import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import {
  addAdminNote,
  decideApplication,
  decidePayment,
  decideWireConfirmation,
  listDiditEvents,
  getAdminAccess,
  getAdminFileUrl,
  getApplicationDetail,
  sendInvestorEmail,
  sendTestEmail,
  sendOnboardingInvitation,
} from "@/lib/admin.functions";
import { sendTestDiditEvent } from "@/lib/didit-test.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  getDeliveryDetails,
  listDeliveryLog,
  listEmailClicks,
} from "@/lib/email-delivery.functions";
import { money, prettyStatus, statusTone } from "@/lib/status";

export interface ApplicationReviewProps {
  applicationId: string;
  /** Where the "back" link goes: the admin queue or the manager fund view. */
  backTo: "/admin" | "/manager";
  backLabel: string;
}

export function ApplicationReview({ applicationId, backTo, backLabel }: ApplicationReviewProps) {
  const queryClient = useQueryClient();

  const access = useServerFn(getAdminAccess);
  const load = useServerFn(getApplicationDetail);
  const decide = useServerFn(decideApplication);
  const note = useServerFn(addAdminNote);
  const fileUrl = useServerFn(getAdminFileUrl);
  const email = useServerFn(sendInvestorEmail);
  const testEmail = useServerFn(sendTestEmail);
  const invite = useServerFn(sendOnboardingInvitation);
  const payment = useServerFn(decidePayment);
  const diditEvents = useServerFn(listDiditEvents);
  const deliveryLog = useServerFn(listDeliveryLog);
  const emailClicks = useServerFn(listEmailClicks);
  const deliveryDetails = useServerFn(getDeliveryDetails);

  const accessQuery = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const isAdmin = accessQuery.data?.isReviewer;
  const isSuperAdmin = accessQuery.data?.isAdmin === true;
  const testDidit = useServerFn(sendTestDiditEvent);

  const detail = useQuery({
    queryKey: ["admin-application", applicationId],
    queryFn: () => load({ data: { applicationId } }),
    enabled: isAdmin === true,
    // Identity decisions arrive asynchronously by webhook.
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const eventsQuery = useQuery({
    queryKey: ["didit-events", applicationId],
    queryFn: () => diditEvents({ data: { applicationId } }),
    enabled: isAdmin === true,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });


  const investorEmail = detail.data?.profile?.email ?? "";

  const [watchEmail, setWatchEmail] = useState("");
  const [lastSendAt, setLastSendAt] = useState<number | null>(null);
  const watchedEmail = watchEmail || investorEmail;
  const pollingWindowMs = 10 * 60 * 1000;
  const pollingActive = lastSendAt !== null && Date.now() - lastSendAt < pollingWindowMs;

  const deliveryQuery = useQuery({
    queryKey: ["email-delivery", watchedEmail],
    queryFn: () => deliveryLog({ data: { recipient: watchedEmail, limit: 25 } }),
    enabled: isAdmin === true && watchedEmail.length > 0,
    refetchInterval: () =>
      lastSendAt !== null && Date.now() - lastSendAt < pollingWindowMs ? 15000 : false,
  });

  const clicksQuery = useQuery({
    queryKey: ["email-clicks"],
    queryFn: () => emailClicks({ data: { limit: 25 } }),
    enabled: isAdmin === true,
    refetchInterval: () =>
      lastSendAt !== null && Date.now() - lastSendAt < pollingWindowMs ? 15000 : false,
  });

  const [showDetails, setShowDetails] = useState(false);
  const detailsQuery = useQuery({
    queryKey: ["email-delivery-details", watchedEmail, applicationId],
    queryFn: () => deliveryDetails({ data: { recipient: watchedEmail, applicationId } }),
    enabled: isAdmin === true && showDetails && watchedEmail.length > 0,
    refetchInterval: () =>
      lastSendAt !== null && Date.now() - lastSendAt < pollingWindowMs ? 15000 : false,
  });


  const [noteBody, setNoteBody] = useState("");
  const [wireNotes, setWireNotes] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [testTo, setTestTo] = useState("");

  // Last test send, kept so it can be tweaked and resent without recomposing.
  type LastTest = { to: string; subject: string; body: string; at: number };
  const lastTestKey = `harmonious.lastTestEmail.${applicationId}`;
  const [lastTest, setLastTest] = useState<LastTest | null>(null);
  const [resendTo, setResendTo] = useState("");
  const [resendSubject, setResendSubject] = useState("");
  const [resendBody, setResendBody] = useState("");

  const applyLastTest = (t: LastTest) => {
    setLastTest(t);
    setResendTo(t.to);
    setResendSubject(t.subject);
    setResendBody(t.body);
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(lastTestKey);
      if (raw) applyLastTest(JSON.parse(raw) as LastTest);
    } catch {
      /* ignore unreadable storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTestKey]);

  const rememberTest = (t: LastTest) => {
    applyLastTest(t);
    try {
      window.localStorage.setItem(lastTestKey, JSON.stringify(t));
    } catch {
      /* ignore unwritable storage */
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-application", applicationId] });
    queryClient.invalidateQueries({ queryKey: ["admin-queue"] });
  };

  const decideMutation = useMutation({
    mutationFn: (vars: { area: "kyc" | "aml" | "accreditation" | "documents"; decision: "approved" | "declined" | "review"; notes?: string }) =>
      decide({ data: { applicationId, ...vars } }),
    onSuccess: () => {
      toast.success("Decision recorded");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paymentMutation = useMutation({
    mutationFn: (vars: { paymentId: string; outcome: "settled" | "returned" | "cancelled" }) =>
      payment({ data: { applicationId, ...vars } }),
    onSuccess: () => {
      toast.success("Funding status updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wireMutation = useMutation({
    mutationFn: (vars: { confirmationId: string; outcome: "approved" | "rejected"; notes: string }) =>
      wireDecision({ data: { applicationId, ...vars } }),
    onSuccess: (_r, vars) => {
      setWireNotes((prev) => ({ ...prev, [vars.confirmationId]: "" }));
      toast.success(
        vars.outcome === "approved" ? "Wire approved — subscription funded" : "Wire confirmation rejected",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMutation = useMutation({
    mutationFn: () => note({ data: { applicationId, body: noteBody } }),
    onSuccess: () => {
      setNoteBody("");
      toast.success("Note added");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailMutation = useMutation({
    mutationFn: () => email({ data: { applicationId, subject, body: message } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setSubject("");
        setMessage("");
      } else {
        toast.warning(result.message);
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user?.email) setTestTo((prev) => prev || data.user!.email!);
    });
    return () => {
      active = false;
    };
  }, []);

  const startWatching = (address?: string) => {
    setWatchEmail((address ?? testTo).trim() || investorEmail);
    setLastSendAt(Date.now());
  };

  const testMutation = useMutation({
    mutationFn: () => testEmail({ data: { applicationId, subject, body: message, to: testTo.trim() } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
      rememberTest({ to: testTo.trim(), subject, body: message, at: Date.now() });
      startWatching();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendMutation = useMutation({
    mutationFn: () =>
      testEmail({
        data: {
          applicationId,
          subject: resendSubject,
          body: resendBody,
          to: resendTo.trim(),
        },
      }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
      rememberTest({ to: resendTo.trim(), subject: resendSubject, body: resendBody, at: Date.now() });
      startWatching(resendTo);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { applicationId, to: testTo.trim() } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
      startWatching();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const diditTestMutation = useMutation({
    mutationFn: (status: "Approved" | "Declined" | "In Review") =>
      testDidit({ data: { applicationId, status } }),
    onSuccess: (res) => {
      toast.success(`Test verification event sent (${res.status}).`);
      queryClient.invalidateQueries({ queryKey: ["didit-events", applicationId] });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openFile(bucket: "accreditation-docs" | "signed-documents", path: string) {
    try {
      const { url } = await fileUrl({ data: { bucket, path } });
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("File is unavailable.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open file.");
    }
  }

  if (accessQuery.isLoading || (isAdmin && detail.isLoading)) {
    return <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This console is limited to Harmonious compliance staff.
        </p>
      </main>
    );
  }

  if (detail.isError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Not available</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {(detail.error as Error).message}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </main>
    );
  }

  const d = detail.data;
  const app = d?.application;
  const accreditation = d?.accreditation as any;
  const questionnaire = (accreditation?.questionnaire ?? {}) as Record<string, unknown>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link to={backTo} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {backLabel}
      </Link>

      <h1 className="mt-4 text-3xl">{d?.profile?.legal_name ?? "Investor application"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {d?.profile?.email ?? "no email on file"}
        {d?.offering ? ` · ${d.offering.name} (Reg D ${d.offering.reg_type})` : ""}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(["kyc", "aml", "accreditation", "documents"] as const).map((area) => (
          <Badge key={area} variant={statusTone((app as any)?.[`${area}_status`] ?? "not_started")}>
            {area.toUpperCase()} {prettyStatus((app as any)?.[`${area}_status`] ?? "not_started")}
          </Badge>
        ))}
        <Badge variant={statusTone(app?.funding_status ?? "not_started")}>
          Funding {prettyStatus(app?.funding_status ?? "not_started")}
        </Badge>
      </div>

      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Investor profile</CardTitle>
            <CardDescription>Submitted during identity verification.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Investor type" value={d?.profile?.investor_type} />
            <Row label="Entity" value={d?.profile?.entity_name} />
            <Row label="Phone" value={d?.profile?.phone} />
            <Row label="Date of birth" value={d?.profile?.date_of_birth} />
            <Row
              label="Address"
              value={[d?.profile?.address_line1, d?.profile?.city, d?.profile?.region, d?.profile?.postal_code, d?.profile?.country]
                .filter(Boolean)
                .join(", ")}
            />
            <Row label="Commitment" value={money(app?.commitment_cents)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity & AML screening</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <Row label="KYC provider" value={(d?.kyc as any)?.provider} />
              <Row label="ID document" value={((d?.kyc as any)?.result?.id_document_type ?? "").toString().replace(/_/g, " ")} />
              <Row label="AML provider" value={(d?.aml as any)?.provider} />
              <Row
                label="Watchlist hits"
                value={(d?.aml as any)?.matches?.flagged ? "Flagged — manual review" : "No hits"}
              />
            </div>
            <DecisionBar
              disabled={decideMutation.isPending}
              onDecide={(decision) => decideMutation.mutate({ area: "kyc", decision })}
              label="KYC decision"
            />
            <DecisionBar
              disabled={decideMutation.isPending}
              onDecide={(decision) => decideMutation.mutate({ area: "aml", decision })}
              label="AML decision"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accreditation review</CardTitle>
            <CardDescription>
              {accreditation
                ? `Reg D ${accreditation.reg_type} · method: ${String(accreditation.method ?? "—").replace(/_/g, " ")}`
                : "The investor has not submitted accreditation yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {accreditation && (
              <>
                <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                  <Row label="Attested by" value={accreditation.attested_signature} />
                  <Row
                    label="Attested at"
                    value={accreditation.attested_at ? new Date(accreditation.attested_at).toLocaleString() : "—"}
                  />
                  <Row
                    label="Verification expires"
                    value={accreditation.expires_at ? new Date(accreditation.expires_at).toLocaleDateString() : "—"}
                  />
                  <Row label="Pre-existing relationship" value={accreditation.pre_existing_relationship} />
                </div>

                {Object.keys(questionnaire).length > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      Questionnaire responses
                    </p>
                    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      {Object.entries(questionnaire).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="text-muted-foreground">{k.replace(/_/g, " ")}:</dt>
                          <dd className="break-words">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Evidence</p>
                  {d?.evidence.length ? (
                    <ul className="space-y-2">
                      {d.evidence.map((doc: any) => (
                        <li key={doc.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                          <span className="min-w-0 truncate">
                            {doc.file_name}
                            <span className="text-muted-foreground"> · {doc.doc_kind.replace(/_/g, " ")}</span>
                          </span>
                          <Button size="sm" variant="outline" onClick={() => openFile("accreditation-docs", doc.storage_path)}>
                            Open
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No documents uploaded.</p>
                  )}
                </div>
              </>
            )}
            <DecisionBar
              disabled={decideMutation.isPending}
              label="Accreditation decision"
              onDecide={(decision) =>
                decideMutation.mutate(noteBody ? { area: "accreditation", decision, notes: noteBody } : { area: "accreditation", decision })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fund documents</CardTitle>
            <CardDescription>Signed subscription package and e-signature audit trail.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <Row label="Ownership title" value={(d?.subscription as any)?.ownership_title} />
              <Row label="Tax classification" value={(d?.subscription as any)?.tax_classification} />
              <Row label="Commitment" value={money((d?.subscription as any)?.commitment_cents)} />
            </div>

            {d?.signatures.length ? (
              <ul className="space-y-2">
                {d.signatures.map((sig: any) => (
                  <li key={sig.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {sig.document?.title ?? "Document"}
                          {sig.provider === "box_sign" && (
                            <Badge variant="secondary" className="ml-2 align-middle">
                              Box Sign
                              {sig.provider_status && sig.provider_status !== "completed"
                                ? ` · ${String(sig.provider_status).replace(/_/g, " ")}`
                                : ""}
                            </Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground">
                          Signed by {sig.signer_name} ·{" "}
                          {new Date(sig.provider_completed_at ?? sig.signed_at).toLocaleString()}
                        </p>
                        {sig.provider === "box_sign" && sig.provider_agreement_id && (
                          <p className="break-all font-mono text-[11px] text-muted-foreground">
                            Box Sign request {sig.provider_agreement_id}
                          </p>
                        )}
                        <p className="break-all font-mono text-[11px] text-muted-foreground">
                          SHA-256 {sig.document_hash}
                        </p>
                      </div>
                      {sig.pdf_path && (
                        <Button size="sm" variant="outline" onClick={() => openFile("signed-documents", sig.pdf_path)}>
                          Signed PDF
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No documents signed yet.</p>
            )}

            {d?.audit.length ? (
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">
                  Audit trail ({d.audit.length})
                </summary>
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
                  {d.audit.map((e: any) => (
                    <li key={e.id}>
                      {new Date(e.created_at).toLocaleString()} · {e.event_type} · {e.ip_address ?? "no ip"}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <DecisionBar
              disabled={decideMutation.isPending}
              label="Document review decision"
              onDecide={(decision) => decideMutation.mutate({ area: "documents", decision })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {eventsQuery.data?.events.length ? (
              eventsQuery.data.events.map((e: any) => (
                <div key={e.event_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <span>
                    {e.webhook_type}
                    {e.status ? ` · ${e.status}` : ""}
                    {e.error ? ` · ${e.error}` : ""}
                  </span>
                  <span className="text-muted-foreground">{new Date(e.received_at).toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No verification events received yet.</p>
            )}
            {isSuperAdmin && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Send test verification event
                </span>
                {(["Approved", "In Review", "Declined"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === "Declined" ? "destructive" : s === "Approved" ? "default" : "outline"}
                    disabled={diditTestMutation.isPending}
                    onClick={() => diditTestMutation.mutate(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d?.payments.length ? (
              d.payments.map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <span>
                    {p.method.toUpperCase()} · {money(p.amount_cents)}
                    {p.reference_code ? ` · ref ${p.reference_code}` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusTone(p.status)}>{prettyStatus(p.status)}</Badge>
                    {p.status !== "settled" && (
                      <>
                        <Button
                          size="sm"
                          disabled={paymentMutation.isPending}
                          onClick={() => paymentMutation.mutate({ paymentId: p.id, outcome: "settled" })}
                        >
                          Confirm funds received
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={paymentMutation.isPending}
                          onClick={() => paymentMutation.mutate({ paymentId: p.id, outcome: "returned" })}
                        >
                          Returned
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No funding record yet.</p>
            )}

            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Instruction confirmations</p>
              {(d as any)?.fundingAcknowledgements?.length ? (
                (d as any).fundingAcknowledgements.map((a: any) => (
                  <div key={a.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {String(a.method).toUpperCase()} details confirmed
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(a.acknowledged_at).toLocaleString()}
                      </span>
                    </div>
                    <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                      {(a.statements ?? []).map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      instructions fingerprint {String(a.instructions_hash).slice(0, 16)}…
                      {a.ip_address ? ` · ${a.ip_address}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">
                  The investor has not confirmed the funding instructions yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email the investor</CardTitle>
            <CardDescription>
              Request more information or confirm an approval. Every message is logged against this
              application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSubject("More information needed for your Harmonious subscription");
                  setMessage(
                    `Hello ${d?.profile?.legal_name ?? "there"},\n\nWhile reviewing your subscription we need additional information before we can complete your accreditation review:\n\n- \n\nPlease upload the documents in your investor portal at your earliest convenience.\n\nKind regards,\nHarmonious — Investor Relations`,
                  );
                }}
              >
                Request more info
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSubject("Your Harmonious subscription has been approved");
                  setMessage(
                    `Hello ${d?.profile?.legal_name ?? "there"},\n\nYour accreditation and subscription documents have been approved. You may now complete funding by wire or ACH from your investor portal.\n\nKind regards,\nHarmonious — Investor Relations`,
                  );
                }}
              >
                Approval notice
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSubject("Update on your Harmonious subscription");
                  setMessage(
                    `Hello ${d?.profile?.legal_name ?? "there"},\n\nAfter reviewing your application we are unable to accept your subscription at this time.\n\nReason:\n\nPlease reply to this message if you would like to discuss.\n\nKind regards,\nHarmonious — Investor Relations`,
                  );
                }}
              >
                Decline notice
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Button
                onClick={() => emailMutation.mutate()}
                disabled={emailMutation.isPending || subject.trim().length < 2 || message.trim().length < 2}
              >
                {emailMutation.isPending ? "Sending…" : "Send email"}
              </Button>
              <div className="space-y-1.5">
                <Label htmlFor="test_to">Send to a test address</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="test_to"
                    type="email"
                    className="w-64"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <Button
                    variant="outline"
                    onClick={() => testMutation.mutate()}
                    disabled={
                      testMutation.isPending ||
                      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo.trim()) ||
                      subject.trim().length < 2 ||
                      message.trim().length < 2
                    }
                  >
                    {testMutation.isPending ? "Sending…" : "Send test"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => inviteMutation.mutate()}
                    disabled={
                      inviteMutation.isPending ||
                      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo.trim())
                    }
                  >
                    {inviteMutation.isPending ? "Sending…" : "Send onboarding email"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {["operations@harmonious.co"].map((addr) => (
                    <Button
                      key={addr}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setTestTo(addr)}
                    >
                      {addr}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {lastTest ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Resend test email</p>
                    <p className="text-xs text-muted-foreground">
                      Last test sent to {lastTest.to} · {new Date(lastTest.at).toLocaleString()}. Tweak the
                      subject or message below and send it again.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setSubject(lastTest.subject);
                      setMessage(lastTest.body);
                      setTestTo(lastTest.to);
                      toast.success("Loaded into the composer above.");
                    }}
                  >
                    Copy into composer
                  </Button>
                </div>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="resend_to">Send to</Label>
                      <Input
                        id="resend_to"
                        type="email"
                        value={resendTo}
                        onChange={(e) => setResendTo(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="resend_subject">Subject</Label>
                      <Input
                        id="resend_subject"
                        value={resendSubject}
                        onChange={(e) => setResendSubject(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="resend_body">Message</Label>
                    <Textarea
                      id="resend_body"
                      rows={6}
                      value={resendBody}
                      onChange={(e) => setResendBody(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => resendMutation.mutate()}
                      disabled={
                        resendMutation.isPending ||
                        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resendTo.trim()) ||
                        resendSubject.trim().length < 2 ||
                        resendBody.trim().length < 2
                      }
                    >
                      {resendMutation.isPending ? "Sending…" : "Resend test"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => applyLastTest(lastTest)}
                      disabled={resendMutation.isPending}
                    >
                      Reset changes
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}


            {d?.emails.length ? (
              <>
                <Separator className="my-2" />
                <ul className="space-y-2 text-sm">
                  {d.emails.map((e: any) => (
                    <li key={e.id} className="rounded-md border p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{e.subject}</span>
                        <span className="flex items-center gap-2">
                          <Badge variant={e.status === "sent" ? "default" : "secondary"}>
                            {prettyStatus(e.status)}
                          </Badge>
                          {e.delivery_event ? (
                            <Badge variant="destructive">{prettyStatus(e.delivery_event)}</Badge>
                          ) : null}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {e.to_email} · {new Date(e.created_at).toLocaleString()}
                      </p>
                      {e.delivery_detail ? (
                        <p className="mt-1 text-xs text-destructive">{e.delivery_detail}</p>
                      ) : null}
                      {e.provider_error ? (
                        <p className="mt-1 text-xs text-muted-foreground">{e.provider_error}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery history</CardTitle>
            <CardDescription>
              Sends, rejections, bounces, complaints and unsubscribes for {watchedEmail || "this investor's address"}.
              After you send, this checks itself every 15 seconds for 10 minutes. Opens and reads aren't tracked.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => deliveryQuery.refetch()}
                disabled={!watchedEmail || deliveryQuery.isFetching}
              >
                {deliveryQuery.isFetching ? "Checking…" : "Check now"}
              </Button>
              {pollingActive ? (
                <Badge variant="secondary">Auto-checking</Badge>
              ) : null}
              {deliveryQuery.dataUpdatedAt ? (
                <span className="text-xs text-muted-foreground">
                  Last checked {new Date(deliveryQuery.dataUpdatedAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
            {deliveryQuery.data?.events?.[0] ? (
              <p className="text-sm">
                Latest outcome:{" "}
                <span className="font-medium">{prettyStatus(deliveryQuery.data.events[0].event_type)}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  ({new Date(deliveryQuery.data.events[0].timestamp).toLocaleString()})
                </span>
              </p>
            ) : null}
            {!watchedEmail ? (
              <p className="text-sm text-muted-foreground">No email address on file yet.</p>
            ) : deliveryQuery.data?.error ? (
              <p className="text-sm text-muted-foreground">{deliveryQuery.data.error}</p>
            ) : deliveryQuery.data?.events.length ? (
              <ul className="space-y-2 text-sm">
                {deliveryQuery.data.events.map((ev, i) => (
                  <li
                    key={`${ev.timestamp}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <span>
                      <Badge variant={ev.event_type === "sent" ? "default" : "secondary"}>
                        {prettyStatus(ev.event_type)}
                      </Badge>
                      {ev.status ? (
                        <span className="ml-2 text-xs text-muted-foreground">{ev.status}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ev.timestamp).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {deliveryQuery.isFetched
                  ? "No delivery events recorded for this address yet."
                  : "Load the delivery history to see the latest events."}
              </p>
            )}

            <Separator className="my-2" />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowDetails((v) => !v);
                  if (!showDetails) detailsQuery.refetch();
                }}
                disabled={!watchedEmail}
              >
                {showDetails ? "Hide delivery details" : "View delivery details"}
              </Button>
              {showDetails && detailsQuery.isFetching ? (
                <span className="text-xs text-muted-foreground">Loading…</span>
              ) : null}
            </div>
            {showDetails ? (
              <div className="space-y-3 rounded-md border p-3">
                {detailsQuery.data ? (
                  <>
                    <div>
                      <p className="text-sm font-medium">Last-known response</p>
                      {detailsQuery.data.lastResponse ? (
                        <div className="mt-1 space-y-1 text-sm">
                          <p>
                            <Badge variant="secondary">
                              {prettyStatus(detailsQuery.data.lastResponse.event)}
                            </Badge>
                            {detailsQuery.data.lastResponse.at ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {new Date(detailsQuery.data.lastResponse.at).toLocaleString()}
                              </span>
                            ) : null}
                          </p>
                          <p className="font-mono text-xs break-all text-muted-foreground">
                            {detailsQuery.data.lastResponse.smtpResponse ??
                              "No SMTP response text reported for this message."}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nothing recorded for this address yet.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">Message headers</p>
                      <dl className="mt-1 grid gap-1 text-xs sm:grid-cols-[10rem_1fr]">
                        {detailsQuery.data.headers.map((h) => (
                          <Fragment key={h.label}>
                            <dt className="text-muted-foreground">{h.label}</dt>
                            <dd className="font-mono break-all">{h.value}</dd>
                          </Fragment>
                        ))}
                      </dl>
                    </div>
                    {detailsQuery.data.rawPayload ? (
                      <details>
                        <summary className="cursor-pointer text-sm font-medium">
                          Raw provider report
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                          {detailsQuery.data.rawPayload}
                        </pre>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {detailsQuery.isFetching ? "Loading details…" : "No details available."}
                  </p>
                )}
              </div>
            ) : null}

            <Separator className="my-2" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Link clicks</p>
                <p className="text-xs text-muted-foreground">
                  Recorded when someone opens a link in an onboarding email.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => clicksQuery.refetch()}
                disabled={clicksQuery.isFetching}
              >
                {clicksQuery.isFetching ? "Loading…" : "Refresh clicks"}
              </Button>
            </div>
            {clicksQuery.data?.error ? (
              <p className="text-sm text-muted-foreground">{clicksQuery.data.error}</p>
            ) : clicksQuery.data?.clicks.length ? (
              <ul className="space-y-2 text-sm">
                {clicksQuery.data.clicks.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <span>
                      <Badge>Clicked</Badge>
                      <span className="ml-2">{c.linkLabel ?? "Link"}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{c.recipient}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.clickedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No link clicks recorded yet.</p>
            )}
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal notes</CardTitle>
            <CardDescription>Visible to compliance staff only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={3}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add a review note…"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => noteMutation.mutate()}
              disabled={noteMutation.isPending || noteBody.trim().length === 0}
            >
              Add note
            </Button>
            <ul className="space-y-2 text-sm">
              {d?.notes.map((n: any) => (
                <li key={n.id} className="rounded-md border p-2">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="break-words">{value || "—"}</span>
    </div>
  );
}

function DecisionBar({
  label,
  disabled,
  onDecide,
}: {
  label: string;
  disabled: boolean;
  onDecide: (decision: "approved" | "declined" | "review") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Button size="sm" disabled={disabled} onClick={() => onDecide("approved")}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => onDecide("review")}>
        Needs review
      </Button>
      <Button size="sm" variant="destructive" disabled={disabled} onClick={() => onDecide("declined")}>
        Reject
      </Button>
    </div>
  );
}

