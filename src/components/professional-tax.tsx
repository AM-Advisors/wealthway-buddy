import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getProfessionalTax, getProfessionalTaxHistory, professionalTaxActionFn, getStaffTax, getStaffTaxHistory, staffTaxActionFn } from "@/lib/professional-tax.functions";

export type TaxMode = "professional" | "staff";

export type ProTaxKind = "1065" | "1042" | "1099";

export function money(c: number | null | undefined) {
  if (c == null) return "—";
  return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
export const statusLabel = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function useProfessionalTax(mode: TaxMode = "professional") {
  const loadPro = useServerFn(getProfessionalTax);
  const loadStaff = useServerFn(getStaffTax);
  return useQuery({ queryKey: [mode === "staff" ? "staff-tax" : "professional-tax"], queryFn: () => (mode === "staff" ? loadStaff() : loadPro()) });
}

type Row = Awaited<ReturnType<typeof getProfessionalTax>>["returns1065"][number];

export function TaxFormTable({ title, rows, empty, mode = "professional" }: { title: string; rows: Row[]; empty: string; mode?: TaxMode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold">{title} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span></h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium">{r.fundName} · {r.taxYear}</p>
                <p className="text-xs text-muted-foreground">{r.label} · {money(r.amountCents)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "review" ? "default" : "secondary"}>{statusLabel(r.status)}</Badge>
                <Button size="sm" variant={r.actions.length ? "default" : "outline"} asChild>
                  {mode === "staff" ? (
                    <Link to="/ops/tax/$kind/$id" params={{ kind: r.kind, id: r.id }}>
                      {r.actions.includes("approve") ? "Review" : r.actions.length ? "Prepare" : "Open"}
                    </Link>
                  ) : (
                    <Link to="/professional/tax/$kind/$id" params={{ kind: r.kind, id: r.id }}>
                      {r.actions.includes("approve") ? "Review" : r.actions.length ? "Prepare" : "Open"}
                    </Link>
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ACTION_LABEL: Record<string, string> = {
  mark_prepared: "Mark prepared",
  submit: "Submit for review",
  approve: "Approve",
  return: "Return for changes",
};

export function TaxFormReview({ kind, id, mode = "professional" }: { kind: ProTaxKind; id: string; mode?: TaxMode }) {
  const q = useProfessionalTax(mode);
  const qc = useQueryClient();
  const actPro = useServerFn(professionalTaxActionFn);
  const actStaff = useServerFn(staffTaxActionFn);
  const act = mode === "staff" ? actStaff : actPro;
  const histPro = useServerFn(getProfessionalTaxHistory);
  const histStaff = useServerFn(getStaffTaxHistory);
  const loadHistory = mode === "staff" ? histStaff : histPro;
  const history = useQuery({ queryKey: [`${mode}-tax-history`, kind, id], queryFn: () => loadHistory({ data: { kind, id } }) });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const list = kind === "1065" ? q.data!.returns1065 : kind === "1042" ? q.data!.returns1042 : q.data!.forms1099;
  const r = list.find((x) => x.id === id);
  if (!r) return <p className="text-sm text-muted-foreground">{mode === "staff" ? "That form wasn't found." : "This form isn't in your delegated scope."}</p>;
  const recipients = kind === "1042" ? q.data!.forms1042s.filter((s) => s.fundName === r.fundName && s.taxYear === r.taxYear) : [];

  const run = async (action: string) => {
    setBusy(true);
    try {
      await act({ data: { kind, id, action: action as any, note: note.trim() || undefined } });
      toast.success(`${ACTION_LABEL[action]} — recorded`);
      setNote("");
      await Promise.all([qc.invalidateQueries({ queryKey: [mode === "staff" ? "staff-tax" : "professional-tax"] }), history.refetch()]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-heading text-xl font-semibold">{r.label}</p>
            <p className="text-sm text-muted-foreground">{r.fundName} · Tax year {r.taxYear}</p>
          </div>
          <Badge>{statusLabel(r.status)}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">{kind === "1065" ? "Taxable income" : kind === "1042" ? "Tax withheld" : "Total reported"}</dt><dd className="font-medium">{money(r.amountCents)}</dd></div>
          <div><dt className="text-muted-foreground">Filing</dt><dd className="font-medium">{statusLabel(r.filingStatus ?? "not_filed")}</dd></div>
          <div><dt className="text-muted-foreground">Your permissions</dt><dd className="font-medium">{[r.canPrepare && "Prepare", r.canReview && "Review"].filter(Boolean).join(", ") || "View only"}</dd></div>
        </dl>
      </div>

      {recipients.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">1042-S recipient forms</h2>
          <ul className="divide-y rounded-md border text-sm">
            {recipients.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>{s.label}</span>
                <span className="text-muted-foreground">Gross {money(s.grossCents)} · Withheld {money(s.withheldCents)} · {statusLabel(s.status)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-heading text-lg font-semibold">Prepare and review</h2>
        {r.actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {r.status === "approved" ? "Approved. Harmonious handles filing and delivery — nothing is filed from here." : "No step is available to you at this stage."}
          </p>
        ) : (
          <>
            <Textarea placeholder="Note (required to return for changes)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <div className="flex flex-wrap gap-2">
              {r.actions.map((a) => (
                <Button key={a} size="sm" variant={a === "return" ? "outline" : "default"} disabled={busy || (a === "return" && !note.trim())} onClick={() => run(a)}>
                  {ACTION_LABEL[a]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Whoever prepares or submits a form cannot approve it. Filing and delivery stay with Harmonious.</p>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">History</h2>
        {history.data?.length ? (
          <ul className="space-y-1 text-sm">
            {history.data.map((e) => (
              <li key={e.id}>
                <span className="font-medium">{statusLabel(e.event)}</span>
                {e.from && e.to && <span className="text-muted-foreground"> · {statusLabel(e.from)} → {statusLabel(e.to)}</span>}
                <span className="text-muted-foreground"> · {new Date(e.at).toLocaleString()}</span>
                {e.note && <span> — {e.note}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No history yet.</p>}
      </section>
    </div>
  );
}
