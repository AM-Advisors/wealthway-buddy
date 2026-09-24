import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  approveEligibilityDraftFn,
  getEligibilitySetupFn,
  saveEligibilityDraftFn,
} from "@/lib/onboarding-compliance.functions";
import { ELIGIBILITY_REQUIREMENT_TYPES } from "@/lib/onboarding-compliance-model";

const CATEGORY_LABEL = { regulatory: "Regulatory", fund: "Fund Requirement", representation: "Investor Representation" } as const;
type Row = { key: string; mandatory: boolean; params: any };

/**
 * Harmonious-only Investor Eligibility Requirements. Writes a draft of the
 * fund's existing eligibility configuration; a different person approves.
 * Renders nothing for anyone without the configure permission.
 */
export function FundEligibilitySetup({ fundId }: { fundId: string }) {
  const load = useServerFn(getEligibilitySetupFn);
  const save = useServerFn(saveEligibilityDraftFn);
  const approve = useServerFn(approveEligibilityDraftFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-eligibility-setup", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const [rows, setRows] = useState<Row[] | null>(null);

  const saveM = useMutation({
    mutationFn: () => save({ data: { offeringId: fundId, requirements: (rows ?? []) as any } }),
    onSuccess: () => { toast.success("Draft saved — another authorized person must approve it"); qc.invalidateQueries({ queryKey: ["fund-eligibility-setup", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const approveM = useMutation({
    mutationFn: (draftId: string) => approve({ data: { offeringId: fundId, draftId } }),
    onSuccess: () => { toast.success("Eligibility requirements approved"); setRows(null); qc.invalidateQueries({ queryKey: ["fund-eligibility-setup", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError || !q.data) return null;
  const d = q.data;
  if (!d.available) {
    return (
      <Card><CardHeader><CardTitle className="text-lg">Investor Eligibility Requirements</CardTitle>
        <CardDescription>This fund has no setup record yet, so eligibility can't be configured here.</CardDescription></CardHeader></Card>
    );
  }
  const base = (d.draft?.requirements ?? d.approved?.requirements ?? []) as any[];
  const current: Row[] = rows ?? base.map((r) => ({ key: r.key, mandatory: r.mandatory, params: r.params ?? {} }));
  const locked = new Set<string>(d.mandatory as string[]);
  const set = (next: Row[]) => setRows(next);
  const toggle = (key: string, on: boolean) =>
    set(on ? [...current, { key, mandatory: true, params: {} }] : current.filter((r) => r.key !== key || locked.has(key)));
  const param = (key: string, p: string, v: any) => set(current.map((r) => (r.key === key ? { ...r, params: { ...r.params, [p]: v } } : r)));
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Investor Eligibility Requirements</CardTitle>
        <CardDescription>
          Harmonious only. Approved version: {d.approved ? `v${d.approved.version}` : "none"}.
          {d.draft ? ` Draft v${d.draft.version} awaiting approval.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(ELIGIBILITY_REQUIREMENT_TYPES).map(([key, t]) => {
          const row = current.find((r) => r.key === key);
          const on = Boolean(row) || locked.has(key);
          return (
            <div key={key} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{t.label}</span>
                  <Badge variant="outline">{CATEGORY_LABEL[t.category]}</Badge>
                  {locked.has(key) ? <Badge>Required by exemption</Badge> : null}
                </div>
                <Switch checked={on} disabled={locked.has(key)} onCheckedChange={(v) => toggle(key, v)} aria-label={t.label} />
              </div>
              {on && key === "minimum_investment" ? (
                <div><Label>Minimum (USD)</Label><Input type="number" min={0} value={row?.params.minimumCents != null ? row.params.minimumCents / 100 : ""} onChange={(e) => param(key, "minimumCents", e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))} /></div>
              ) : null}
              {on && key === "investor_type_restriction" ? (
                <div><Label>Allowed investor types (comma separated, e.g. individual, llc, trust)</Label><Input defaultValue={(row?.params.allowedProfileTypes ?? []).join(", ")} onBlur={(e) => param(key, "allowedProfileTypes", list(e.target.value))} /></div>
              ) : null}
              {on && key === "jurisdiction_restriction" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><Label>Allowed countries (blank = all)</Label><Input defaultValue={(row?.params.allowedCountries ?? []).join(", ")} onBlur={(e) => param(key, "allowedCountries", list(e.target.value))} /></div>
                  <div><Label>Blocked countries</Label><Input defaultValue={(row?.params.blockedCountries ?? []).join(", ")} onBlur={(e) => param(key, "blockedCountries", list(e.target.value))} /></div>
                </div>
              ) : null}
              {on && key === "custom_representation" ? (
                <div><Label>Approved representation text</Label><Input defaultValue={row?.params.customText ?? ""} maxLength={1000} onBlur={(e) => param(key, "customText", e.target.value)} /></div>
              ) : null}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button disabled={saveM.isPending || rows === null} onClick={() => saveM.mutate()}>Save draft</Button>
          {d.draft && d.permissions.includes("approve_compliance_exceptions") ? (
            <Button variant="outline" disabled={approveM.isPending || d.draft.preparedByMe} title={d.draft.preparedByMe ? "Someone else must approve your draft" : undefined} onClick={() => approveM.mutate(d.draft!.id)}>
              Approve draft v{d.draft.version}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
