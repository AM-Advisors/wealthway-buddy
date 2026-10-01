import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  decideSideLetterChange,
  listSideLetters,
  proposeSideLetterChange,
  recordMfnDecision,
} from "@/lib/side-letters.functions";
import {
  emptySnapshot,
  MFN_DECISIONS,
  MFN_SCOPES,
  TERM_CATEGORIES,
  type SideLetterSnapshot,
  type SideLetterTerm,
} from "@/lib/side-letter-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const catLabel = (k: string) => TERM_CATEGORIES.find((c) => c.key === k)?.label ?? k;
const scopeLabel = (k: string | null) => MFN_SCOPES.find((s) => s.key === k)?.label ?? "—";
const expiryBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  expiring: { label: "Expiring within 60 days", variant: "secondary" },
  expired: { label: "Expired", variant: "destructive" },
  not_effective: { label: "Not yet effective", variant: "outline" },
};

type SideLetterList = {
  userId: string;
  actorKind: string;
  canPropose: boolean;
  letters: { id: string; onboardingId: string | null; status: string; version: number; snapshot: SideLetterSnapshot; expiry: string }[];
  requests: {
    id: string; sideLetterId: string; kind: string; before: SideLetterSnapshot | null; after: SideLetterSnapshot;
    reason: string; proposedBy: string; proposerKind: string; status: string; createdAt: string; canDecide: boolean;
  }[];
  mfnQueue: { sourceId: string; termId: string; holderId: string }[];
  mfnReviews: { id: string; sourceId: string; termId: string; holderId: string; decision: string; reason: string }[];
  events: { id: string; sideLetterId: string | null; event: string; createdAt: string; reason: string | null }[];
  investors: { onboardingId: string; label: string }[];
};

type Draft = {
  mode: "create" | "amend" | "terminate";
  sideLetterId: string | null;
  onboardingId: string | null;
  snapshot: SideLetterSnapshot;
  reason: string;
};

export function SideLetterRegistry({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listSideLetters);
  const propose = useServerFn(proposeSideLetterChange);
  const decide = useServerFn(decideSideLetterChange);
  const mfn = useServerFn(recordMfnDecision);
  const key = ["side-letters", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { fundId } }) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const proposeM = useMutation({
    mutationFn: (d: Draft) =>
      propose({
        data: { fundId, sideLetterId: d.sideLetterId, onboardingId: d.onboardingId, kind: d.mode, snapshot: d.snapshot, reason: d.reason },
      }),
    onSuccess: () => {
      toast.success("Proposal recorded. A different person must approve it.");
      setDraft(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const decideM = useMutation({
    mutationFn: (v: { requestId: string; decision: "approved" | "declined" | "withdrawn"; reason?: string | undefined }) =>
      decide({ data: { requestId: v.requestId, decision: v.decision, ...(v.reason ? { reason: v.reason } : {}) } }),
    onSuccess: () => {
      toast.success("Decision recorded.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mfnM = useMutation({
    mutationFn: (v: { sourceId: string; termId: string; holderId: string; decision: (typeof MFN_DECISIONS)[number]; reason: string }) =>
      mfn({ data: { fundId, ...v } }),
    onSuccess: () => {
      toast.success("MFN decision recorded.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading side letters…</CardContent></Card>;
  if (q.error) return <Card><CardContent className="p-6 text-sm text-destructive">{(q.error as Error).message}</CardContent></Card>;
  const d = q.data as unknown as SideLetterList;
  const letterById = new Map(d.letters.map((l) => [l.id, l]));
  const pending = d.requests.filter((r) => r.status === "pending");
  const canMfn = d.actorKind === "staff" || d.actorKind === "manager";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Side letters</CardTitle>
            <CardDescription>
              Record of investor-specific terms. Changes need approval by a different person. Side letters never change fees,
              capital accounts or distributions automatically, and never block onboarding or launch.
            </CardDescription>
          </div>
          {d.canPropose ? (
            <Button onClick={() => setDraft({ mode: "create", sideLetterId: null, onboardingId: null, snapshot: emptySnapshot(), reason: "" })}>
              New side letter
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {d.letters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No side letters recorded for this fund.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Investor</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Terms</th>
                    <th className="py-2 pr-4">MFN</th>
                    <th className="py-2 pr-4">Expiry</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {d.letters.map((l) => {
                    const b = expiryBadge[l.expiry]!;
                    const hasPending = pending.some((p) => p.sideLetterId === l.id);
                    return (
                      <tr key={l.id} className="border-t align-top">
                        <td className="py-2 pr-4 font-medium">{l.snapshot.investorLabel}</td>
                        <td className="py-2 pr-4 space-x-1">
                          <Badge variant="outline" className="capitalize">{l.status}</Badge>
                          {l.status === "active" ? <Badge variant={b.variant}>{b.label}</Badge> : null}
                          {hasPending ? <Badge variant="secondary">Change pending</Badge> : null}
                        </td>
                        <td className="py-2 pr-4">{l.snapshot.terms.length}</td>
                        <td className="py-2 pr-4">{l.snapshot.mfnEnabled ? scopeLabel(l.snapshot.mfnScope) : "No"}</td>
                        <td className="py-2 pr-4">{l.snapshot.expiryDate ?? "None"}</td>
                        <td className="py-2 text-right space-x-2 whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === l.id ? null : l.id)}>
                            {openId === l.id ? "Hide" : "View"}
                          </Button>
                          {d.canPropose && l.status === "active" && !hasPending ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setDraft({ mode: "amend", sideLetterId: l.id, onboardingId: l.onboardingId, snapshot: structuredClone(l.snapshot), reason: "" })}>
                                Propose change
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDraft({ mode: "terminate", sideLetterId: l.id, onboardingId: l.onboardingId, snapshot: structuredClone(l.snapshot), reason: "" })}>
                                Terminate
                              </Button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {openId && letterById.get(openId) ? (
            <LetterDetail
              letter={letterById.get(openId)!}
              events={d.events.filter((e) => e.sideLetterId === openId)}
              reviews={d.mfnReviews.filter((r) => r.holderId === openId || r.sourceId === openId)}
              labelOf={(id) => letterById.get(id)?.snapshot.investorLabel ?? "—"}
            />
          ) : null}
        </CardContent>
      </Card>

      {draft ? (
        <DraftForm
          draft={draft}
          investors={d.investors}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSubmit={() => proposeM.mutate(draft)}
          busy={proposeM.isPending}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Approvals</CardTitle>
          <CardDescription>Pending side letter proposals. You cannot approve your own proposal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting.</p> : null}
          {pending.map((r) => (
            <PendingRow
              key={r.id}
              r={r}
              isMine={r.proposedBy === d.userId}
              onDecide={(decision, reason) => decideM.mutate({ requestId: r.id, decision, reason })}
              busy={decideM.isPending}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MFN / equal treatment review</CardTitle>
          <CardDescription>
            Other MFN holders who may be entitled to an approved term. Each needs an explicit decision; nothing is applied automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {d.mfnQueue.length === 0 ? <p className="text-sm text-muted-foreground">No open MFN reviews.</p> : null}
          {d.mfnQueue.map((m) => {
            const src = letterById.get(m.sourceId);
            const term = src?.snapshot.terms.find((t) => t.id === m.termId);
            return (
              <MfnRow
                key={`${m.sourceId}-${m.termId}-${m.holderId}`}
                holder={letterById.get(m.holderId)?.snapshot.investorLabel ?? "—"}
                source={src?.snapshot.investorLabel ?? "—"}
                term={term}
                canDecide={canMfn}
                busy={mfnM.isPending}
                onDecide={(decision, reason) => mfnM.mutate({ ...m, decision, reason })}
              />
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function LetterDetail({
  letter,
  events,
  reviews,
  labelOf,
}: {
  letter: { snapshot: SideLetterSnapshot; version: number };
  events: { id: string; event: string; createdAt: string; reason: string | null }[];
  reviews: { id: string; sourceId: string; holderId: string; termId: string; decision: string; reason: string }[];
  labelOf: (id: string) => string;
}) {
  const s = letter.snapshot;
  return (
    <div className="mt-4 rounded-md border p-4 space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <div><span className="text-muted-foreground">Version</span><div>{letter.version}</div></div>
        <div><span className="text-muted-foreground">Effective</span><div>{s.effectiveDate ?? "—"}</div></div>
        <div><span className="text-muted-foreground">Expiry</span><div>{s.expiryDate ?? "None"}</div></div>
        <div><span className="text-muted-foreground">MFN</span><div>{s.mfnEnabled ? scopeLabel(s.mfnScope) : "No"}</div></div>
        <div><span className="text-muted-foreground">Signed document</span><div>{s.documentReference ?? "—"}</div></div>
        <div><span className="text-muted-foreground">Renewal</span><div>{s.renewalNote ?? "—"}</div></div>
      </div>
      <div>
        <div className="font-medium mb-1">Terms</div>
        {s.terms.length === 0 ? <p className="text-muted-foreground">No terms.</p> : null}
        <ul className="space-y-1">
          {s.terms.map((t) => (
            <li key={t.id}>
              <Badge variant="outline" className="mr-2">{catLabel(t.category)}</Badge>
              {t.description}
              {t.value ? <span className="text-muted-foreground"> — {t.value}</span> : null}
              {t.applicability ? <span className="text-muted-foreground"> ({t.applicability})</span> : null}
            </li>
          ))}
        </ul>
      </div>
      {reviews.length ? (
        <div>
          <div className="font-medium mb-1">MFN decisions</div>
          <ul className="space-y-1">
            {reviews.map((r) => (
              <li key={r.id}>
                {labelOf(r.holderId)} ← {labelOf(r.sourceId)}: <span className="capitalize">{r.decision.replace("_", " ")}</span> — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <div className="font-medium mb-1">History</div>
        <ul className="space-y-1 text-muted-foreground">
          {events.map((e) => (
            <li key={e.id}>
              {new Date(e.createdAt).toLocaleString()} — {e.event.replace(/_/g, " ")}
              {e.reason ? `: ${e.reason}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DraftForm({
  draft,
  investors,
  onChange,
  onCancel,
  onSubmit,
  busy,
}: {
  draft: Draft;
  investors: { onboardingId: string; label: string }[];
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const s = draft.snapshot;
  const set = (patch: Partial<SideLetterSnapshot>) => onChange({ ...draft, snapshot: { ...s, ...patch } });
  const setTerm = (i: number, patch: Partial<SideLetterTerm>) =>
    set({ terms: s.terms.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const terminating = draft.mode === "terminate";
  const title = draft.mode === "create" ? "New side letter" : terminating ? "Propose termination" : "Propose change";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>This creates a proposal. It takes effect only after a different eligible person approves it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!terminating ? (
          <>
            {draft.mode === "create" ? (
              <div className="space-y-1">
                <Label>Investor</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={draft.onboardingId ?? ""}
                  onChange={(e) => {
                    const inv = investors.find((i) => i.onboardingId === e.target.value);
                    onChange({ ...draft, onboardingId: inv?.onboardingId ?? null, snapshot: { ...s, investorLabel: inv?.label ?? s.investorLabel } });
                  }}
                >
                  <option value="">Not linked yet (enter a name below)</option>
                  {investors.map((i) => (
                    <option key={i.onboardingId} value={i.onboardingId}>{i.label}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Investor name on letter</Label>
                <Input value={s.investorLabel} onChange={(e) => set({ investorLabel: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Signed document reference</Label>
                <Input value={s.documentReference ?? ""} placeholder="Offering document name or file" onChange={(e) => set({ documentReference: e.target.value || null })} />
              </div>
              <div className="space-y-1">
                <Label>Effective date</Label>
                <Input type="date" value={s.effectiveDate ?? ""} onChange={(e) => set({ effectiveDate: e.target.value || null })} />
              </div>
              <div className="space-y-1">
                <Label>Expiry date (optional)</Label>
                <Input type="date" value={s.expiryDate ?? ""} onChange={(e) => set({ expiryDate: e.target.value || null })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Renewal note</Label>
                <Input value={s.renewalNote ?? ""} onChange={(e) => set({ renewalNote: e.target.value || null })} />
              </div>
              <div className="space-y-1">
                <Label>MFN rights</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={s.mfnEnabled ? (s.mfnScope ?? "") : "none"}
                  onChange={(e) =>
                    e.target.value === "none"
                      ? set({ mfnEnabled: false, mfnScope: null })
                      : set({ mfnEnabled: true, mfnScope: (e.target.value || null) as SideLetterSnapshot["mfnScope"] })
                  }
                >
                  <option value="none">No MFN</option>
                  {MFN_SCOPES.map((m) => (
                    <option key={m.key} value={m.key}>MFN — {m.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Terms</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => set({ terms: [...s.terms, { id: crypto.randomUUID(), category: "other", description: "", value: null, applicability: null }] })}
                >
                  Add term
                </Button>
              </div>
              {s.terms.map((t, i) => (
                <div key={t.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[180px_1fr_140px_auto]">
                  <select
                    className="rounded-md border bg-background px-2 py-2 text-sm"
                    value={t.category}
                    onChange={(e) => setTerm(i, { category: e.target.value as SideLetterTerm["category"] })}
                  >
                    {TERM_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <Input placeholder="Plain-language description" value={t.description} onChange={(e) => setTerm(i, { description: e.target.value })} />
                  <Input placeholder="Value (e.g. 1.5%)" value={t.value ?? ""} onChange={(e) => setTerm(i, { value: e.target.value || null })} />
                  <Button size="sm" variant="ghost" onClick={() => set({ terms: s.terms.filter((_, j) => j !== i) })}>Remove</Button>
                  <Input className="sm:col-span-4" placeholder="Applicability note (optional)" value={t.applicability ?? ""} onChange={(e) => setTerm(i, { applicability: e.target.value || null })} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm">The side letter for <strong>{s.investorLabel}</strong> will be marked terminated. It stays on record.</p>
        )}
        <div className="space-y-1">
          <Label>Reason for this proposal</Label>
          <Textarea value={draft.reason} onChange={(e) => onChange({ ...draft, reason: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <Button onClick={onSubmit} disabled={busy || draft.reason.trim().length < 3 || !s.investorLabel.trim()}>Submit for approval</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PendingRow({
  r,
  isMine,
  onDecide,
  busy,
}: {
  r: { kind: string; after: SideLetterSnapshot; before: SideLetterSnapshot | null; reason: string; proposerKind: string; createdAt: string; canDecide: boolean };
  isMine: boolean;
  onDecide: (d: "approved" | "declined" | "withdrawn", reason?: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const beforeTerms = new Set((r.before?.terms ?? []).map((t) => `${t.category}|${t.description}|${t.value ?? ""}`));
  const afterTerms = new Set(r.after.terms.map((t) => `${t.category}|${t.description}|${t.value ?? ""}`));
  return (
    <div className="rounded-md border p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="capitalize">{r.kind}</Badge>
        <span className="font-medium">{r.after.investorLabel}</span>
        <span className="text-muted-foreground">proposed by {r.proposerKind}{isMine ? " (you)" : ""} · {new Date(r.createdAt).toLocaleDateString()}</span>
      </div>
      <p>{r.reason}</p>
      {r.kind !== "terminate" ? (
        <ul className="text-xs space-y-0.5">
          {r.after.terms.map((t) => {
            const k = `${t.category}|${t.description}|${t.value ?? ""}`;
            return <li key={t.id}>{beforeTerms.has(k) ? "•" : "+"} {catLabel(t.category)}: {t.description}{t.value ? ` — ${t.value}` : ""}</li>;
          })}
          {(r.before?.terms ?? []).filter((t) => !afterTerms.has(`${t.category}|${t.description}|${t.value ?? ""}`)).map((t) => (
            <li key={t.id} className="text-destructive">− {catLabel(t.category)}: {t.description}</li>
          ))}
          <li className="text-muted-foreground">Expiry: {r.after.expiryDate ?? "None"} · MFN: {r.after.mfnEnabled ? scopeLabel(r.after.mfnScope) : "No"}</li>
        </ul>
      ) : null}
      {r.canDecide ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-sm" placeholder="Decision note (required to decline)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" disabled={busy} onClick={() => onDecide("approved", note || undefined)}>Approve</Button>
          <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => onDecide("declined", note)}>Decline</Button>
        </div>
      ) : isMine ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Waiting for a different person to approve.</span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide("withdrawn")}>Withdraw</Button>
        </div>
      ) : (
        <span className="text-muted-foreground">Waiting for an eligible approver.</span>
      )}
    </div>
  );
}

function MfnRow({
  holder,
  source,
  term,
  canDecide,
  busy,
  onDecide,
}: {
  holder: string;
  source: string;
  term: SideLetterTerm | undefined;
  canDecide: boolean;
  busy: boolean;
  onDecide: (d: (typeof MFN_DECISIONS)[number], reason: string) => void;
}) {
  const [decision, setDecision] = useState<(typeof MFN_DECISIONS)[number]>("offered");
  const [reason, setReason] = useState("");
  return (
    <div className="rounded-md border p-3 text-sm space-y-2">
      <div>
        <span className="font-medium">{holder}</span> may be entitled to{" "}
        <strong>{term ? `${catLabel(term.category)}: ${term.description}${term.value ? ` — ${term.value}` : ""}` : "a term"}</strong> granted to {source}.
      </div>
      {canDecide ? (
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-md border bg-background px-2 py-2 text-sm" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
            {MFN_DECISIONS.map((m) => (
              <option key={m} value={m} className="capitalize">{m.replace("_", " ")}</option>
            ))}
          </select>
          <Input className="max-w-sm" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" disabled={busy || reason.trim().length < 3} onClick={() => onDecide(decision, reason)}>Record decision</Button>
        </div>
      ) : (
        <span className="text-muted-foreground">Awaiting a manager or Harmonious decision.</span>
      )}
    </div>
  );
}
