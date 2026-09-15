import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  CAP_ENTITY_TYPES,
  completeCapOnboarding,
  getCapOnboarding,
  saveCapOnboarding,
} from "@/lib/cap-onboarding.functions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const empty = {
  company_legal_name: "",
  entity_type: "",
  state_formed: "",
  date_formed: "",
  authorized_shares: "",
  par_value: "",
  fiscal_year_end: "",
  signatory_name: "",
  signatory_title: "",
  signatory_email: "",
  records_source: "",
  acknowledged: false,
};

type Form = typeof empty;

function toDetails(f: Form) {
  const shares = Number(f.authorized_shares.replace(/,/g, ""));
  const par = Number(f.par_value.replace(/[^0-9.]/g, ""));
  return {
    company_legal_name: f.company_legal_name,
    entity_type: f.entity_type,
    state_formed: f.state_formed,
    date_formed: f.date_formed || null,
    authorized_shares: Number.isFinite(shares) && shares > 0 ? shares : null,
    par_value_cents: Number.isFinite(par) && par > 0 ? Math.round(par * 100) : null,
    fiscal_year_end: f.fiscal_year_end,
    signatory_name: f.signatory_name,
    signatory_title: f.signatory_title,
    signatory_email: f.signatory_email,
    records_source: f.records_source,
    acknowledged: f.acknowledged,
  };
}

/**
 * Founders confirm their company details once. Until they do, the cap table
 * screens stay closed so no shares are recorded against an unconfirmed company.
 */
export function CapOnboardingGate({
  clientId,
  children,
}: {
  clientId?: string | null;
  children: ReactNode;
}) {
  const load = useServerFn(getCapOnboarding);
  const queryKey = ["cap-onboarding", clientId ?? "default"];
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => load({ data: { clientId: clientId ?? null } }),
    retry: false,
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!data?.clientId || data.complete) return <>{children}</>;

  return <CapOnboardingForm clientId={data.clientId} record={data.record} canEdit={data.canEdit} queryKey={queryKey} />;
}

function CapOnboardingForm({
  clientId,
  record,
  canEdit,
  queryKey,
}: {
  clientId: string;
  record: any;
  canEdit: boolean;
  queryKey: unknown[];
}) {
  const save = useServerFn(saveCapOnboarding);
  const finish = useServerFn(completeCapOnboarding);
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(empty);

  useEffect(() => {
    if (!record) return;
    setForm({
      company_legal_name: record.company_legal_name ?? "",
      entity_type: record.entity_type ?? "",
      state_formed: record.state_formed ?? "",
      date_formed: record.date_formed ?? "",
      authorized_shares: record.authorized_shares ? String(record.authorized_shares) : "",
      par_value: record.par_value_cents ? String(record.par_value_cents / 100) : "",
      fiscal_year_end: record.fiscal_year_end ?? "",
      signatory_name: record.signatory_name ?? "",
      signatory_title: record.signatory_title ?? "",
      signatory_email: record.signatory_email ?? "",
      records_source: record.records_source ?? "",
      acknowledged: Boolean(record.acknowledged),
    });
  }, [record]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const draft = useMutation({
    mutationFn: () => save({ data: { clientId, details: toDetails(form) } }),
    onSuccess: () => {
      toast.success("Saved. You can come back to this.");
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const complete = useMutation({
    mutationFn: () => finish({ data: { clientId, details: toDetails(form) } }),
    onSuccess: () => {
      toast.success("Cap table setup complete.");
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "Something is still missing."),
  });

  const busy = draft.isPending || complete.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Set up your cap table</CardTitle>
        <CardDescription>
          Tell us about the company before you record any shares. Harmonious keeps this on record —
          we do not verify your company filings or advise on them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Your access is view-only. Ask a signatory on your account to complete this setup.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cap-legal-name">Company legal name</Label>
            <Input
              id="cap-legal-name"
              value={form.company_legal_name}
              onChange={(e) => set({ company_legal_name: e.target.value })}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-entity-type">Entity type</Label>
            <select
              id="cap-entity-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.entity_type}
              onChange={(e) => set({ entity_type: e.target.value })}
              disabled={!canEdit}
            >
              <option value="">Select…</option>
              {CAP_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-state">Where it was formed</Label>
            <Input
              id="cap-state"
              value={form.state_formed}
              onChange={(e) => set({ state_formed: e.target.value })}
              placeholder="Delaware"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-date">Date formed</Label>
            <Input
              id="cap-date"
              type="date"
              value={form.date_formed}
              onChange={(e) => set({ date_formed: e.target.value })}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-fye">Financial year end</Label>
            <Input
              id="cap-fye"
              value={form.fiscal_year_end}
              onChange={(e) => set({ fiscal_year_end: e.target.value })}
              placeholder="31 December"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-authorised">Authorised shares</Label>
            <Input
              id="cap-authorised"
              inputMode="numeric"
              value={form.authorized_shares}
              onChange={(e) => set({ authorized_shares: e.target.value })}
              placeholder="10,000,000"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-par">Par value per share (optional)</Label>
            <Input
              id="cap-par"
              inputMode="decimal"
              value={form.par_value}
              onChange={(e) => set({ par_value: e.target.value })}
              placeholder="0.0001"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-signer">Who signs certificates</Label>
            <Input
              id="cap-signer"
              value={form.signatory_name}
              onChange={(e) => set({ signatory_name: e.target.value })}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-signer-title">Their title</Label>
            <Input
              id="cap-signer-title"
              value={form.signatory_title}
              onChange={(e) => set({ signatory_title: e.target.value })}
              placeholder="Chief Executive Officer"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cap-signer-email">Their email</Label>
            <Input
              id="cap-signer-email"
              type="email"
              value={form.signatory_email}
              onChange={(e) => set({ signatory_email: e.target.value })}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cap-records">Where your share records are kept today</Label>
            <Textarea
              id="cap-records"
              rows={3}
              value={form.records_source}
              onChange={(e) => set({ records_source: e.target.value })}
              placeholder="Spreadsheet, prior provider, law firm — and anything we should know."
              disabled={!canEdit}
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.acknowledged}
            onChange={(e) => set({ acknowledged: e.target.checked })}
            disabled={!canEdit}
          />
          <span>
            I confirm these company details are correct and that the shares I record are the
            company's own records. Harmonious administers and keeps the record; it is not our
            transfer agent, legal counsel or accountant unless a statement of work says so.
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canEdit || busy} onClick={() => complete.mutate()}>
            Complete setup
          </Button>
          <Button variant="outline" disabled={!canEdit || busy} onClick={() => draft.mutate()}>
            Save and finish later
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
