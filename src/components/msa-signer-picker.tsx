import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getMsaSignerOptions, setMsaSigner } from "@/lib/commercial-agreements.functions";
import { remindMsaFn, msaLastReminderFn } from "@/lib/document-reminders.functions";
import { Button } from "@/components/ui/button";

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
  const remind = useServerFn(remindMsaFn);
  const lastFn = useServerFn(msaLastReminderFn);
  const last = useQuery({ queryKey: ["msa-reminder", clientId], queryFn: () => lastFn({ data: { clientId } }), retry: false });
  const r = useMutation({
    mutationFn: async () => {
      try { return await remind({ data: { clientId } }); }
      catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (!/last 24 hours/.test(msg)) throw e;
        const reason = window.prompt(`${msg}\n\nSuper Admins can send another. Reason:`);
        if (!reason?.trim()) throw new Error("Reminder not sent.");
        return remind({ data: { clientId, overrideReason: reason.trim() } });
      }
    },
    onSuccess: (x) => { toast.success(`Reminder sent to ${x.recipientEmail}.`); void last.refetch(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send."),
  });
  if (!q.data) return null;
  const d = q.data;
  const current = d.options.find((o) => o.userId === d.signerUserId);
  return (
    <div>
      <p className="text-xs text-muted-foreground">Responsible to sign MSA</p>
      {d.canEdit ? (
        <SearchableSelect value={d.signerUserId ?? ANY} disabled={m.isPending} onValueChange={(v) => m.mutate(v === ANY ? null : v)} aria-label="MSA signer" className="mt-1 h-8 w-full max-w-60"
          options={[{ value: ANY, label: "Anyone on the client team" }, ...d.options.map((o) => ({ value: o.userId, label: o.name }))]} />
      ) : (
        <p className="font-medium">{current?.name ?? "Anyone on the client team"}</p>
      )}
      {d.canEdit && d.signerUserId ? (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7" disabled={r.isPending} onClick={() => r.mutate()}>{r.isPending ? "Sending…" : "Send reminder"}</Button>
          {last.data?.lastRemindedAt ? <span className="text-xs text-muted-foreground">Last reminded {new Date(last.data.lastRemindedAt).toLocaleDateString()}</span> : null}
        </div>
      ) : null}
      {d.options.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No one on this client's team has an account yet.</p> : null}
    </div>
  );
}
