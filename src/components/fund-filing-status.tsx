import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloseFilingsPanel } from "@/components/close-filings-panel";
import { fmtDate, usd } from "@/components/fund-tabs/shared";
import type { FundFilingOverview, FundFilingStatus } from "@/lib/regulatory-filings-model";
import { setFilingResponsibility, setFirstSaleDate } from "@/lib/regulatory-tracker.functions";

const STAGE: Record<string, string> = {
  not_needed: "Not needed", needs_first_sale: "Needs first sale date", not_started: "Not prepared", prepared: "Prepared, not filed", filed: "Filed",
};

export function urgencyBadge(u: FundFilingStatus["urgency"]) {
  if (u === "overdue") return <Badge variant="destructive">Past due</Badge>;
  if (u === "due_soon") return <Badge variant="destructive">Due within 7 days</Badge>;
  if (u === "open") return <Badge variant="outline">Open</Badge>;
  if (u === "done") return <Badge variant="secondary">Up to date</Badge>;
  return <Badge variant="secondary">Nothing to file</Badge>;
}

/** Plain-language status for one fund; staff also get the date, who-files and packet controls. */
export function FundFilingStatusCard({ fundId, overview, staff, onChanged }: { fundId: string; overview: FundFilingOverview; staff: boolean; onChanged: () => void }) {
  const s = overview.status;
  const saveDate = useServerFn(setFirstSaleDate);
  const saveWho = useServerFn(setFilingResponsibility);
  const [date, setDate] = useState(overview.firstSaleOn ?? overview.suggestedFirstSaleOn ?? "");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const bsDone = s.blueSky.required.length - s.blueSky.outstanding.length;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Next step</p>
        <p className="text-lg font-semibold">{s.nextStep}</p>
        <div className="mt-2">{urgencyBadge(s.urgency)}</div>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-muted-foreground">Who files</dt><dd className="font-medium">{s.responsibilityLabel}</dd></div>
        <div><dt className="text-muted-foreground">Date of first sale</dt><dd className="font-medium">{overview.firstSaleOn ? fmtDate(overview.firstSaleOn) : "Not recorded"}</dd></div>
        <div>
          <dt className="text-muted-foreground">Form D</dt>
          <dd className="font-medium">{STAGE[s.formD.stage]}{s.formD.filedOn ? ` ${fmtDate(s.formD.filedOn)}` : s.formD.dueOn && s.formD.stage !== "not_needed" ? ` · due ${fmtDate(s.formD.dueOn)}` : ""}</dd>
          {s.formD.annualAmendmentDue && <dd className="text-xs text-muted-foreground">Annual amendment by {fmtDate(s.formD.annualAmendmentDue)} if still offering</dd>}
        </div>
        <div>
          <dt className="text-muted-foreground">Blue Sky states</dt>
          <dd className="font-medium">{s.blueSky.required.length ? `${bsDone} of ${s.blueSky.required.length} done` : "None yet"}</dd>
          {s.blueSky.outstanding.length > 0 && <dd className="text-xs text-muted-foreground">Still open: {s.blueSky.outstanding.join(", ")}</dd>}
        </div>
        <div><dt className="text-muted-foreground">Investors sold</dt><dd className="font-medium">{s.fundedInvestors} · {usd(s.fundedCents)}</dd></div>
        <div>
          <dt className="text-muted-foreground">Investors missing a state</dt>
          <dd className={s.investorsMissingState ? "font-medium text-destructive" : "font-medium"}>{s.investorsMissingState}</dd>
          {s.investorsMissingState > 0 && <dd className="text-xs text-muted-foreground">Add each investor's state on their record so the right notices are prepared.</dd>}
        </div>
      </dl>

      {staff && (
        <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`fs-${fundId}`}>Date of first sale</Label>
            <div className="flex gap-2">
              <Input id={`fs-${fundId}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-44" />
              <Button size="sm" disabled={busy || !date || date === overview.firstSaleOn} onClick={() => run(() => saveDate({ data: { fundId, date } }), "First sale date saved")}>Save</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The day the first investor was irrevocably committed. Form D is due 15 days later.
              {!overview.firstSaleOn && overview.suggestedFirstSaleOn ? ` Suggested from the earliest recorded close: ${fmtDate(overview.suggestedFirstSaleOn)}. Check it before saving.` : ""}
            </p>
          </div>
          <div className="space-y-1">
            <Label>Who files Form D and Blue Sky</Label>
            <Select value={overview.formDResponsibility ?? ""} onValueChange={(v) => run(() => saveWho({ data: { fundId, who: v as "harmonious" | "client_counsel" | "not_applicable" } }), "Saved")}>
              <SelectTrigger className="max-w-64" disabled={busy}><SelectValue placeholder="Choose who files" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="harmonious">Harmonious files</SelectItem>
                <SelectItem value="client_counsel">Client or counsel files</SelectItem>
                <SelectItem value="not_applicable">Not applicable</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">If the client or counsel files, record their confirmation here so the fund shows as up to date.</p>
          </div>
        </div>
      )}
      {staff && <CloseFilingsPanel fundId={fundId} canPrepare={!!overview.firstSaleOn && (overview.regType === "506b" || overview.regType === "506c")} onChanged={onChanged} />}
    </div>
  );
}
