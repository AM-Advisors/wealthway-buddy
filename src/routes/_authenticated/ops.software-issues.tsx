import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AmPage } from "@/components/account-management-ui";
import { LoadError } from "@/components/load-error";
import { PartialResultsNotice } from "@/components/partial-results-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchablePeoplePicker } from "@/components/ui/searchable-people-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_LABEL, type IssueStage } from "@/lib/software-issue-model";
import { getSoftwareIssues, moveSoftwareIssue, reportSoftwareIssue } from "@/lib/software-issues.functions";

export const Route = createFileRoute("/_authenticated/ops/software-issues")({
  head: () => ({ meta: [
    { title: "Software issues | Harmonious Operations" },
    { name: "description", content: "Report a platform problem, track the fix and confirm it with a retest." },
    { property: "og:title", content: "Software issues | Harmonious Operations" },
    { property: "og:description", content: "Report a platform problem, track the fix and confirm it with a retest." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: SoftwareIssuesPage,
});

const STEP_BUTTON: Partial<Record<IssueStage, string>> = {
  in_progress: "Start fixing", fixed: "Mark fixed", deployed: "Mark live", retest_passed: "Retest passed", retest_failed: "Retest failed", resolved: "Resolve",
};

function SoftwareIssuesPage() {
  const load = useServerFn(getSoftwareIssues);
  const q = useQuery({ queryKey: ["software-issues"], queryFn: () => load(), retry: false });
  const [showForm, setShowForm] = useState(false);
  const [openOnly, setOpenOnly] = useState(true);
  const d = q.data;
  const issues = (d?.issues ?? []).filter((i: any) => !openOnly || i.stage !== "resolved");
  return (
    <AmPage title="Software issues" intro="Report something that isn't working, see who is fixing it, and confirm the fix with a retest before it's closed.">
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <LoadError error={q.error} what="Software issues" onRetry={() => q.refetch()} />}
      {d && (<>
        <PartialResultsNotice partial={d.truncated} />
        <div className="flex flex-wrap gap-2">
          {d.canWrite && <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close form" : "Report a software issue"}</Button>}
          <Button variant="outline" onClick={() => setOpenOnly((v) => !v)}>{openOnly ? "Show resolved too" : "Hide resolved"}</Button>
        </div>
        {showForm && <ReportForm staff={d.staff} onDone={() => setShowForm(false)} />}
        <div className="space-y-2">
          {issues.length ? issues.map((i: any) => <IssueRow key={i.id} i={i} />) : <p className="text-sm text-muted-foreground">No open software issues.</p>}
        </div>
      </>)}
    </AmPage>
  );
}

function ReportForm({ staff, onDone }: { staff: { id: string; name: string }[]; onDone: () => void }) {
  const report = useServerFn(reportSoftwareIssue);
  const qc = useQueryClient();
  const [v, setV] = useState({ title: "", expected: "", actual: "", steps: "", impact: "", page: "", occurredAt: "", recordRef: "", owner: "", retester: "" });
  const [busy, setBusy] = useState(false);
  const ready = v.title.trim().length >= 3 && v.expected.trim().length >= 3 && v.actual.trim().length >= 3 && v.steps.trim().length >= 3 && v.impact.trim().length >= 3 && v.owner && v.retester;
  const submit = async () => {
    setBusy(true);
    try {
      const data: any = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ""));
      if (data.occurredAt) data.occurredAt = new Date(data.occurredAt).toISOString();
      await report({ data });
      toast.success("Issue reported. It's in the technical owner's task list.");
      qc.invalidateQueries({ queryKey: ["software-issues"] }); qc.invalidateQueries({ queryKey: ["staff-tasks"] });
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const field = (k: keyof typeof v, label: string, area = false) => area
    ? <label className="block text-sm">{label}<Textarea value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} rows={2} /></label>
    : <label className="block text-sm">{label}<Input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <p className="rounded-md bg-muted px-3 py-2 text-sm">Don't paste documents, bank details, tax IDs, passwords or screening details. Describe them in words instead. Nothing is captured automatically.</p>
      {field("title", "Short summary")}
      {field("expected", "What should have happened?", true)}
      {field("actual", "What happened instead?", true)}
      {field("steps", "Steps to make it happen again", true)}
      {field("impact", "Who or what is affected, and how badly?", true)}
      <div className="grid gap-3 sm:grid-cols-3">
        {field("page", "Page (e.g. Fund → Investors)")}
        <label className="block text-sm">When it happened<Input type="datetime-local" value={v.occurredAt} onChange={(e) => setV({ ...v, occurredAt: e.target.value })} /></label>
        {field("recordRef", "Record address (optional, starts with /)")}
      </div>
      <div className="flex flex-wrap gap-3">
        <SearchablePeoplePicker value={v.owner} onValueChange={(x) => setV({ ...v, owner: x })}>
          <SelectTrigger className="w-64" aria-label="Technical owner"><SelectValue placeholder="Technical owner" /></SelectTrigger>
          <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </SearchablePeoplePicker>
        <SearchablePeoplePicker value={v.retester} onValueChange={(x) => setV({ ...v, retester: x })}>
          <SelectTrigger className="w-64" aria-label="Operational retester"><SelectValue placeholder="Who retests it" /></SelectTrigger>
          <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </SearchablePeoplePicker>
      </div>
      <Button disabled={!ready || busy} onClick={submit}>Report issue</Button>
    </section>
  );
}

function IssueRow({ i }: { i: any }) {
  const move = useServerFn(moveSoftwareIssue);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (to: IssueStage) => {
    setBusy(true);
    try {
      await move({ data: { id: i.id, to, ...(note.trim() ? { note } : {}) } });
      toast.success(STAGE_LABEL[to]); setNote("");
      qc.invalidateQueries({ queryKey: ["software-issues"] }); qc.invalidateQueries({ queryKey: ["staff-tasks"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border bg-card p-3">
      <button className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="flex-1 font-medium">{i.title}</span>
        <Badge variant={i.stage === "retest_failed" ? "destructive" : i.stage === "resolved" ? "secondary" : "outline"}>{STAGE_LABEL[i.stage as IssueStage]}</Badge>
        <span className="text-xs text-muted-foreground">Owner {i.ownerName} · Retest {i.retesterName}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-sm">
          <p><span className="font-medium">Expected:</span> {i.expected}</p>
          <p><span className="font-medium">Actual:</span> {i.actual}</p>
          <p className="whitespace-pre-wrap"><span className="font-medium">Steps:</span> {i.steps}</p>
          <p><span className="font-medium">Impact:</span> {i.impact}</p>
          <p className="text-xs text-muted-foreground">
            Reported by {i.reporterName}{i.page ? ` · ${i.page}` : ""}{i.occurred_at ? ` · ${new Date(i.occurred_at).toLocaleString()}` : ""}
            {i.record_ref && <> · <Link to={i.record_ref as never} className="text-primary underline">Open record</Link></>}
          </p>
          {i.stage === "deployed" && <p className="rounded-md bg-muted px-3 py-2 text-xs">Retest in the <Link to={"/qa-sandbox" as never} className="text-primary underline">fictional QA sandbox</Link>, not on real records.</p>}
          {i.steps_allowed.length > 0 && (
            <div className="space-y-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={i.steps_allowed.includes("retest_failed") ? "What you checked, or what still fails" : "Note (optional)"} aria-label="Note" />
              <div className="flex flex-wrap gap-2">{i.steps_allowed.map((s: IssueStage) => (
                <Button key={s} size="sm" variant={s === "retest_failed" ? "outline" : "default"} disabled={busy} onClick={() => go(s)}>{STEP_BUTTON[s]}</Button>
              ))}</div>
            </div>
          )}
          <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
            {i.events.map((e: any, n: number) => <li key={n}><span className="font-medium text-foreground">{e.who}</span>: {STAGE_LABEL[e.to_stage as IssueStage]}{e.note ? `: ${e.note}` : ""} · {new Date(e.created_at).toLocaleString()}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
