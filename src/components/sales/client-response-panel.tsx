import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Panel } from "./sales-ui";
import { getSalesResponses, saveSalesResponseInstructions, sendSalesResponse } from "@/lib/sales-response.functions";
import { responseDraft, RESPONSE_STATUS } from "@/lib/sales-response-model";
type Kind = "quote" | "proposal" | "rfp" | "rfq";

export function ClientResponsePanel({ kind, id }: { kind: Kind; id: string }) {
  const load = useServerFn(getSalesResponses);
  const q = useQuery({ queryKey: ["sales-responses", kind, id], queryFn: () => load({ data: { kind, id } }) });
  return <Panel title="Client response">
    {q.isPending ? <p className="text-sm text-muted-foreground">Loading responses…</p> : q.error ? <div className="text-sm text-destructive">{q.error.message}<Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button></div>
      : q.data && <ResponseEditor key={`${kind}:${id}`} kind={kind} id={id} data={q.data} />}
  </Panel>;
}
function ResponseEditor({ kind, id, data }: { kind: Kind; id: string; data: Awaited<ReturnType<typeof getSalesResponses>> }) {
  const qc = useQueryClient();
  const save = useServerFn(saveSalesResponseInstructions);
  const send = useServerFn(sendSalesResponse);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const text = instructions ?? data.instructions;
  const selected = recipient || data.recipients[0]?.email || "";
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["sales-responses", kind, id] }); await qc.invalidateQueries({ queryKey: [kind === "quote" ? "sales-quote" : "sales-document", id] }); };
  const act = async (sending: boolean) => {
    setBusy(true);
    try {
      if (sending) {
        const key = requestId ?? crypto.randomUUID();
        setRequestId(key);
        const d = responseDraft.parse({ instructions: text, message, recipient: selected, requestId: key });
        const result = await send({ data: { kind, id, ...d } });
        if (result.sent) { toast.success("Response emailed"); setMessage(""); setRequestId(null); }
        else toast.error("This recipient cannot receive app emails. The response was not sent.");
      } else { await save({ data: { kind, id, instructions: text } }); toast.success("Response instructions saved"); }
      setInstructions(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the response."); }
    finally { await refresh(); setBusy(false); }
  };
  return <div className="space-y-4 min-w-0">
    <Badge variant="outline">{RESPONSE_STATUS[data.status] ?? data.status}</Badge>
    <div className="space-y-2"><Label htmlFor={`response-instructions-${id}`}>Response instructions for the client</Label>
      {data.canEdit ? <><Textarea id={`response-instructions-${id}`} rows={3} maxLength={2000} value={text} onChange={(e) => setInstructions(e.target.value)} placeholder="What should the client review or provide?" />
        <Button variant="outline" size="sm" disabled={busy || instructions === null} onClick={() => act(false)}>Save instructions</Button></> : <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{text || "No response instructions recorded."}</p>}
    </div>
    {data.canSend && <div className="space-y-2 border-t pt-4">
      <Label>Respond to</Label><SearchableSelect value={selected} onValueChange={(v) => { setRecipient(v); setRequestId(null); }} options={data.recipients.map((r) => ({ value: r.email, label: r.name, description: r.email }))} placeholder="Choose client recipient" />
      <Label htmlFor={`response-message-${id}`}>Response to client</Label><Textarea id={`response-message-${id}`} rows={4} maxLength={5000} value={message} onChange={(e) => { setMessage(e.target.value); setRequestId(null); }} />
      <Button size="sm" disabled={busy || !selected || !message.trim()} onClick={() => act(true)}><Send className="mr-2 h-4 w-4" />{busy ? "Sending…" : "Send response"}</Button>
    </div>}
    {!!data.messages.length && <ul className="divide-y text-sm">{[...data.messages].reverse().map((m, i) => <li key={`${m.at}:${i}`} className="space-y-1 py-2">
      <p className="text-xs text-muted-foreground">{m.event === "response_sent" ? "Harmonious response" : m.event === "client_changes_requested" ? "Client requested changes" : "Client reviewed"} · {new Date(m.at).toLocaleString()}</p>
      <p className="whitespace-pre-wrap break-words">{m.message}</p>
    </li>)}</ul>}
  </div>;
}