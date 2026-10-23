import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { confirmInvestorInformationFn, prefillForInvestorFn } from "@/lib/investor-record.functions";
import { SOURCE_LABELS, type EntrySource } from "@/lib/investor-record-model";
import { money } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Shown only when Harmonious or the Fund Manager prepared this investment. */
export function ConfirmYourInformation({ onboardingId }: { onboardingId: string }) {
  const load = useServerFn(prefillForInvestorFn);
  const confirm = useServerFn(confirmInvestorInformationFn);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["investor-prefill", onboardingId], queryFn: () => load({ data: { onboardingId } }), retry: false });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!data?.needed) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await confirm({ data: { onboardingId, corrections: edits } });
      toast.success("Thanks - your information is confirmed.");
      qc.invalidateQueries({ queryKey: ["investor-prefill", onboardingId] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">We already have some information for this investment.</CardTitle>
        <p className="text-sm text-muted-foreground">Please review and confirm it before continuing. Anything you can't change here can be corrected by Harmonious.</p></CardHeader>
      <CardContent className="space-y-3">
        {data.fields.filter((f: any) => f.value != null || f.editable).map((f: any) => (
          <div key={f.key} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-center">
            <div><p className="text-sm font-medium">{f.label}</p>{f.suppliedBy ? <p className="text-xs text-muted-foreground">Entered by {SOURCE_LABELS[f.suppliedBy as EntrySource] ?? "Harmonious"}</p> : null}</div>
            {f.editable && editing ? (
              <Input aria-label={f.label} defaultValue={f.value ?? ""} onChange={(e) => setEdits((s) => ({ ...s, [f.key]: e.target.value }))} />
            ) : (
              <p className="text-sm">{f.value == null || f.value === "" ? "-" : f.key.endsWith("_cents") ? money(f.value) : String(f.value)}</p>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Confirm"}</Button>
          {!editing ? <Button variant="outline" onClick={() => setEditing(true)} disabled={busy}>Edit</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}
