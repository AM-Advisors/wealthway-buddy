import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FundOnboardingLinkCard } from "@/components/fund-onboarding-link";
import { investorDetailFn, investorGridFn, lastRemindersFn, sendInvestorRemindersFn } from "@/lib/fund-tabs.functions";
import { reminderAllowed, reminderStep } from "@/lib/fund-health";
import { toast } from "sonner";
import { fmtDate, usd } from "./shared";

export function InvestorsTab({ fundId }: { fundId: string }) {
  const load = useServerFn(investorGridFn);
  const q = useQuery({ queryKey: ["fund-investor-grid", fundId], queryFn: () => load({ data: { fundId } }) });
  const [open, setOpen] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const rows = q.data ?? [];
  const loadLast = useServerFn(lastRemindersFn);
  const remind = useServerFn(sendInvestorRemindersFn);
  const lq = useQuery({ queryKey: ["fund-reminders", fundId], queryFn: () => loadLast({ data: { fundId } }) });
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const canRemind = (r: any) => !!r.email && !!reminderStep(r.stage, r.docs, r.wiring) && reminderAllowed(lq.data?.[r.id] ?? null);
  async function sendReminders() {
    setSending(true);
    try {
      const res = await remind({ data: { fundId, onboardingIds: picked } });
      const sent = res.filter((x) => x.outcome === "sent").length;
      const other = res.length - sent;
      toast.success(`${sent} reminder${sent === 1 ? "" : "s"} sent${other ? `, ${other} skipped or failed` : ""}.`);
      setPicked([]);
      await lq.refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setSending(false); }
  }
  return (
    <div className="space-y-6">
    <FundOnboardingLinkCard fundId={fundId} />
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Investors</CardTitle>
          <CardDescription>Click an investor to see everything for this deal. Received counts only money matched to the bank.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!picked.length || sending} onClick={sendReminders}>{sending ? "Sending…" : `Send reminder${picked.length ? ` (${picked.length})` : ""}`}</Button>
          <Button size="sm" onClick={() => setInvite(true)}>Add / invite investors</Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
         q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
         rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No investors yet. Use "Add / invite investors" to share your fund's invite link.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="w-8 py-2"><span className="sr-only">Select for reminder</span></th><th className="py-2">Name</th><th>Email</th><th>Phone</th><th className="text-right">Committed</th><th className="text-right">Received</th><th>KYC/KYB & AML</th><th>Fund documents</th><th>Wiring</th><th>Latest activity</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t hover:bg-muted" onClick={() => setOpen(r.id)}>
                    <td className="py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Remind ${r.name}`} disabled={!canRemind(r)} title={canRemind(r) ? "Select to send a reminder" : lq.data?.[r.id] ? "Reminded in the last 3 days" : "Nothing to remind"} checked={picked.includes(r.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id))} />
                    </td>
                    <td className="py-2"><p className="font-medium">{r.name}</p>{r.profileName && <p className="text-xs text-muted-foreground">{r.profileName}</p>}</td>
                    <td className="break-all">{r.email ?? "-"}</td>
                    <td>{r.phone ?? "-"}</td>
                    <td className="text-right">{usd(r.committedCents)}</td>
                    <td className="text-right">{usd(r.receivedCents)}</td>
                    <td><Badge variant={r.kycOk ? "secondary" : "outline"} className="whitespace-nowrap capitalize">{r.kycLabel}</Badge></td>
                    <td><Badge variant={r.docs === "Signed" ? "secondary" : "outline"}>{r.docs}</Badge></td>
                    <td><Badge variant={r.wiring === "Funded" ? "secondary" : "outline"}>{r.wiring}</Badge></td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(r.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <InvestorSheet fundId={fundId} id={open} onClose={() => setOpen(null)} />
      <Dialog open={invite} onOpenChange={setInvite}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add or invite investors</DialogTitle>
            <DialogDescription>Share this secure link. Each investor creates their own account and completes About You, Verification, Sign and Fund.</DialogDescription>
          </DialogHeader>
          <FundOnboardingLinkCard fundId={fundId} />
        </DialogContent>
      </Dialog>
    </Card>
    </div>
  );
}

function InvestorSheet({ fundId, id, onClose }: { fundId: string; id: string | null; onClose: () => void }) {
  const load = useServerFn(investorDetailFn);
  const q = useQuery({ queryKey: ["fund-investor", fundId, id], queryFn: () => load({ data: { fundId, onboardingId: id! } }), enabled: !!id });
  const d = q.data;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{d?.name ?? "Investor"}</SheetTitle>
          <SheetDescription>{d?.profileName ?? "Details for this fund only."}</SheetDescription>
        </SheetHeader>
        {q.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : d && (
          <div className="mt-4 space-y-5 text-sm">
            {d.investorUserId ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/manager/messages"
                  search={{ open: d.applicationId ?? undefined }}
                >
                  Open private messages
                </Link>
              </Button>
            ) : null}
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["Email", d.email], ["Phone", d.phone], ["Address", d.address], ["Citizenship", d.citizenship],
                ["Tax ID", d.taxIdLast4 ? `•••• ${d.taxIdLast4}` : null], ["Class", d.classKey],
                ["Committed", usd(d.committedCents)], ["Received", usd(d.receivedCents)],
                ["Investment date", d.investmentDate ? fmtDate(d.investmentDate) : null], ["Stage", d.stage.replace(/_/g, " ")],
                ["KYC/KYB & AML", d.kycLabel], ["Fund documents", d.docs], ["Wiring", d.wiring], ["Latest activity", fmtDate(d.lastActivity)],
              ].map(([k, v]) => <div key={k as string}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words capitalize-first">{v || "-"}</dd></div>)}
            </dl>
            <section>
              <h4 className="mb-1 font-medium">Open items</h4>
              {d.openItems.length ? <ul className="list-disc pl-5 text-muted-foreground">{d.openItems.map((t: string) => <li key={t}>{t}</li>)}</ul> : <p className="text-muted-foreground">Nothing open.</p>}
            </section>
            <section>
              <h4 className="mb-1 font-medium">Documents</h4>
              {d.documents.length ? (
                <ul className="divide-y rounded-md border">{d.documents.map((x: any) => <li key={x.id} className="flex justify-between gap-2 p-2"><span>{x.file_name}</span><span className="text-xs text-muted-foreground">{String(x.doc_kind).replace(/_/g, " ")}</span></li>)}</ul>
              ) : <p className="text-muted-foreground">No documents uploaded for this deal yet.</p>}
            </section>
            <section>
              <h4 className="mb-1 font-medium">Side letters</h4>
              {d.sideLetters.length ? d.sideLetters.map((s: any) => <p key={s.id}><Badge variant="secondary" className="mr-2">{s.status}</Badge>{s.effective_date ? fmtDate(s.effective_date) : ""}</p>) : <p className="text-muted-foreground">None.</p>}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
