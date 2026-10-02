import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prefillWireFromBank } from "@/lib/bank-feed.functions";
import { listManagedWireInstructions, saveManagedWireInstructions } from "@/lib/wire-instructions.functions";

const FIELDS = [
  ["bank_name", "Bank name"], ["bank_address", "Bank address"], ["account_name", "Beneficiary (account name)"],
  ["account_number", "Account number"], ["routing_number", "Wire routing (ABA)"], ["swift", "SWIFT (international, optional)"], ["memo", "Reference / memo"],
] as const;
type Form = Record<(typeof FIELDS)[number][0], string>;
const empty = Object.fromEntries(FIELDS.map(([k]) => [k, ""])) as Form;
const mask = (v?: string) => (v ? `••••${String(v).slice(-4)}` : "-");

/** Wire instructions pre-filled from the connected bank; Harmonious saves and verifies them. */
export function WireFromBankForm({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const prefill = useServerFn(prefillWireFromBank);
  const list = useServerFn(listManagedWireInstructions);
  const save = useServerFn(saveManagedWireInstructions);
  const current = useQuery({ queryKey: ["wire-instructions"], queryFn: () => list() });
  const fund = (current.data?.funds ?? []).find((f: any) => f.id === fundId) as any;
  const saved = (fund?.wire_instructions ?? {}) as Record<string, string>;
  const isAdmin = !!current.data?.isAdmin;
  const [f, setF] = useState<Form | null>(null);
  const fill = useMutation({
    mutationFn: () => prefill({ data: { fundId } }),
    onSuccess: (r) => setF({ ...empty, ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])), ...r, memo: saved["memo"] || "Investor name + fund name" }),
    onError: (e) => toast.error((e as Error).message),
  });
  const s = useMutation({
    mutationFn: () => save({ data: { offering_id: fundId, ...f! } as any }),
    onSuccess: () => { toast.success("Wire instructions saved."); setF(null); qc.invalidateQueries({ queryKey: ["wire-instructions"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="space-y-3 text-sm">
      {Object.keys(saved).length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Bank</dt><dd>{saved["bank_name"] ?? "-"}</dd>
          <dt className="text-muted-foreground">Beneficiary</dt><dd>{saved["account_name"] ?? "-"}</dd>
          <dt className="text-muted-foreground">Account</dt><dd>{mask(saved["account_number"])}</dd>
          <dt className="text-muted-foreground">Routing</dt><dd>{mask(saved["routing_number"])}</dd>
        </dl>
      ) : <p className="text-muted-foreground">No wire instructions saved yet.</p>}
      {!f ? (
        <Button size="sm" variant="outline" onClick={() => fill.mutate()} disabled={fill.isPending}>{fill.isPending ? "Reading bank…" : "Fill wire form from connected bank"}</Button>
      ) : (
        <div className="space-y-2 rounded-md border p-3">
          {FIELDS.map(([k, label]) => (
            <div key={k} className="grid gap-1"><Label htmlFor={`w-${k}`}>{label}</Label>
              <Input id={`w-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} disabled={!isAdmin} /></div>
          ))}
          {isAdmin ? (
            <div className="flex gap-2"><Button size="sm" onClick={() => s.mutate()} disabled={s.isPending}>Save wire instructions</Button><Button size="sm" variant="ghost" onClick={() => setF(null)}>Cancel</Button></div>
          ) : (
            <p className="text-xs text-muted-foreground">Bank details are verified and saved by Harmonious. Your team can see this pre-filled form; ask Harmonious to confirm it.</p>
          )}
        </div>
      )}
    </div>
  );
}
