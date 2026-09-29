import { createContext, useContext } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";

import { updateSetupTaskFn } from "@/lib/fund-setup.functions";
import { Button } from "@/components/ui/button";

/** Where in Fund Setup each item is actually completed. */
const SECTION: Record<string, [string, string]> = {
  client_profile: ["setup-details", "Fund Details"],
  fund_information: ["setup-details", "Fund Details"],
  offering_config: ["setup-details", "Fund Details"],
  investment_target: ["setup-details", "Fund Details"],
  client_service_providers: ["setup-details", "Fund Details"],
  entity_registered_agent: ["setup-details", "Fund Details"],
  client_signatories: ["setup-signatories", "Fund Signatories"],
  entity_formation: ["setup-entity", "Entity & EIN"],
  entity_ein: ["setup-entity", "Entity & EIN"],
  entity_active: ["setup-entity", "Entity & EIN"],
  tax_setup: ["setup-entity", "Entity & EIN"],
  docs_operating_agreement: ["setup-documents", "Offering Documents"],
  docs_subscription: ["setup-documents", "Offering Documents"],
  documents_current: ["setup-documents", "Offering Documents"],
  banking_account: ["setup-banking", "Banking"],
  banking_active: ["setup-banking", "Banking"],
  economics_terms: ["setup-economics", "Economics"],
  economics_approved: ["setup-economics", "Economics"],
  compliance_config: ["setup-admin", "Administration & Regulatory"],
  regulatory_reviewed: ["setup-admin", "Administration & Regulatory"],
  investor_eligibility: ["setup-admin", "Administration & Regulatory"],
  eligibility_approved: ["setup-admin", "Administration & Regulatory"],
  investor_onboarding_steps: ["setup-admin", "Administration & Regulatory"],
  onboarding_configured: ["setup-admin", "Administration & Regulatory"],
  accounting_book: ["setup-admin", "Administration & Regulatory"],
  reporting_configuration: ["setup-admin", "Administration & Regulatory"],
};

const STATUSES = [
  ["not_started", "Not started"],
  ["in_progress", "In progress"],
  ["waiting_on_client", "Waiting on client"],
  ["review", "In review"],
  ["complete", "Complete"],
] as const;

function GoTo({ k, canNavigate }: { k: string; canNavigate: boolean }) {
  const s = SECTION[k];
  if (!s || !canNavigate) return null;
  return (
    <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => document.getElementById(s[0])?.scrollIntoView({ behavior: "smooth" })}>
      Complete in {s[1]} <ArrowRight className="ml-1 h-3 w-3" />
    </Button>
  );
}

type Task = { id: string; key: string; label: string; status: string };
type Condition = { id: string; key: string; label: string; satisfied: boolean };

export function FundSetupChecklist({
  tasks, conditions, evidence, canEdit, canNavigate, onChanged,
}: {
  tasks: Task[]; conditions: Condition[]; evidence: { formation: boolean; certificate: boolean; einLetter: boolean };
  canEdit: boolean; canNavigate: boolean; onChanged: () => void;
}) {
  const update = useServerFn(updateSetupTaskFn);
  const setStatus = async (taskId: string, status: string) => {
    try {
      await update({ data: { taskId, status: status as any } });
      toast.success("Task updated");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };
  const open = tasks.filter((t) => t.status !== "complete").length;
  const icon = (done: boolean) => done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Formation documents</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {([["Formation document", evidence.formation], ["Certificate of formation", evidence.certificate], ["IRS EIN letter", evidence.einLetter]] as const).map(([l, ok]) => (
              <li key={l} className="flex items-start gap-2">{icon(ok)}<div><p>{l}{ok ? " — recorded" : ""}</p>{!ok && <GoTo k="entity_formation" canNavigate={canNavigate} />}</div></li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Ready to launch when</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {conditions.map((c) => (
              <li key={c.id} className="flex items-start gap-2">{icon(c.satisfied)}<div>
                <p>{c.label}</p>
                {!c.satisfied && (c.key === "blocking_tasks_complete"
                  ? <p className="text-xs text-muted-foreground">{open} setup task{open === 1 ? "" : "s"} left below.</p>
                  : c.key === "harmonious_approval"
                    ? <p className="text-xs text-muted-foreground">Second-person approval once everything else is complete.</p>
                    : <GoTo k={c.key} canNavigate={canNavigate} />)}
              </div></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-medium">Setup tasks</h3>
          <span className="text-xs text-muted-foreground">{tasks.length - open} of {tasks.length} complete</span>
        </div>
        <ul className="mt-3 divide-y text-sm">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="flex items-start gap-2">{icon(t.status === "complete")}<div><p>{t.label}</p>{t.status !== "complete" && <GoTo k={t.key} canNavigate={canNavigate} />}</div></div>
              {canEdit ? (
                <select aria-label={`Status for ${t.label}`} className="h-8 rounded-md border bg-background px-2 text-xs" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
                  {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  {t.status === "exception" && <option value="exception">Exception</option>}
                </select>
              ) : <span className="text-xs text-muted-foreground">{STATUSES.find(([v]) => v === t.status)?.[1] ?? t.status}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Requirements placed inside each Fund Setup section ---------- */

type Req = {
  tasks: Task[]; conditions: Condition[]; evidence: { formation: boolean; certificate: boolean; einLetter: boolean };
  canEdit: boolean; approvalCount: number; onChanged: () => void;
};
const ReqCtx = createContext<Req | null>(null);
export const SetupRequirementsProvider = ReqCtx.Provider;

function useSetStatus(onChanged: () => void) {
  const update = useServerFn(updateSetupTaskFn);
  return async (taskId: string, status: string) => {
    try { await update({ data: { taskId, status: status as any } }); toast.success("Task updated"); onChanged(); }
    catch (e: any) { toast.error(e.message); }
  };
}

/** Required tasks, launch conditions and evidence completed in this section. */
export function RequiredHere({ section }: { section: string }) {
  const r = useContext(ReqCtx);
  const setStatus = useSetStatus(r?.onChanged ?? (() => {}));
  if (!r) return null;
  const tasks = r.tasks.filter((t) => SECTION[t.key]?.[0] === section);
  const conds = r.conditions.filter((c) => SECTION[c.key]?.[0] === section);
  const ev = section === "setup-entity"
    ? ([["Formation document", r.evidence.formation], ["Certificate of formation", r.evidence.certificate], ["IRS EIN letter", r.evidence.einLetter]] as const)
    : [];
  if (!tasks.length && !conds.length && !ev.length) return null;
  const left = tasks.filter((t) => t.status !== "complete").length + conds.filter((c) => !c.satisfied).length + ev.filter(([, ok]) => !ok).length;
  const icon = (done: boolean) => done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">Required in this section</p>
        <span className="text-xs text-muted-foreground">{left === 0 ? "All complete" : `${left} to complete`}</span>
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {ev.map(([l, ok]) => <li key={l} className="flex items-start gap-2">{icon(ok)}<span>{l}{ok ? " — recorded" : " — upload below"}</span></li>)}
        {conds.map((c) => <li key={c.id} className="flex items-start gap-2">{icon(c.satisfied)}<span>{c.label} <span className="text-xs text-muted-foreground">(launch condition)</span></span></li>)}
        {tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-start gap-2">{icon(t.status === "complete")}{t.label}</span>
            {r.canEdit ? (
              <select aria-label={`Status for ${t.label}`} className="h-7 rounded-md border bg-background px-2 text-xs" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                {t.status === "exception" && <option value="exception">Exception</option>}
              </select>
            ) : <span className="text-xs text-muted-foreground">{STATUSES.find(([v]) => v === t.status)?.[1] ?? t.status}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Final launch readiness: overall task count and second-person approval. */
export function LaunchRequirements() {
  const r = useContext(ReqCtx);
  if (!r) return null;
  const open = r.tasks.filter((t) => t.status !== "complete").length;
  const unplaced = r.tasks.filter((t) => !SECTION[t.key]);
  const conds = r.conditions.filter((c) => !SECTION[c.key]);
  const icon = (done: boolean) => done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
  return (
    <div className="rounded-lg border p-4">
      <p className="font-medium">Launch</p>
      <p className="text-xs text-muted-foreground">{open} setup task{open === 1 ? "" : "s"} left across all sections · {r.approvalCount} launch approval{r.approvalCount === 1 ? "" : "s"} recorded</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {conds.map((c) => <li key={c.id} className="flex items-start gap-2">{icon(c.satisfied)}<div><p>{c.label}</p>{!c.satisfied && c.key === "harmonious_approval" && <p className="text-xs text-muted-foreground">Second-person approval once everything else is complete.</p>}</div></li>)}
        {unplaced.map((t) => <li key={t.id} className="flex items-start gap-2">{icon(t.status === "complete")}{t.label}</li>)}
      </ul>
    </div>
  );
}
