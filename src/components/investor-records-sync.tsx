import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { investorSyncStatusFn, resolveSyncItemFn, runInvestorSyncFn } from "@/lib/fund-integrity.functions";
import { CONFIDENCE_LABELS, type SyncAction } from "@/lib/fund-integrity";

const ACTION_LABELS: Record<SyncAction, string> = {
  open: "Open Investor", create_investor: "Create New Investor", link: "Link", add_to_fund: "Add to This Fund",
  not_investor: "Not an Investor", review_later: "Review Later", create_folder: "Create Folder", mark_reviewed: "Mark Reviewed", dismiss: "Dismiss",
};

/**
 * Harmonious-only Investor Records Sync. Reconciliation, not import: the run
 * changes no canonical record; each finding is resolved individually.
 */
export function InvestorRecordsSync({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(investorSyncStatusFn);
  const run = useServerFn(runInvestorSyncFn);
  const resolve = useServerFn(resolveSyncItemFn);
  const key = ["investor-sync", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ itemId: string; action: SyncAction } | null>(null);
  const [person, setPerson] = useState({ firstName: "", lastName: "", email: "", profileType: "individual" });

  const runM = useMutation({
    mutationFn: () => run({ data: { offeringId: fundId } }),
    onSuccess: (d) => { qc.setQueryData(key, d); setOpen(true); toast.success("Investor records checked. Nothing was changed."); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "The sync could not run."),
  });
  const resolveM = useMutation({
    mutationFn: (v: { itemId: string; action: SyncAction; extra?: Record<string, unknown> }) => resolve({ data: { itemId: v.itemId, action: v.action, ...(v.extra ?? {}) } as any }),
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["fund-investor-records"] }); toast.success("Saved."); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "That could not be saved."),
  });

  if (q.error) return null; // not staff
  const d = q.data;
  const pending = (d?.items ?? []).filter((i) => i.status !== "resolved" && i.status !== "dismissed");

  const act = (itemId: string, action: SyncAction, onboardingId: string | null) => {
    if (action === "open") { if (onboardingId) window.location.assign(`/manager/fund/${fundId}/investor/${onboardingId}`); return; }
    if (action === "create_investor" || action === "add_to_fund") { setForm({ itemId, action }); return; }
    resolveM.mutate({ itemId, action });
  };

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Investor Records Sync</CardTitle>
          <CardDescription>Harmonious only. Compares this Fund&apos;s investors with its restricted investor records. Nothing is changed until you choose an action.</CardDescription>
        </div>
        <Button size="sm" onClick={() => runM.mutate()} disabled={runM.isPending}>{runM.isPending ? "Checking…" : "Sync Investor Records"}</Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Last checked</dt><dd>{d?.lastCheckedAt ? new Date(d.lastCheckedAt).toLocaleString() : "Never"}</dd></div>
          <div><dt className="text-muted-foreground">Matched</dt><dd>{d?.summary.matched ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Needs review</dt><dd>{d?.summary.needsReview ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Unmatched</dt><dd>{d?.summary.unmatched ?? 0}</dd></div>
        </dl>
        {d?.driveNote ? <p className="text-muted-foreground">{d.driveNote}</p> : null}
        {pending.length > 0 && (
          <Button variant="link" className="h-auto p-0" onClick={() => setOpen((v) => !v)}>{open ? "Hide items" : `Review ${pending.length} item${pending.length === 1 ? "" : "s"}`}</Button>
        )}
        {open && (
          <ul className="space-y-2">
            {pending.map((i) => (
              <li key={i.id} className="rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words font-medium">{i.title}</span>
                  <Badge variant="outline">{i.categoryLabel}</Badge>
                  {i.confidence && i.confidence in CONFIDENCE_LABELS ? <Badge variant="secondary">{CONFIDENCE_LABELS[i.confidence as keyof typeof CONFIDENCE_LABELS]}</Badge> : null}
                  {i.status === "later" ? <Badge variant="outline">Review later</Badge> : null}
                  {i.protected ? <Badge variant="destructive">Funded/closed — protected</Badge> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {i.actions.map((a) => (
                    <Button key={a} size="sm" variant={a === "review_later" || a === "not_investor" || a === "dismiss" ? "ghost" : "secondary"} disabled={resolveM.isPending || (a === "link" && !i.onboardingId)} onClick={() => act(i.id, a, i.onboardingId)}>
                      {ACTION_LABELS[a]}
                    </Button>
                  ))}
                </div>
                {form?.itemId === i.id && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {form.action === "create_investor" && (
                      <>
                        <Input placeholder="First name" value={person.firstName} onChange={(e) => setPerson({ ...person, firstName: e.target.value })} />
                        <Input placeholder="Last name" value={person.lastName} onChange={(e) => setPerson({ ...person, lastName: e.target.value })} />
                        <Input placeholder="Email" type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
                      </>
                    )}
                    <select className="h-9 rounded-md border bg-background px-2" value={person.profileType} onChange={(e) => setPerson({ ...person, profileType: e.target.value })} aria-label="Investing profile">
                      <option value="individual">Individual</option><option value="joint">Joint</option><option value="entity">Entity</option><option value="trust">Trust</option><option value="ira">IRA / Retirement</option>
                    </select>
                    <Button size="sm" disabled={resolveM.isPending} onClick={() => resolveM.mutate({
                      itemId: i.id, action: form.action,
                      extra: { profileType: person.profileType, ...(form.action === "create_investor" ? { person: { firstName: person.firstName, lastName: person.lastName, email: person.email } } : {}) },
                    })}>Confirm</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
