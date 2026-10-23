import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signingTrackerLogsFn, logSigningTrackerFn } from "@/lib/fund-signing-tracker.functions";
import { signingTrackerState } from "@/lib/fund-signing-tracker-model";
import { fmtDate } from "./shared";
export function SigningTracker({ fundId, files, signing, loading, error }: { fundId: string; files: any[]; signing: any; loading: boolean; error: boolean }) {
  const qc = useQueryClient();
  const load = useServerFn(signingTrackerLogsFn), save = useServerFn(logSigningTrackerFn);
  const q = useQuery({ queryKey: ["fund-signing-logs", fundId], queryFn: () => load({ data: { fundId } }) });
  const [manager, setManager] = useState("");
  const [fileId, setFileId] = useState("");
  const [status, setStatus] = useState("pending");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const managers = signing?.managers ?? [];
  const selected = manager || managers[0]?.userId || "";
  const selectedName = managers.find((m: any) => m.userId === selected)?.name;
  const mutation = useMutation({ mutationFn: () => save({ data: { fundId, fileId, signerUserId: selected, status: status === "signed" ? "signed" : "pending", date, note } }),
    onSuccess: () => { setOpen(false); setNote(""); toast.success("Signing update logged."); void qc.invalidateQueries({ queryKey: ["fund-signing-logs", fundId] }); }, onError: (e: Error) => toast.error(e.message) });
  return <section className="space-y-3 border-y py-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Signing tracker</h2>
      <Select value={selected} onValueChange={setManager}><SelectTrigger className="w-full sm:w-64" aria-label="Signing tracker manager"><SelectValue placeholder="Select manager" /></SelectTrigger><SelectContent>{managers.map((m: any) => <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>)}</SelectContent></Select>
    </div>
    {loading || q.isPending ? <p className="text-sm text-muted-foreground">Loading signing records…</p> : error || q.isError ? <div><p className="text-sm text-destructive">Signing records could not be loaded.</p><Button variant="outline" size="sm" onClick={() => { void q.refetch(); void qc.invalidateQueries({ queryKey: ["fund-signing", fundId] }); }}>Retry</Button></div> : !selected ? <p className="text-sm text-muted-foreground">No fund manager assigned.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Document</th><th>Status</th><th>Date</th><th /></tr></thead><tbody>{files.map((f: any) => {
      const signature = signing?.signatures?.find((s: any) => s.file_id === f.id && s.signer_user_id === selected);
      const log = q.data?.logs.find((l) => l.fileId === f.id && l.signerUserId === selected);
      return <tr key={f.id} className="border-b"><td className="max-w-80 py-3 pr-3 break-words">{f.url ? <a className="text-primary hover:underline" href={f.url} target="_blank" rel="noreferrer">{f.title}</a> : f.title}{log?.note && <p className="text-xs text-muted-foreground">{log.note}</p>}</td><td className="pr-3"><Badge variant="outline">{signingTrackerState(signature, log?.status)}</Badge></td><td className="whitespace-nowrap pr-3">{fmtDate(signature?.signed_at || log?.date || signature?.sent_at)}</td><td>{q.data?.canLog && <Button size="sm" variant="outline" onClick={() => { setFileId(f.id); setDate(new Date().toISOString().slice(0, 10)); setStatus("pending"); setOpen(true); }}>Log update</Button>}</td></tr>;
    })}</tbody></table>{!files.length && <p className="py-3 text-sm text-muted-foreground">No documents recorded.</p>}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Log signing update · {selectedName}</DialogTitle></DialogHeader>
      <Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="signed">Reported signed outside Harmonious</SelectItem></SelectContent></Select>
      <Label htmlFor="sign-log-date">Date</Label><Input id="sign-log-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Label htmlFor="sign-log-note">Evidence or follow-up note</Label><Textarea id="sign-log-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <Button disabled={!date || note.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate()}>Save log</Button>
    </DialogContent></Dialog>
  </section>;
}