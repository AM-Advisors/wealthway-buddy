import { Link } from "@tanstack/react-router";
import { revokeSignLinkFn, sendSignLinkFn, signLinkFn, signingServiceEmailFn } from "@/lib/sign-link.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { remindFileSignerFn } from "@/lib/fund-file-signing.functions";
import { emailFundSignatoryFn } from "@/lib/investor-document-review.functions";
import { sendSubscriptionSignNoticeFn } from "@/lib/fund-tabs.functions";
import { catchUpSignedInvestmentsFn, listSignatureCenterFn } from "@/lib/signature-center.functions";
import {
  KIND_LABELS,
  ROLE_LABELS,
  STUCK_AFTER_DAYS,
  itemView,
  matchesFilters,
  signerState,
  sortRows,
  type AgreementKind,
  type StatusFilter,
} from "@/lib/signature-center-model";

type Surface = "client" | "ops";
const KIND_TABS: (AgreementKind | "all")[] = ["all", "side_letter", "subscription", "operating_agreement", "other"];
const KIND_TAB_LABEL: Record<AgreementKind | "all", string> = { all: "All agreements", side_letter: "Side letters", subscription: "Subscription agreements", operating_agreement: "Operating agreements", other: "Other" };

const day = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null);
const ago = (n: number | null) => (n === null ? "" : n === 0 ? "since today" : n === 1 ? "for 1 day" : `for ${n} days`);

/**
 * Signatures in one place: what is waiting on you, every agreement on your
 * funds and who it is waiting on, with one Resend button that reuses the
 * existing reminder senders. Read-only otherwise; signing stays on its own page.
 */
export function SignatureCenter({ surface, offeringId, everything, title = "Signatures" }: { surface: Surface; offeringId?: string; everything?: boolean; title?: string }) {
  const load = useServerFn(listSignatureCenterFn);
  const queryKey = ["signature-center", surface, offeringId ?? "", everything ? "all" : "mine"];
  const q = useQuery({ queryKey, queryFn: () => load({ data: { offeringId, everything } }), refetchInterval: 60_000 });
  const [kind, setKind] = useState<AgreementKind | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("waiting");
  const [fund, setFund] = useState("all");
  const [search, setSearch] = useState("");
  const [remindFor, setRemindFor] = useState<any | null>(null);

  const rows = useMemo(() => (q.data?.items ?? []).map((i: any) => ({ ...i, view: itemView(i) })), [q.data]);
  const mine = sortRows(rows.filter((r: any) => r.yourTurn));
  const managed = rows.filter((r: any) => r.managed && (fund === "all" || r.offeringId === fund));
  const kindScoped = managed.filter((r: any) => kind === "all" || r.kind === kind);
  const counts = {
    waiting: kindScoped.filter((r: any) => r.view.status === "waiting").length,
    stuck: kindScoped.filter((r: any) => r.view.stuck).length,
    signed: kindScoped.filter((r: any) => r.view.status === "signed").length,
    all: kindScoped.length,
  };
  const list = sortRows(managed.filter((r: any) => matchesFilters(r, { status, kind, search })));
  const mySigned = rows.filter((r: any) => !r.managed && !r.yourTurn);

  if (q.isPending) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  if (q.isError) return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-base text-destructive">Signatures couldn&apos;t be loaded. {(q.error as Error)?.message}</p>
      <Button variant="outline" onClick={() => q.refetch()}>Try again</Button>
    </div>
  );

  return (
    <section className="space-y-6" aria-label={title}>
      {mine.length > 0 && (
        <div className="space-y-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
          <h2 className="text-xl font-semibold">Your turn to sign <Badge className="ml-1 align-middle">{mine.length}</Badge></h2>
          {mine.map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <div className="min-w-0">
                <p className="text-lg font-medium">{r.title}</p>
                <p className="text-base text-muted-foreground">{r.fundName}{r.investorName ? ` · ${r.investorName}` : ""}</p>
              </div>
              <SignNow link={r.signLink} />
            </div>
          ))}
        </div>
      )}

      {q.data?.managesAny || offeringId ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{offeringId ? "Agreements to sign on this fund" : everything ? "Every fund" : "Your funds"}</h2>
            <p className="text-base text-muted-foreground">Side letters, subscription agreements and every other agreement sent for signature, who it&apos;s waiting on, and a Resend button.</p>
            {surface === "ops" && !offeringId && <RecheckSigned onDone={() => q.refetch()} />}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["waiting", "Waiting", counts.waiting],
              ["stuck", "Stuck", counts.stuck],
              ["signed", "Signed", counts.signed],
              ["all", "All", counts.all],
            ] as [StatusFilter, string, number][]).map(([key, label, n]) => (
              <button key={key} type="button" onClick={() => setStatus(key)} aria-pressed={status === key}
                className={`rounded-lg border p-3 text-left transition-colors ${status === key ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"}`}>
                <span className="block text-2xl font-semibold">{n}</span>
                <span className="text-sm text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Agreement type">
            {KIND_TABS.map((k) => (
              <Button key={k} size="sm" role="tab" aria-selected={kind === k} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{KIND_TAB_LABEL[k]}</Button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search investor, signer, fund or document" aria-label="Search signatures" className="sm:max-w-sm" />
            {!offeringId && (q.data?.funds.length ?? 0) > 1 && (
              <Select value={fund} onValueChange={setFund}>
                <SelectTrigger className="sm:w-72" aria-label="Fund"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All funds</SelectItem>
                  {q.data!.funds.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {list.length === 0 ? (
            <p className="rounded-lg border p-4 text-base text-muted-foreground">
              {status === "waiting" ? "Nothing is waiting for a signature." : status === "stuck" ? `Nothing is stuck. Items show here after ${STUCK_AFTER_DAYS} days without a signature, or when a signing window never loaded.` : "No agreements match."}
            </p>
          ) : (
            <ul className="space-y-3">
              {list.map((r: any) => <Row key={r.id} r={r} surface={surface} showFund={!offeringId} onRemind={() => setRemindFor(r)} />)}
            </ul>
          )}
        </div>
      ) : null}

      {!q.data?.managesAny && !offeringId && mine.length === 0 && (
        <p className="rounded-lg border p-4 text-base text-muted-foreground">Nothing is waiting for your signature right now.</p>
      )}

      {!q.data?.managesAny && !offeringId && mySigned.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Your other agreements</h2>
          <ul className="space-y-3">
            {sortRows(mySigned).map((r: any) => <Row key={r.id} r={r} surface={surface} showFund onRemind={() => undefined} />)}
          </ul>
          <p className="text-sm text-muted-foreground">Download signed copies from <Link to="/documents" className="text-primary underline">Documents</Link>.</p>
        </div>
      )}

      <RemindDialog item={remindFor} onClose={() => setRemindFor(null)} queryKey={queryKey} />
    </section>
  );
}

function SignLinkButtons({ fundId, onboardingId, documentId }: { fundId: string; onboardingId: string; documentId: string }) {
  const getLink = useServerFn(signLinkFn);
  const sendLink = useServerFn(sendSignLinkFn);
  const revoke = useServerFn(revokeSignLinkFn);
  const viaService = useServerFn(signingServiceEmailFn);
  const args = { fundId, onboardingId, documentId };
  const ready = useQuery({ queryKey: ["sign-link", onboardingId, documentId], queryFn: () => getLink({ data: args }), retry: false, staleTime: 60_000 });
  const [busy, setBusy] = useState(false);
  const blocked = ready.data && !ready.data.ready ? ready.data.reason : null;
  const email = async () => {
    if (busy) return;
    if (ready.data?.active && !window.confirm(`Email a new link? The link sent ${day(ready.data.active.sentAt) ?? "earlier"} will stop working.`)) return;
    if (ready.data?.providerEmail && !window.confirm("The signing service already emailed this document. If the investor opens the Harmonious link instead, that email stops working. Continue?")) return;
    setBusy(true);
    try {
      let r: any;
      try { r = await sendLink({ data: args }); }
      catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (!/24 hours/.test(msg)) throw e;
        const reason = window.prompt("A link was already emailed today. A Super Admin can send another. Why is another needed?");
        if (!reason?.trim()) return;
        r = await sendLink({ data: { ...args, overrideReason: reason.trim() } });
      }
      toast.success(`Sign link emailed to ${r?.recipientEmail ?? "the investor"}. They can sign without signing in.`);
      void ready.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send the link."); }
    finally { setBusy(false); }
  };
  const serviceEmail = async () => {
    if (busy) return;
    const open = ready.data?.providerEmail;
    const ask = open
      ? `Send the signing service email again? It was first sent ${day(open.sentAt) ?? "earlier"}.`
      : "Have the signing service email the investor directly? The email comes from the signing service, not Harmonious, and any Harmonious sign link for this document stops working.";
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      let r: any;
      try { r = await viaService({ data: args }); }
      catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (!/24 hours/.test(msg)) throw e;
        const reason = window.prompt("The signing service already emailed this today. A Super Admin can send another. Why is another needed?");
        if (!reason?.trim()) return;
        r = await viaService({ data: { ...args, overrideReason: reason.trim() } });
      }
      toast.success(`${r?.resent ? "Sent again" : "Sent"} from the signing service to ${r?.recipientEmail ?? "the investor"}. Their signature shows here when they finish.`);
      void ready.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send through the signing service."); }
    finally { setBusy(false); }
  };
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async () => {
    if (busy) return;
    // A new link stops the one already emailed, so say so before replacing it.
    if (ready.data?.active && !window.confirm(`Make a new link? The link sent ${day(ready.data.active.sentAt) ?? "earlier"} will stop working, including any link already emailed to the investor.`)) return;
    setBusy(true);
    try {
      const res = await getLink({ data: { ...args, withLink: true } }).catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't make the link."); return null; });
      if (res?.url) { setCopied(res.url); void ready.refetch(); }
    } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="outline" onClick={email} disabled={busy || !ready.data?.ready}>Email sign link</Button>
      <Button variant="ghost" onClick={copy} disabled={busy || !ready.data?.ready}>Copy sign link</Button>
      <Button variant="ghost" onClick={serviceEmail} disabled={busy || !ready.data?.ready}>
        {ready.data?.providerEmail ? "Resend from signing service" : "Email from signing service"}
      </Button>
      {ready.data?.providerEmail && (
        <span className="text-sm text-muted-foreground">
          Signing service emailed {day(ready.data.providerEmail.sentAt)}{ready.data.providerEmail.openedAt ? ` · opened ${day(ready.data.providerEmail.openedAt)}` : " · not opened yet"}
        </span>
      )}
      <Dialog open={!!copied} onOpenChange={(o) => { if (!o) setCopied(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl">Sign link ready</DialogTitle>
            <DialogDescription className="text-base">Copy the whole link, including the code at the end. It works for 14 days and replaces any earlier link.</DialogDescription>
          </DialogHeader>
          <Input readOnly value={copied ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Sign link" className="text-base" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCopied(null)}>Done</Button>
            <Button onClick={async () => {
              try { await navigator.clipboard.writeText(copied ?? ""); toast.success("Sign link copied."); }
              catch { toast.error("Couldn't copy. Press and hold the link above to copy it."); }
            }}>Copy link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ready.data?.active && (
        <>
          <Button variant="ghost" onClick={async () => {
            if (!window.confirm("Cancel the current signing link? It stops working right away.")) return;
            try { await revoke({ data: args }); toast.success("Signing link cancelled."); void ready.refetch(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't cancel the link."); }
          }}>Cancel link</Button>
          <span className="text-sm text-muted-foreground">
            Link sent {day(ready.data.active.sentAt)}{ready.data.active.openedAt ? ` · opened ${day(ready.data.active.openedAt)}` : " · not opened yet"}
          </span>
        </>
      )}
      {blocked && <span className="text-sm text-muted-foreground">{blocked}</span>}
    </>
  );
}

function SignNow({ link }: { link: any }) {
  if (!link) return null;
  const cls = "h-11 px-6 text-base";
  if (link.type === "file") return <Button asChild className={cls}><Link to="/sign/$signatureId" params={{ signatureId: link.signatureId }}>Sign now</Link></Button>;
  if (link.type === "countersign") return <Button asChild className={cls}><Link to="/manager/countersign/$signerId" params={{ signerId: link.signerId }}>Countersign now</Link></Button>;
  return <Button asChild className={cls}><Link to="/investment/$onboardingId" params={{ onboardingId: link.onboardingId }}>Sign now</Link></Button>;
}

function OpenLink({ r, surface }: { r: any; surface: Surface }) {
  if (!r.managed) return null;
  if (surface === "ops") {
    return r.onboardingId && r.source !== "fund_file"
      ? <Button asChild variant="ghost" size="sm"><Link to="/ops/fund/$fundId/investor/$onboardingId" params={{ fundId: r.offeringId, onboardingId: r.onboardingId }}>Open investor</Link></Button>
      : <Button asChild variant="ghost" size="sm"><Link to="/ops/fund/$fundId" params={{ fundId: r.offeringId }} search={{ tab: "documents" }}>Open fund documents</Link></Button>;
  }
  return r.onboardingId && r.source !== "fund_file"
    ? <Button asChild variant="ghost" size="sm"><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId: r.offeringId, onboardingId: r.onboardingId }}>Open investor</Link></Button>
    : <Button asChild variant="ghost" size="sm"><Link to="/manager/fund/$fundId/documents" params={{ fundId: r.offeringId }}>Open fund documents</Link></Button>;
}

function Row({ r, surface, showFund, onRemind }: { r: any; surface: Surface; showFund: boolean; onRemind: () => void }) {
  const v = r.view;
  const tone = v.status === "signed" ? "secondary" : v.status === "problem" || v.stuck ? "destructive" : "outline";
  const signers = [...r.signers].filter((s: any) => signerState(s.status) !== "cancelled").sort((a: any, b: any) => a.order - b.order);
  return (
    <li className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-medium leading-snug">{r.title}</p>
          <p className="text-base text-muted-foreground">
            {KIND_LABELS[r.kind as AgreementKind]}{showFund ? ` · ${r.fundName}` : ""}{r.investorName ? ` · ${r.investorName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {r.isTest && <Badge variant="outline">Test investor</Badge>}
          <Badge variant={tone as any} className="text-sm">{v.status === "signed" ? "Signed" : v.status === "problem" ? "Needs attention" : v.stuck ? "Stuck" : "Waiting"}</Badge>
        </div>
      </div>

      <p className="text-base font-medium">{v.label}{v.status === "waiting" && v.waitingDays !== null ? ` ${ago(v.waitingDays)}` : ""}{r.source === "subscription_not_started" ? " · not opened yet" : ""}</p>
      {v.neverLoaded && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
          They opened the signing window, but the document never loaded. Ask them to press <strong>Open in a new tab</strong> in the signing window, or to use Chrome.
        </p>
      )}

      <ol className="flex flex-wrap gap-2 text-sm">
        {signers.map((s: any, i: number) => {
          const st = signerState(s.status);
          const isNext = v.waitingOn?.id === s.id;
          return (
            <li key={s.id} className={`rounded-md border px-2 py-1 ${isNext ? "border-primary" : ""}`}>
              <span className="font-medium">{i + 1}. {s.name || "Signer"}</span>
              <span className="text-muted-foreground"> · {ROLE_LABELS[s.role as keyof typeof ROLE_LABELS]} · {st === "signed" ? `Signed ${day(s.signedAt) ?? ""}` : st === "problem" ? String(s.status) : isNext ? (s.sentAt ? `Sent ${day(s.sentAt)}` : "Their turn") : `After signer ${i}`}</span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {r.yourTurn && <SignNow link={r.signLink} />}
        {r.remind && <Button variant="outline" onClick={onRemind}>Resend to {v.waitingOn?.name?.split(" ")[0] || "signer"}</Button>}
        {r.managed && r.source === "subscription" && r.signDocId && r.onboardingId && v.status === "waiting" && v.waitingOn?.role === "investor" && (
          <SignLinkButtons fundId={r.offeringId} onboardingId={r.onboardingId} documentId={r.signDocId} />
        )}
        <OpenLink r={r} surface={surface} />
        {r.lastRemindedAt && <span className="text-sm text-muted-foreground">Last reminder {day(r.lastRemindedAt)}</span>}
      </div>
    </li>
  );
}

function RemindDialog({ item, onClose, queryKey }: { item: any | null; onClose: () => void; queryKey: unknown[] }) {
  const qc = useQueryClient();
  const remindFile = useServerFn(remindFileSignerFn);
  const remindCountersign = useServerFn(emailFundSignatoryFn);
  const remindInvestor = useServerFn(sendSubscriptionSignNoticeFn);
  const [reason, setReason] = useState("");
  const [needsReason, setNeedsReason] = useState(false);
  const who = item?.view?.waitingOn;
  const send = useMutation({
    mutationFn: async () => {
      const a = item.remind;
      const overrideReason = needsReason && reason.trim() ? reason.trim() : undefined;
      if (a.type === "file") return remindFile({ data: { signatureId: a.signatureId, overrideReason } });
      if (a.type === "countersign") return remindCountersign({ data: { offeringId: a.offeringId, signatureId: a.signatureId } });
      return remindInvestor({ data: { fundId: a.offeringId, onboardingId: a.onboardingId, kind: "subscription" } });
    },
    onSuccess: (r: any) => {
      if (r && r.sent === false) { toast.message("Already sent today. The investor can use today's email."); onClose(); return; }
      toast.success(`Reminder sent${r?.recipientEmail ? ` to ${r.recipientEmail}` : ""}${r?.invited ? ", with their personal invitation" : ""}.`);
      setReason(""); setNeedsReason(false); onClose();
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => {
      if (/24 hours/.test(e.message) && item?.remind?.type === "file" && !needsReason) { setNeedsReason(true); return; }
      toast.error(e.message);
    },
  });
  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) { setNeedsReason(false); setReason(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">Resend to {who?.name || "the signer"}?</DialogTitle>
          <DialogDescription className="text-base">
            We&apos;ll email {who?.name || "them"} a link that opens &ldquo;{item?.title}&rdquo; so they can sign. Nothing is signed or changed. One reminder per person per day.
          </DialogDescription>
        </DialogHeader>
        {needsReason && (
          <div className="space-y-2">
            <p className="text-base">A reminder already went out in the last 24 hours. Only a Super Admin can send another today. Add a reason (it&apos;s logged).</p>
            <Label htmlFor="remind-reason">Reason</Label>
            <Textarea id="remind-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="h-11 px-6 text-base" disabled={send.isPending || (needsReason && reason.trim().length < 3)} onClick={() => send.mutate()}>{send.isPending ? "Sending…" : "Send reminder"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Staff: update investments that were signed but whose checklist was never rechecked. Marks nothing signed. */
function RecheckSigned({ onDone }: { onDone: () => void }) {
  const run = useServerFn(catchUpSignedInvestmentsFn);
  const m = useMutation({
    mutationFn: () => run(),
    onSuccess: (r: any) => { toast.success(r.rechecked ? `Updated ${r.rechecked} signed investment${r.rechecked === 1 ? "" : "s"}.` : "Every signed investment is already up to date."); onDone(); },
    onError: (e: Error) => toast.error(e.message || "The recheck couldn't run."),
  });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Checking..." : "Update signed investments"}</Button>
      <span className="text-sm text-muted-foreground">Updates checklists for investors whose signatures were recorded but never counted.</span>
    </div>
  );
}
