import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  listPackagesFn,
  notifyPackageManagersFn,
  packageActionFn,
  packageHistoryFn,
  savePackageFn,
} from "@/lib/financial-statement-packages.functions";

type Mode = "staff" | "manager";
const KEY = ["financial-statement-packages"];

const STATUS: Record<string, string> = {
  draft: "Prepare",
  in_review: "Harmonious review",
  manager_review: "Fund manager approval",
  approved: "Approved",
  returned: "Returned for changes",
};
const REPORT_LABEL: Record<string, string> = {
  balance_sheet: "Balance sheet",
  income_statement: "Income statement",
  changes_in_capital: "Capital activity",
};
const ACTION_LABEL: Record<string, string> = {
  prepared: "Prepared",
  submit: "Submitted for review",
  review_pass: "Reviewed and sent to fund manager",
  return: "Returned by Harmonious",
  manager_approve: "Approved by fund manager",
  manager_return: "Returned by fund manager",
  manager_notified: "Fund manager emailed",
};

const money = (c: unknown) =>
  typeof c === "number" ? (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD" }) : null;

function Steps({ status }: { status: string }) {
  const order = ["draft", "in_review", "manager_review", "approved"];
  const at = status === "returned" ? 0 : order.indexOf(status);
  const labels = ["Prepare", "Review", "Approve"];
  return (
    <ol className="flex gap-2 text-xs">
      {labels.map((l, i) => {
        const done = at > i || status === "approved";
        const current = at === i && status !== "approved";
        return (
          <li
            key={l}
            className={`rounded-full border px-2 py-0.5 ${done ? "border-primary bg-primary text-primary-foreground" : current ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            {i + 1}. {l}
          </li>
        );
      })}
    </ol>
  );
}

function Figures({ figures }: { figures: Record<string, any> }) {
  const keys = Object.keys(REPORT_LABEL);
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {keys.map((k) => {
        const f = figures?.[k];
        const totals = f?.totals && typeof f.totals === "object" ? Object.entries(f.totals as Record<string, unknown>).slice(0, 4) : [];
        return (
          <div key={k} className="rounded-md border border-border p-3 text-sm">
            <p className="font-medium">{REPORT_LABEL[k]}</p>
            {f ? (
              <>
                <p className="text-xs text-muted-foreground">Version {f.version} · {f.status}</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {totals.map(([n, v]) => (
                    <li key={n} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{n.replace(/_/g, " ")}</span>
                      <span>{money(v) ?? String(v)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No approved statement for this period yet.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function History({ id }: { id: string }) {
  const load = useServerFn(packageHistoryFn);
  const q = useQuery({ queryKey: [...KEY, "history", id], queryFn: () => load({ data: { id } }) });
  if (q.isLoading) return <p className="text-xs text-muted-foreground">Loading history…</p>;
  return (
    <ul className="space-y-1 text-xs">
      {(q.data?.events ?? []).map((e, i) => (
        <li key={i}>
          <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span> - {e.who},{" "}
          {new Date(e.at).toLocaleString()}
          {e.note ? <span className="text-muted-foreground"> · “{e.note}”</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Editor({ funds, initial, onDone }: { funds: { id: string; name: string }[]; initial?: any; onDone: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(savePackageFn);
  const [f, setF] = useState({
    offeringId: initial?.offeringId ?? funds[0]?.id ?? "",
    periodType: (initial?.periodType ?? "quarterly") as "quarterly" | "annual",
    periodStart: initial?.periodStart ?? "",
    periodEnd: initial?.periodEnd ?? "",
    notes: initial?.notes ?? "",
  });
  const m = useMutation({
    mutationFn: () => save({ data: { ...f, id: initial?.id } }),
    onSuccess: () => { toast.success("Package saved"); qc.invalidateQueries({ queryKey: KEY }); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm sm:col-span-2">Fund
          <select className={input} value={f.offeringId} disabled={!!initial} onChange={(e) => setF({ ...f, offeringId: e.target.value })}>
            {funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Period
          <select className={input} value={f.periodType} onChange={(e) => setF({ ...f, periodType: e.target.value as any })}>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        <div />
        <label className="text-sm">Start
          <input type="date" className={input} value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
        </label>
        <label className="text-sm">End
          <input type="date" className={input} value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
        </label>
      </div>
      <label className="block text-sm">Notes and commentary
        <textarea className={`${input} min-h-28`} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </label>
      <p className="text-xs text-muted-foreground">
        The balance sheet, income statement and capital activity are pulled from the approved statements in Financial reporting for the period end.
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={m.isPending || !f.offeringId || !f.periodStart || !f.periodEnd} onClick={() => m.mutate()} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
          {m.isPending ? "Saving…" : "Save draft"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel</button>
      </div>
    </div>
  );
}

function PackageCard({ p, mode, funds }: { p: any; mode: Mode; funds: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const act = useServerFn(packageActionFn);
  const notify = useServerFn(notifyPackageManagersFn);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const m = useMutation({
    mutationFn: (action: any) => act({ data: { id: p.id, action, note } }),
    onSuccess: () => { toast.success("Saved"); setNote(""); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const n = useMutation({
    mutationFn: () => notify({ data: { id: p.id } }),
    onSuccess: (r) => { toast.success(`Emailed ${r.sent} fund manager(s)`); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (editing) return <Editor funds={funds} initial={p} onDone={() => setEditing(false)} />;
  const btn = "rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50";
  const primary = "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50";
  const canReview = mode === "staff" && p.status === "in_review" && !p.preparedByMe;
  const canApprove = mode === "manager" && p.canManagerApprove;
  return (
    <article className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{p.fundName} · {p.periodType === "annual" ? "Annual" : "Quarterly"} {p.periodStart} – {p.periodEnd}</p>
          <p className="text-xs text-muted-foreground">{STATUS[p.status] ?? p.status}</p>
        </div>
        <Steps status={p.status} />
      </div>
      {p.returnedNote && p.status === "returned" ? (
        <p className="rounded-md bg-muted p-2 text-sm">Returned: {p.returnedNote}</p>
      ) : null}
      <Figures figures={p.figures} />
      {p.notes ? <p className="whitespace-pre-wrap text-sm">{p.notes}</p> : null}

      {(canReview || canApprove) && (
        <textarea
          placeholder="Note (required to return)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {mode === "staff" && ["draft", "returned"].includes(p.status) && (
          <button type="button" className={btn} onClick={() => setEditing(true)}>Edit</button>
        )}
        {mode === "staff" && p.status === "draft" && (
          <button type="button" className={primary} disabled={m.isPending} onClick={() => m.mutate("submit")}>Submit for review</button>
        )}
        {mode === "staff" && p.status === "in_review" && p.preparedByMe && (
          <p className="text-xs text-muted-foreground">Waiting for another Harmonious team member to review.</p>
        )}
        {canReview && (
          <>
            <button type="button" className={primary} disabled={m.isPending} onClick={() => m.mutate("review_pass")}>Reviewed - send to fund manager</button>
            <button type="button" className={btn} disabled={m.isPending} onClick={() => m.mutate("return")}>Return</button>
          </>
        )}
        {mode === "staff" && p.status === "manager_review" && (
          p.managerNotifiedAt
            ? <p className="text-xs text-muted-foreground">Fund manager emailed {new Date(p.managerNotifiedAt).toLocaleDateString()}.</p>
            : <button type="button" className={btn} disabled={n.isPending} onClick={() => n.mutate()}>Email fund manager</button>
        )}
        {canApprove && (
          <>
            <button type="button" className={primary} disabled={m.isPending} onClick={() => m.mutate("manager_approve")}>Approve</button>
            <button type="button" className={btn} disabled={m.isPending} onClick={() => m.mutate("manager_return")}>Return</button>
          </>
        )}
        {mode === "manager" && p.status === "manager_review" && !p.canManagerApprove && (
          <p className="text-xs text-muted-foreground">You can't approve a package you prepared or reviewed.</p>
        )}
        <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setOpen(!open)}>
          {open ? "Hide history" : "History"}
        </button>
      </div>
      {open ? <History id={p.id} /> : null}
    </article>
  );
}

export function FinancialReviewPackages({ mode }: { mode: Mode }) {
  const load = useServerFn(listPackagesFn);
  const q = useQuery({ queryKey: KEY, queryFn: () => load() });
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"open" | "approved">("open");
  const d = q.data;
  const list = (d?.packages ?? []).filter((p) => (tab === "approved" ? p.status === "approved" : p.status !== "approved"));
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Financial reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "staff"
              ? "Quarterly and annual statement packages. Harmonious prepares, a different team member reviews, then the fund manager approves."
              : "Quarterly and annual financial statements prepared and reviewed by Harmonious, waiting for your approval."}
          </p>
        </div>
        {mode === "staff" && d?.isStaff && !creating && (
          <button type="button" onClick={() => setCreating(true)} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">New package</button>
        )}
      </header>
      {creating && d ? <Editor funds={d.funds} onDone={() => setCreating(false)} /> : null}
      <div className="flex gap-2 text-sm">
        {(["open", "approved"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 ${tab === t ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            {t === "open" ? (mode === "manager" ? "Waiting for approval" : "In progress") : "Approved"}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="space-y-4">
          {list.map((p) => <PackageCard key={p.id} p={p} mode={mode} funds={d?.funds ?? []} />)}
        </div>
      )}
    </div>
  );
}
