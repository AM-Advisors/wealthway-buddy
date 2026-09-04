import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import {
  addAdminNote,
  decideApplication,
  decidePayment,
  listDiditEvents,
  getAdminAccess,
  getAdminFileUrl,
  getApplicationDetail,
  sendInvestorEmail,
  sendTestEmail,
} from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { prettyStatus, statusTone } from "./admin.index";

export const Route = createFileRoute("/_authenticated/admin/$applicationId")({
  head: () => ({
    meta: [
      { title: "Application Review — Harmonious Admin" },
      {
        name: "description",
        content:
          "Review one investor's KYC, AML, accreditation evidence, signed documents and funding, then approve, reject or email them.",
      },
      { property: "og:title", content: "Application Review — Harmonious Admin" },
      {
        property: "og:description",
        content: "Compliance detail view for a single investor application.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDetail,
});

function money(cents?: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function AdminDetail() {
  const { applicationId } = Route.useParams();
  const queryClient = useQueryClient();

  const access = useServerFn(getAdminAccess);
  const load = useServerFn(getApplicationDetail);
  const decide = useServerFn(decideApplication);
  const note = useServerFn(addAdminNote);
  const fileUrl = useServerFn(getAdminFileUrl);
  const email = useServerFn(sendInvestorEmail);
  const testEmail = useServerFn(sendTestEmail);
  const payment = useServerFn(decidePayment);
  const diditEvents = useServerFn(listDiditEvents);

  const accessQuery = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const isAdmin = accessQuery.data?.isAdmin;

  const detail = useQuery({
    queryKey: ["admin-application", applicationId],
    queryFn: () => load({ data: { applicationId } }),
    enabled: isAdmin === true,
  });

  const eventsQuery = useQuery({
    queryKey: ["didit-events", applicationId],
    queryFn: () => diditEvents({ data: { applicationId } }),
    enabled: isAdmin === true,
  });

  const investorEmail = detail.data?.profile?.email ?? "";

  const deliveryQuery = useQuery({
    queryKey: ["email-delivery", investorEmail],
    queryFn: () => deliveryLog({ data: { recipient: investorEmail, limit: 25 } }),
    enabled: isAdmin === true && investorEmail.length > 0,
  });

  const [noteBody, setNoteBody] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [testTo, setTestTo] = useState("");

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

  const testMutation = useMutation({
    mutationFn: () => testEmail({ data: { applicationId, subject, body: message, to: testTo.trim() } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
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
          <Link to="/admin">Back to queue</Link>
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
      <Link to="/admin" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← Review queue
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
                        <p className="font-medium">{sig.document?.title ?? "Document"}</p>
                        <p className="text-muted-foreground">
                          Signed by {sig.signer_name} · {new Date(sig.signed_at).toLocaleString()}
                        </p>
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
                </div>
              </div>
            </div>

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
              Sends, rejections, bounces, complaints and unsubscribes for this investor's address.
              Opens and reads aren't tracked.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => deliveryQuery.refetch()}
              disabled={!investorEmail || deliveryQuery.isFetching}
            >
              {deliveryQuery.isFetching ? "Loading…" : "Refresh delivery history"}
            </Button>
            {!investorEmail ? (
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
