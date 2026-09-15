import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  CAP_ENTITY_TYPES,
  completeCapOnboarding,
  getCapOnboarding,
  saveCapOnboarding,
} from "@/lib/cap-onboarding.functions";
import { HOLDER_TYPES, SECURITY_TYPES, importCapTable } from "@/lib/founder-cap-table.functions";

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

type ShareRow = {
  name: string;
  email: string;
  holder_type: string;
  security_type: string;
  share_class: string;
  quantity: string;
  price_per_share: string;
  issued_on: string;
};

const emptyRow: ShareRow = {
  name: "",
  email: "",
  holder_type: "individual",
  security_type: "common",
  share_class: "",
  quantity: "",
  price_per_share: "",
  issued_on: "",
};

const num = (v: string) => Number(String(v).replace(/[^0-9.]/g, ""));

function toDetails(f: Form) {
  const shares = num(f.authorized_shares);
  const par = num(f.par_value);
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

/** Rows the founder actually filled in, ready to be recorded as shares. */
function usableRows(rows: ShareRow[]) {
  return rows.filter((r) => r.name.trim().length > 1 && num(r.quantity) > 0);
}

const STEPS = ["Company", "Signatory", "Initial shares", "Review"] as const;

/**
 * Founders confirm their company details, their certificate signatory and the
 * shares already on issue. Until that is done the cap table screens stay closed,
 * so no shares are recorded against an unconfirmed company.
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

  return (
    <CapOnboardingForm
      clientId={data.clientId}
      record={data.record}
      canEdit={data.canEdit}
      queryKey={queryKey}
    />
  );
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
  const recordShares = useServerFn(importCapTable);
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(empty);
  const [rows, setRows] = useState<ShareRow[]>([{ ...emptyRow }]);

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
  const setRow = (i: number, patch: Partial<ShareRow>) =>
    setRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));

  const ready = usableRows(rows);
  const totalShares = useMemo(
    () => ready.reduce((sum, r) => sum + num(r.quantity), 0),
    [ready],
  );
  const authorized = num(form.authorized_shares);
  const overAuthorized = authorized > 0 && totalShares > authorized;

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!form.company_legal_name.trim()) m.push("company legal name");
    if (!form.entity_type) m.push("entity type");
    if (!form.state_formed.trim()) m.push("where it was formed");
    if (!(num(form.authorized_shares) > 0)) m.push("authorised shares");
    if (!form.signatory_name.trim()) m.push("who signs certificates");
    if (!form.acknowledged) m.push("your confirmation");
    return m;
  }, [form]);

  const draft = useMutation({
    mutationFn: () => save({ data: { clientId, details: toDetails(form) } }),
    onSuccess: () => {
      toast.success("Saved. You can come back to this.");
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const complete = useMutation({
    mutationFn: async () => {
      await finish({ data: { clientId, details: toDetails(form) } });
      if (ready.length === 0) return { holders: 0, holdings: 0 };
      return recordShares({
        data: {
          clientId,
          rows: ready.map((r) => {
            const price = num(r.price_per_share);
            return {
              name: r.name.trim(),
              email: r.email.trim() || null,
              holder_type: r.holder_type,
              security_type: r.security_type,
              share_class: r.share_class.trim() || null,
              quantity: num(r.quantity),
              price_per_share_cents:
                Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
              issued_on: r.issued_on || null,
              certificate_no: null,
            };
          }),
        },
      });
    },
    onSuccess: (res: any) => {
      toast.success(
        res?.holdings
          ? `Setup complete. ${res.holdings} holding${res.holdings === 1 ? "" : "s"} recorded.`
          : "Cap table setup complete.",
      );
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["founder-cap-table"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Something is still missing."),
  });

  const busy = draft.isPending || complete.isPending;
  const disabled = !canEdit || busy;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Set up your cap table</CardTitle>
        <CardDescription>
          Four short steps: the company, who signs certificates, the shares already on issue, then a
          quick review. Harmonious keeps this on record — we do not verify your company filings or
          advise on them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Your access is view-only. Ask a signatory on your account to complete this setup.
          </p>
        )}

        <ol className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${
                  i === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3 w-3" aria-hidden /> : <span>{i + 1}</span>}
                {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cap-legal-name">Company legal name</Label>
              <Input
                id="cap-legal-name"
                value={form.company_legal_name}
                onChange={(e) => set({ company_legal_name: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cap-entity-type">Entity type</Label>
              <select
                id="cap-entity-type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.entity_type}
                onChange={(e) => set({ entity_type: e.target.value })}
                disabled={disabled}
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
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cap-date">Date formed</Label>
              <Input
                id="cap-date"
                type="date"
                value={form.date_formed}
                onChange={(e) => set({ date_formed: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cap-fye">Financial year end</Label>
              <Input
                id="cap-fye"
                value={form.fiscal_year_end}
                onChange={(e) => set({ fiscal_year_end: e.target.value })}
                placeholder="31 December"
                disabled={disabled}
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
                disabled={disabled}
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
                disabled={disabled}
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
                disabled={disabled}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Certificates are issued only after this person signs them.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cap-signer">Who signs certificates</Label>
              <Input
                id="cap-signer"
                value={form.signatory_name}
                onChange={(e) => set({ signatory_name: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cap-signer-title">Their title</Label>
              <Input
                id="cap-signer-title"
                value={form.signatory_title}
                onChange={(e) => set({ signatory_title: e.target.value })}
                placeholder="Chief Executive Officer"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cap-signer-email">Their email</Label>
              <Input
                id="cap-signer-email"
                type="email"
                value={form.signatory_email}
                onChange={(e) => set({ signatory_email: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add the shares already on issue. Leave this empty if you would rather add them later
              or upload a spreadsheet — you can do both from the cap table once setup is finished.
            </p>

            <div className="space-y-4">
              {rows.map((row, i) => (
                <div key={i} className="rounded-md border p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`row-name-${i}`}>Shareholder name</Label>
                      <Input
                        id={`row-name-${i}`}
                        value={row.name}
                        onChange={(e) => setRow(i, { name: e.target.value })}
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`row-email-${i}`}>Their email (optional)</Label>
                      <Input
                        id={`row-email-${i}`}
                        type="email"
                        value={row.email}
                        onChange={(e) => setRow(i, { email: e.target.value })}
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`row-holder-${i}`}>Holder type</Label>
                      <select
                        id={`row-holder-${i}`}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.holder_type}
                        onChange={(e) => setRow(i, { holder_type: e.target.value })}
                        disabled={disabled}
                      >
                        {HOLDER_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`row-security-${i}`}>What they hold</Label>
                      <select
                        id={`row-security-${i}`}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.security_type}
                        onChange={(e) => setRow(i, { security_type: e.target.value })}
                        disabled={disabled}
                      >
                        {SECURITY_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`row-class-${i}`}>Class (optional)</Label>
                      <Input
                        id={`row-class-${i}`}
                        value={row.share_class}
                        onChange={(e) => setRow(i, { share_class: e.target.value })}
                        placeholder="Series A"
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`row-qty-${i}`}>Number of shares</Label>
                      <Input
                        id={`row-qty-${i}`}
                        inputMode="numeric"
                        value={row.quantity}
                        onChange={(e) => setRow(i, { quantity: e.target.value })}
                        placeholder="1,000,000"
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`row-price-${i}`}>Price per share (optional)</Label>
                      <Input
                        id={`row-price-${i}`}
                        inputMode="decimal"
                        value={row.price_per_share}
                        onChange={(e) => setRow(i, { price_per_share: e.target.value })}
                        placeholder="0.001"
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`row-issued-${i}`}>Issued on (optional)</Label>
                      <Input
                        id={`row-issued-${i}`}
                        type="date"
                        value={row.issued_on}
                        onChange={(e) => setRow(i, { issued_on: e.target.value })}
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  {rows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      disabled={disabled}
                      onClick={() => setRows((rs) => rs.filter((_, ri) => ri !== i))}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => setRows((rs) => [...rs, { ...emptyRow }])}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add another shareholder
              </Button>
              <p className="text-xs text-muted-foreground">
                {ready.length} shareholder{ready.length === 1 ? "" : "s"} ·{" "}
                {totalShares.toLocaleString()} shares
              </p>
            </div>

            {overAuthorized && (
              <p className="text-sm text-destructive">
                These shares add up to more than the {authorized.toLocaleString()} authorised shares
                you entered. Check the numbers before you finish.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="Company" value={form.company_legal_name} />
              <Row label="Entity type" value={form.entity_type} />
              <Row label="Formed in" value={form.state_formed} />
              <Row label="Date formed" value={form.date_formed} />
              <Row
                label="Authorised shares"
                value={authorized > 0 ? authorized.toLocaleString() : ""}
              />
              <Row label="Financial year end" value={form.fiscal_year_end} />
              <Row label="Signs certificates" value={form.signatory_name} />
              <Row label="Their title" value={form.signatory_title} />
              <Row
                label="Initial shares"
                value={
                  ready.length
                    ? `${ready.length} shareholder${ready.length === 1 ? "" : "s"}, ${totalShares.toLocaleString()} shares`
                    : "None yet"
                }
              />
            </dl>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.acknowledged}
                onChange={(e) => set({ acknowledged: e.target.checked })}
                disabled={disabled}
              />
              <span>
                I confirm these company details are correct and that the shares I record are the
                company's own records. Harmonious administers and keeps the record; it is not our
                transfer agent, legal counsel or accountant unless a statement of work says so.
              </span>
            </label>

            {missing.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Still needed: {missing.join(", ")}.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {step > 0 && (
            <Button variant="outline" disabled={busy} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button disabled={busy} onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button
              disabled={disabled || missing.length > 0 || overAuthorized}
              onClick={() => complete.mutate()}
            >
              {complete.isPending ? "Finishing…" : "Complete setup"}
            </Button>
          )}
          <Button variant="ghost" disabled={disabled} onClick={() => draft.mutate()}>
            Save and finish later
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}
