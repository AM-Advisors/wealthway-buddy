import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "@/components/sales/sales-ui";
import { MkPage, StatusBadge, fileToBase64, fmt, fromLocalInput, mkHead, toLocalInput } from "@/components/marketing-ui";
import { emailProblems, renderEmailHtml, type EmailBlock } from "@/lib/marketing-model";
import {
  decideMarketingEmail, getMarketingAudiences, getMarketingEmail, marketingDraftCopy, saveMarketingEmail, sendMarketingTestEmail, uploadMarketingAsset,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/marketing_/emails_/$id")({
  head: mkHead("Email builder", "Design a branded Harmonious marketing email."),
  component: EmailEditor,
});

const NEW_BLOCK: Record<EmailBlock["type"], EmailBlock> = {
  heading: { type: "heading", text: "Heading" }, text: { type: "text", text: "" }, image: { type: "image", url: "" },
  button: { type: "button", text: "Learn more", href: "https://harmonious.co" }, divider: { type: "divider" },
};

function EmailEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const nav = useNavigate();
  const qc = useQueryClient();
  const load = useServerFn(getMarketingEmail);
  const audFn = useServerFn(getMarketingAudiences);
  const save = useServerFn(saveMarketingEmail);
  const decide = useServerFn(decideMarketingEmail);
  const test = useServerFn(sendMarketingTestEmail);
  const draft = useServerFn(marketingDraftCopy);
  const upload = useServerFn(uploadMarketingAsset);
  const q = useQuery({ queryKey: ["mk-email", id], queryFn: () => load({ data: { id } }), enabled: !isNew, retry: false });
  const aud = useQuery({ queryKey: ["mk-audiences"], queryFn: () => audFn(), retry: false });

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([{ type: "heading", text: "Hello from Harmonious" }, { type: "text", text: "" }]);
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [brief, setBrief] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    const e = q.data?.email;
    if (!e) return;
    setName(e.name); setSubject(e.subject); setPreheader(e.preheader ?? ""); setBlocks(e.blocks ?? []); setAudienceId(e.audience_id); setWhen(toLocalInput(e.scheduled_at));
  }, [q.data]);

  const status = q.data?.email.status ?? "draft";
  const locked = ["sending", "sent"].includes(status);
  const problems = emailProblems({ subject, blocks, audienceId });
  const html = useMemo(() => renderEmailHtml({ subject, preheader, blocks }, "#"), [subject, preheader, blocks]);
  const setBlock = (i: number, b: EmailBlock) => setBlocks((x) => x.map((y, j) => (j === i ? b : y)));
  const move = (i: number, d: number) => setBlocks((x) => { const y = [...x]; const t = y[i + d]; if (!t) return x; y[i + d] = y[i]!; y[i] = t; return y; });

  const saveM = useMutation({
    mutationFn: () => save({ data: { id: isNew ? null : id, name, subject, preheader: preheader || null, blocks, audienceId, scheduledAt: fromLocalInput(when) } }),
    onSuccess: (r) => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["mk-emails"] }); if (isNew) nav({ to: "/marketing/emails/$id", params: { id: r.id } }); else q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const decideM = useMutation({
    mutationFn: (action: "submit" | "approve" | "reject") => decide({ data: { id, action, note: note || null } }),
    onSuccess: (_r, a) => { toast.success(a === "submit" ? "Sent for approval" : a === "approve" ? "Approved and scheduled" : "Sent back"); setNote(""); q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const testM = useMutation({ mutationFn: () => test({ data: { id } }), onSuccess: (r) => toast.success(`Test sent to ${r.to}`), onError: (e) => toast.error((e as Error).message) });
  const bodyM = useMutation({
    mutationFn: () => draft({ data: { kind: "email", brief } }),
    onSuccess: (r) => setBlocks((x) => [...x, { type: "text", text: r.text }]), onError: (e) => toast.error((e as Error).message),
  });
  const subjM = useMutation({
    mutationFn: () => draft({ data: { kind: "subject", brief: brief || name } }),
    onSuccess: (r) => setSubjects(r.text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 5)), onError: (e) => toast.error((e as Error).message),
  });
  const onImage = async (i: number, f: File | undefined) => {
    if (!f) return;
    try { const r = await upload({ data: { fileName: f.name, contentType: f.type, base64: await fileToBase64(f) } }); setBlock(i, { type: "image", url: r.url, alt: "" }); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (!isNew && q.isLoading) return <MkPage title="Email" intro=""><p className="text-sm text-muted-foreground">Loading…</p></MkPage>;
  if (q.error) return <MkPage title="Email" intro=""><p className="text-sm text-destructive">{(q.error as Error).message}</p></MkPage>;

  return (
    <MkPage title={isNew ? "New email" : name || "Email"} intro="Build with blocks; the Harmonious header and unsubscribe footer are added automatically."
      actions={<div className="flex items-center gap-2">{!isNew && <StatusBadge status={status} />}<Button variant="outline" asChild><Link to="/marketing/emails">All emails</Link></Button></div>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Name (internal)</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={locked} /></div>
            <div><Label>Audience</Label>
              <Select value={audienceId ?? ""} onValueChange={(v) => setAudienceId(v || null)} disabled={locked}>
                <SelectTrigger><SelectValue placeholder="Choose an audience" /></SelectTrigger>
                <SelectContent>{(aud.data ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.members})</SelectItem>)}</SelectContent>
              </Select>
              {aud.data?.length === 0 && <Link to="/marketing/audiences" className="text-xs text-primary underline">Create an audience</Link>}
            </div>
          </div>
          <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} /></div>
          {subjects.length > 0 && <div className="flex flex-wrap gap-1">{subjects.map((s) => <Button key={s} size="sm" variant="outline" onClick={() => setSubject(s)}>{s}</Button>)}</div>}
          <div><Label>Preview text</Label><Input value={preheader} onChange={(e) => setPreheader(e.target.value)} disabled={locked} placeholder="Shown next to the subject in the inbox" /></div>

          {!locked && <Panel title="Draft with AI">
            <Textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What should this email say?" />
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => bodyM.mutate()} disabled={bodyM.isPending || brief.trim().length < 3}><Sparkles className="mr-1 h-4 w-4" />{bodyM.isPending ? "Writing…" : "Write body"}</Button>
              <Button variant="outline" size="sm" onClick={() => subjM.mutate()} disabled={subjM.isPending || !(brief || name)}><Sparkles className="mr-1 h-4 w-4" />Suggest subjects</Button>
            </div>
          </Panel>}

          <Panel title="Content blocks">
            <div className="space-y-3">{blocks.map((b, i) => (
              <div key={i} className="rounded border p-2">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span className="capitalize">{b.type}</span>
                  {!locked && <span className="flex gap-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-3 w-3" /></Button><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-3 w-3" /></Button><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setBlocks((x) => x.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-3 w-3" /></Button></span>}
                </div>
                {b.type === "heading" && <Input value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} disabled={locked} />}
                {b.type === "text" && <Textarea rows={4} value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} disabled={locked} />}
                {b.type === "image" && (b.url ? <img src={b.url} alt="" className="max-h-40 rounded" /> : !locked && <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => onImage(i, e.target.files?.[0])} className="text-sm" />)}
                {b.type === "button" && <div className="grid grid-cols-2 gap-2"><Input value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} disabled={locked} /><Input value={b.href} onChange={(e) => setBlock(i, { ...b, href: e.target.value })} disabled={locked} placeholder="https://" /></div>}
              </div>))}</div>
            {!locked && <div className="mt-3 flex flex-wrap gap-1">{(Object.keys(NEW_BLOCK) as EmailBlock["type"][]).map((t) => <Button key={t} size="sm" variant="outline" onClick={() => setBlocks((x) => [...x, { ...NEW_BLOCK[t] }])} className="capitalize">+ {t}</Button>)}</div>}
          </Panel>

          <div className="max-w-xs"><Label>Send at</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={locked} /><p className="mt-1 text-xs text-muted-foreground">Leave empty to send as soon as it's approved.</p></div>
          {!locked && <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? "Saving…" : "Save"}</Button>
            {!isNew && <Button variant="outline" onClick={() => testM.mutate()} disabled={testM.isPending}>Send test to me</Button>}
            {!isNew && (status === "draft" || status === "rejected") && <Button variant="secondary" onClick={() => decideM.mutate("submit")} disabled={decideM.isPending || problems.length > 0}>Submit for approval</Button>}
          </div>}
          {!locked && problems.length > 0 && <ul className="list-disc pl-5 text-xs text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          {status === "submitted" && q.data?.canApprove && (
            <Panel title="Approve this email">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
              <div className="mt-2 flex gap-2"><Button onClick={() => decideM.mutate("approve")} disabled={decideM.isPending}>Approve & schedule</Button><Button variant="outline" onClick={() => decideM.mutate("reject")} disabled={decideM.isPending}>Send back</Button></div>
            </Panel>
          )}
          {q.data && Object.keys(q.data.sends).length > 0 && <Panel title="Delivery"><p className="text-sm">{Object.entries(q.data.sends).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</p></Panel>}
          {!!q.data?.history.length && <Panel title="History"><ul className="space-y-1 text-xs text-muted-foreground">{q.data.history.map((h: any) => <li key={h.id}>{fmt(h.created_at)} · {h.actor_name} · {h.action.replace(/_/g, " ")}{h.note ? ` — “${h.note}”` : ""}</li>)}</ul></Panel>}
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-sm font-medium">Preview</p>
          <iframe title="Email preview" srcDoc={html} sandbox="" className="h-[800px] w-full rounded border bg-background" />
        </div>
      </div>
    </MkPage>
  );
}
