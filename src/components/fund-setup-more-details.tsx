import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fundSetupDetailsFn, saveFundSetupDetailsFn } from "@/lib/fund-setup-canonical.functions";
import { PROVIDER_FIELDS, SETUP_DETAIL_FIELDS, detailLabel, type SetupDetailKey } from "@/lib/fund-setup-details";

export const setupDetailsKey = (offeringId: string) => ["fund-setup-details", offeringId] as const;

/** Answers first given on the fund request that have no other Setup field: read and edited here. */
export function FundSetupMoreDetails({ offeringId, onSaved }: { offeringId: string; onSaved?: () => void }) {
  const load = useServerFn(fundSetupDetailsFn);
  const save = useServerFn(saveFundSetupDetailsFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: setupDetailsKey(offeringId), queryFn: () => load({ data: { offeringId } }) });
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading fund details…</p>;
  if (q.isError || !q.data) return <p role="alert" className="text-sm text-destructive">Fund details could not be loaded.</p>;
  const d = q.data;
  const cur: Record<string, string> = {
    investment_strategy: d.investmentStrategy ?? "",
    ...Object.fromEntries(PROVIDER_FIELDS.map((f) => [`p:${f.key}`, String(d.providers?.[f.key] ?? "")])),
    ...Object.fromEntries(SETUP_DETAIL_FIELDS.map((f) => [`d:${f.key}`, String(d.details?.[f.key] ?? "")])),
  };
  const v = (k: string) => vals[k] ?? cur[k] ?? "";
  const services = d.details?.requested_services ?? [];

  const submit = async () => {
    const changed = Object.entries(vals).filter(([k, x]) => (x ?? "").trim() !== (cur[k] ?? "").trim());
    if (!changed.length) { setEditing(false); return; }
    setBusy(true);
    try {
      const details: Record<string, string> = {}, providers: Record<string, string> = {};
      let investmentStrategy: string | undefined;
      for (const [k, x] of changed) {
        if (k === "investment_strategy") investmentStrategy = x;
        else if (k.startsWith("p:")) providers[k.slice(2)] = x;
        else if (k.startsWith("d:")) details[k.slice(2)] = x;
      }
      await save({ data: { offeringId, details, providers, ...(investmentStrategy !== undefined ? { investmentStrategy } : {}) } });
      toast.success("Fund details saved");
      setVals({}); setEditing(false);
      void qc.invalidateQueries({ queryKey: setupDetailsKey(offeringId) });
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally { setBusy(false); }
  };

  const rows: [string, string][] = [
    ["Investment", cur["investment_strategy"] ?? ""],
    ...PROVIDER_FIELDS.map((f) => [f.label, cur[`p:${f.key}`] ?? ""] as [string, string]),
    ...SETUP_DETAIL_FIELDS.map((f) => [f.label, detailLabel(f.key, cur[`d:${f.key}`])] as [string, string]),
  ];

  return (
    <div className="space-y-3">
      {!editing ? (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-background px-4 py-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-wrap break-words">{value || <span className="text-muted-foreground">Not given</span>}</dd>
              </div>
            ))}
          </dl>
          {services.length > 0 && (
            <div className="rounded-xl border bg-background px-4 py-3 text-sm">
              <p className="text-xs text-muted-foreground">Services asked for on the request</p>
              <p className="mt-1">{services.map((s) => s.replace(/_/g, " ")).join(", ")}</p>
              <p className="mt-1 text-xs text-muted-foreground">Active services and pricing are managed under the fund's services and agreements.</p>
            </div>
          )}
          {d.canEdit && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button></div>}
        </>
      ) : (
        <div className="space-y-3">
          <Field label="Investment" long value={v("investment_strategy")} onChange={(x) => setVals((s) => ({ ...s, investment_strategy: x }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            {PROVIDER_FIELDS.map((f) => <Field key={f.key} label={f.label} value={v(`p:${f.key}`)} onChange={(x) => setVals((s) => ({ ...s, [`p:${f.key}`]: x }))} />)}
          </div>
          {SETUP_DETAIL_FIELDS.map((f) => f.options ? (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`sd-${f.key}`}>{f.label}</Label>
              <select id={`sd-${f.key}`} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={v(`d:${f.key}`)} onChange={(e) => setVals((s) => ({ ...s, [`d:${f.key}`]: e.target.value }))}>
                <option value="">Not given</option>
                {f.options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
              </select>
            </div>
          ) : <Field key={f.key} label={f.label} long={f.long} value={v(`d:${f.key as SetupDetailKey}`)} onChange={(x) => setVals((s) => ({ ...s, [`d:${f.key}`]: x }))} />)}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setVals({}); setEditing(false); }}>Cancel</Button>
            <Button size="sm" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, long }: { label: string; value: string; onChange: (v: string) => void; long?: boolean | undefined }) {
  const id = `sd-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {long ? <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} /> : <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}
