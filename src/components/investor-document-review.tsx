import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  decideDocumentFn, emailFundSignatoryFn, listDocumentReviewsFn, myInvitedFundsFn, signedCopyUrlFn, startInvitedFundFn,
} from "@/lib/investor-document-review.functions";
import { money } from "@/lib/status";

function useReviews(offeringId: string) {
  const load = useServerFn(listDocumentReviewsFn);
  return useQuery({ queryKey: ["doc-reviews", offeringId], queryFn: () => load({ data: { offeringId } }) });
}

function SignedCopyButton({ offeringId, signatureId }: { offeringId: string; signatureId: string }) {
  const open = useServerFn(signedCopyUrlFn);
  return (
    <Button size="sm" variant="outline" onClick={async () => {
      try { const r = await open({ data: { offeringId, signatureId } }); window.open(r.url, "_blank", "noopener"); }
      catch (e) { toast.error((e as Error).message); }
    }}>Download signed copy</Button>
  );
}

function DocRow({ offeringId, onboardingId, title, version, d, readOnly }: { offeringId: string; onboardingId: string; title: string; version: number | null; d: any; readOnly?: boolean }) {
  const decide = useServerFn(decideDocumentFn);
  const emailSignatory = useServerFn(emailFundSignatoryFn);
  const qc = useQueryClient();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const act = async (decision: "approved" | "returned", thenSign = false) => {
    setBusy(true);
    try {
      await decide({ data: { offeringId, onboardingId, documentId: d.documentId, decision, note: decision === "returned" ? note : null } });
      if (thenSign && d.countersignSignerId) {
        toast.success("Approved - opening your signature now.");
        navigate({ to: "/manager/countersign/$signerId", params: { signerId: d.countersignSignerId } });
        return;
      }
      toast.success(decision === "approved" ? "Approved - your countersignature is now open." : "Declined - the investment is paused and Harmonious has been told.");
      setReturning(false); setNote("");
      qc.invalidateQueries({ queryKey: ["doc-reviews", offeringId] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}{version ? <span className="text-muted-foreground"> · v{version}</span> : null}</p>
          {d.signed ? (
            <p className="text-xs text-muted-foreground">Signed{d.signed.signerName ? ` by ${d.signed.signerName}` : ""} on {new Date(d.signed.signedAt).toLocaleDateString()}</p>
          ) : null}
          {d.signed && d.decision === "returned" && d.note ? (
            <p className="text-xs text-muted-foreground">Declined: {d.note}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!d.signed ? <Badge variant="outline">Investor hasn't signed yet</Badge> : d.decision === "approved" ? <Badge>Approved</Badge> : d.decision === "returned" ? <Badge variant="destructive">Declined</Badge> : <Badge variant="secondary">Signed - awaiting your decision</Badge>}
          {d.signed && d.decision === "approved" && d.countersignSignerId && !readOnly ? (
            <Button size="sm" onClick={() => navigate({ to: "/manager/countersign/$signerId", params: { signerId: d.countersignSignerId } })}>Sign now</Button>
          ) : null}
          {d.signed?.hasCopy ? <SignedCopyButton offeringId={offeringId} signatureId={d.signed.signatureId} /> : null}
          {d.signed && d.hasPendingFundSignature && d.decision === 'approved' && !readOnly ? <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await emailSignatory({ data: { offeringId, signatureId: d.signed.signatureId } }); toast.success('Signing email requested for the fund signatory.'); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}>Email signatory to sign</Button> : null}
          {d.signed && !readOnly && !d.decision ? (
            <>
              {d.countersignSignerId ? (
                <Button size="sm" disabled={busy} onClick={() => act("approved", true)}>Approve &amp; sign</Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => act("approved")}>Approve</Button>
              )}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setReturning((v) => !v)}>Decline</Button>
            </>
          ) : null}
        </div>
      </div>
      {returning ? (
        <div className="space-y-2">
          <Textarea placeholder="Why are you declining?" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => act("returned")}>Decline investment documents</Button>
        </div>
      ) : null}
    </li>
  );
}

/** Fund manager: approve each investor's signature documents and download signed copies. */
export function InvestorDocumentReview({ offeringId }: { offeringId: string }) {
  const { data, isLoading, error } = useReviews(offeringId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Signed investor documents - approve or decline</CardTitle>
        <CardDescription>Investors sign first. Once they finish, approve or decline here; your countersignature opens after you approve.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : error ? <p className="text-sm text-destructive">{(error as Error).message}</p>
          : !data?.documents.length ? <p className="text-sm text-muted-foreground">No documents in this fund need a signature yet.</p>
          : !data.investors.length ? <p className="text-sm text-muted-foreground">No investors have joined this fund yet.</p>
          : (
            <div className="space-y-5">
              {data.investors.map((inv) => (
                <div key={inv.onboardingId} className="rounded-lg border p-3">
                  <p className="font-medium">{inv.name}</p>
                  <ul className="divide-y">
                    {inv.documents.map((d) => {
                      const doc = data.documents.find((x) => x.id === d.documentId);
                      if (!doc) return null;
                      return <DocRow key={d.documentId} offeringId={offeringId} onboardingId={inv.onboardingId} title={doc.title} version={doc.version} d={d} />;
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}

/** One investor's documents on their record page. */
export function InvestorRecordDocuments({ offeringId, onboardingId }: { offeringId: string; onboardingId: string }) {
  const { data, isLoading } = useReviews(offeringId);
  const inv = data?.investors.find((i) => i.onboardingId === onboardingId);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Documents &amp; signed agreements</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : !inv || !inv.documents.length ? <p className="text-sm text-muted-foreground">No signature documents for this investor yet.</p>
          : <ul className="divide-y">{inv.documents.map((d) => {
              const doc = data?.documents.find((x) => x.id === d.documentId);
              if (!doc) return null;
              return <DocRow key={d.documentId} offeringId={offeringId} onboardingId={onboardingId} title={doc.title} version={doc.version} d={d} />;
            })}</ul>}
      </CardContent>
    </Card>
  );
}

/** Investor: the funds they've been invited to, with a button to start or continue. */
export function InvitedFunds() {
  const load = useServerFn(myInvitedFundsFn);
  const start = useServerFn(startInvitedFundFn);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["invited-funds"], queryFn: () => load() });
  if (!data?.length) return null;
  const go = async (f: (typeof data)[number]) => {
    if (f.onboardingId) return navigate({ to: "/investment/$onboardingId", params: { onboardingId: f.onboardingId } });
    setBusy(f.invitationId);
    try {
      const r = await start({ data: { invitationId: f.invitationId } });
      if (r.pendingReview || !r.onboardingId) { toast.message("Harmonious is checking your details for this fund. We'll be in touch shortly."); return; }
      navigate({ to: "/investment/$onboardingId", params: { onboardingId: r.onboardingId } });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Funds you're invited to</CardTitle>
        <CardDescription>Choose a fund to start or continue your investment.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {data.map((f) => (
            <li key={f.offeringId} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">{f.fundName}</p>
                <p className="text-xs text-muted-foreground">{f.intendedAmountCents ? `Suggested amount ${money(f.intendedAmountCents)}` : "Invitation"}{!f.open && !f.onboardingId ? " · not open yet" : ""}</p>
              </div>
              <Button size="sm" disabled={busy === f.invitationId || (!f.open && !f.onboardingId)} onClick={() => go(f)}>
                {f.onboardingId ? "Continue" : "Start investing"}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
