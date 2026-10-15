import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadFundFileFn } from "@/lib/fund-tabs.functions";
import { fileToBase64 } from "@/components/fund-tabs/shared";
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
export function WireFromBankForm({ fundId, allowPrefill = true }: { fundId: string; allowPrefill?: boolean }) {
  const qc = useQueryClient();
  const prefill = useServerFn(prefillWireFromBank);
  const list = useServerFn(listManagedWireInstructions);
  const save = useServerFn(saveManagedWireInstructions);
  const current = useQuery({ queryKey: ["wire-instructions"], queryFn: () => list() });
  const fund = (current.data?.funds ?? []).find((f: any) => f.id === fundId) as any;
  const saved = (fund?.wire_instructions ?? {}) as Record<string, string>;
  const isAdmin = !!current.data?.isAdmin;
  const [f, setF] = useState<Form | null>(null);
  const uploadFile = useServerFn(uploadFundFileFn);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const onLetter = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile({ data: { fundId, title: "Wire instructions", category: "banking", fileName: file.name, contentType: file.type || "application/octet-stream", base64: await fileToBase64(file) } });
      setUploaded(file.name);
      toast.success("Wire instructions uploaded. Harmonious will verify them.");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); }
  };
  const manual = () => setF({ ...empty, ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])), memo: saved["memo"] || "Investor name + fund name" });
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
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="sr-only" disabled={uploading} onChange={(e) => { void onLetter(e.target.files?.[0]); e.target.value = ""; }} />
            <span className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">{uploading ? "Uploading…" : "Upload wire instructions"}</span>
          </label>
          {isAdmin && <Button size="sm" variant="outline" onClick={manual}>Enter manually</Button>}
          {allowPrefill && <Button size="sm" variant="outline" onClick={() => fill.mutate()} disabled={fill.isPending}>{fill.isPending ? "Reading bank…" : "Fill wire form from connected bank"}</Button>}
          {uploaded && <span className="text-xs text-muted-foreground">Uploaded {uploaded} - saved to Documents</span>}
        </div>
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
