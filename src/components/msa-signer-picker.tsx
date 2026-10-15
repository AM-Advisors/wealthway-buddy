import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMsaSignerOptions, setMsaSigner } from "@/lib/commercial-agreements.functions";

const ANY = "__any__";

/** Staff choose which client team member signs the MSA. Server re-checks authority. */
export function MsaSignerPicker({ clientId }: { clientId: string }) {
  const load = useServerFn(getMsaSignerOptions);
  const save = useServerFn(setMsaSigner);
  const qc = useQueryClient();
  const key = ["msa-signer", clientId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { clientId } }), retry: false });
  const m = useMutation({
    mutationFn: (userId: string | null) => save({ data: { clientId, userId } }),
    onSuccess: () => { toast.success("MSA signer saved."); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });
  if (!q.data) return null;
  const d = q.data;
  const current = d.options.find((o) => o.userId === d.signerUserId);
  return (
    <div>
      <p className="text-xs text-muted-foreground">Responsible to sign MSA</p>
      {d.canEdit ? (
        <Select value={d.signerUserId ?? ANY} disabled={m.isPending} onValueChange={(v) => m.mutate(v === ANY ? null : v)}>
          <SelectTrigger className="mt-1 h-8 w-full max-w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Anyone on the client team</SelectItem>
            {d.options.map((o) => <SelectItem key={o.userId} value={o.userId}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <p className="font-medium">{current?.name ?? "Anyone on the client team"}</p>
      )}
      {d.options.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No one on this client's team has an account yet.</p> : null}
    </div>
  );
}
