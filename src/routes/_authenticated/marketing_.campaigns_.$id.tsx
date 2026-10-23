import { MarketingDrivePicker } from "@/components/marketing-drive-picker";
import { addCampaignAsset, getCampaignAssets, removeCampaignAsset } from "@/lib/marketing-drive.functions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MkPage, mkHead, StatusBadge, fmt, fromLocalInput } from "@/components/marketing-ui";
import { CampaignCalendar, COLOR_CLS } from "@/components/marketing-campaigns-ui";
import { archiveCampaign, assignToCampaign, composeCampaignEmail, getCampaign, saveCampaign } from "@/lib/marketing-campaigns.functions";
import { decideMarketingEmail } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/marketing_/campaigns_/$id")({
  head: mkHead("Campaign", "Campaign theme, dates, emails and posts, with a live calendar."),
  component: CampaignPage,
});

function CampaignPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["mk-campaign", id], queryFn: () => load({ data: { id } }), refetchInterval: 15000, retry: false });
  const load = useServerFn(getCampaign);
  const mood = useServerFn(getCampaignAssets), addMood = useServerFn(addCampaignAsset), rmMood = useServerFn(removeCampaignAsset);
  const moodQ = useQuery({ queryKey: ["mk-mood", id], queryFn: () => mood({ data: { campaignId: id } }), retry: false });
  const save = useServerFn(saveCampaign), archive = useServerFn(archiveCampaign), assign = useServerFn(assignToCampaign);
  const compose = useServerFn(composeCampaignEmail), decide = useServerFn(decideMarketingEmail);
  const [f, setF] = useState<any>(null);
  const [m, setM] = useState({ subject: "", heading: "", body: "", buttonText: "", buttonHref: "", audienceId: "", sendAt: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data && !f) { const c = q.data.campaign; setF({ name: c.name, theme: c.theme ?? "", goal: c.goal ?? "", notes: c.notes ?? "", color: c.color, startsOn: c.starts_on, endsOn: c.ends_on }); } }, [q.data, f]);

  const run = async (fn: () => Promise<any>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); await qc.invalidateQueries(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); }
  };
  const send = (submit: boolean) => run(async () => {
    await compose({ data: { campaignId: id, name: m.subject, subject: m.subject, heading: m.heading || null, body: m.body, buttonText: m.buttonText || null, buttonHref: m.buttonHref || null, audienceId: m.audienceId, sendAt: fromLocalInput(m.sendAt), submit } });
    setM({ subject: "", heading: "", body: "", buttonText: "", buttonHref: "", audienceId: m.audienceId, sendAt: "" });
  }, submit ? "Submitted for approval. It sends as soon as a Marketing Manager approves it." : "Saved as a draft.");

  if (q.error) return <MkPage title="Campaign" intro=""><p className="text-sm text-destructive">{(q.error as Error).message}</p></MkPage>;
  if (!q.data || !f) return <MkPage title="Campaign" intro="Loading…"><span /></MkPage>;
  const d = q.data;

  return (
    <MkPage title={d.campaign.name} intro={d.campaign.theme || "Plan this campaign's emails and posts."}
      actions={<div className="flex gap-2">
        <Button variant="outline" asChild><Link to="/marketing/campaigns">All campaigns</Link></Button>
        <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm("Archive this campaign? Its emails and posts stay as they are.")) void run(() => archive({ data: { id } }), "Campaign archived.").then(() => nav({ to: "/marketing/campaigns" })); }}>Archive</Button>
      </div>}>
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Theme & dates</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" />
              <Textarea rows={2} placeholder="Theme or message" value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} />
              <Input placeholder="Goal" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
              <Textarea rows={3} placeholder="Notes, key dates, ideas" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Starts<Input type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></label>
                <label className="text-xs text-muted-foreground">Ends<Input type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></label>
              </div>
              <div className="flex gap-1.5">{Object.keys(COLOR_CLS).map((c) => <button key={c} type="button" aria-label={c} onClick={() => setF({ ...f, color: c })} className={`h-6 w-6 rounded-full ${COLOR_CLS[c]!.dot} ${f.color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`} />)}</div>
              <Button disabled={busy} onClick={() => run(() => save({ data: { id, ...f, theme: f.theme || null, goal: f.goal || null, notes: f.notes || null } }), "Campaign saved.")}>Save</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Write & send an email</CardTitle>
              <CardDescription>Goes to the chosen audience on the send time (or right away). A Marketing Manager other than you approves it first; unsubscribed people are always skipped.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Subject" value={m.subject} onChange={(e) => setM({ ...m, subject: e.target.value })} />
              <Input placeholder="Heading (optional)" value={m.heading} onChange={(e) => setM({ ...m, heading: e.target.value })} />
              <Textarea rows={6} placeholder="Message" value={m.body} onChange={(e) => setM({ ...m, body: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Button text" value={m.buttonText} onChange={(e) => setM({ ...m, buttonText: e.target.value })} />
                <Input placeholder="https://…" value={m.buttonHref} onChange={(e) => setM({ ...m, buttonHref: e.target.value })} />
              </div>
              <select aria-label="Audience" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={m.audienceId} onChange={(e) => setM({ ...m, audienceId: e.target.value })}>
                <option value="">Choose an audience…</option>
                {d.audiences.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label className="block text-xs text-muted-foreground">Send at (leave empty to send as soon as approved)<Input type="datetime-local" value={m.sendAt} onChange={(e) => setM({ ...m, sendAt: e.target.value })} /></label>
              <div className="flex gap-2">
                <Button disabled={busy || !m.subject || !m.body || !m.audienceId} onClick={() => send(true)}>Send for approval</Button>
                <Button variant="outline" disabled={busy || !m.subject || !m.body || !m.audienceId} onClick={() => send(false)}>Save draft</Button>
              </div>
              {!d.audiences.length && <p className="text-xs text-muted-foreground">No audiences yet — create one on the <Link to="/marketing/audiences" className="underline">Audiences</Link> page.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <CampaignCalendar focusId={id} />
          <Card>
            <CardHeader><CardTitle className="text-base">Images &amp; themes from Google Drive</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {(moodQ.data ?? []).map((m) => (
                  <div key={m.id} className="overflow-hidden rounded border text-xs">
                    <div className="flex aspect-square items-center justify-center bg-muted">{m.previewUrl ? <img src={m.previewUrl} alt={m.name} className="h-full w-full object-cover" /> : m.kind}</div>
                    <div className="flex items-center gap-1 p-1"><span className="truncate">{m.name}</span><button className="ml-auto text-destructive" aria-label={`Remove ${m.name}`} onClick={async () => { await rmMood({ data: { id: m.id } }); void moodQ.refetch(); }}>×</button></div>
                  </div>
                ))}
              </div>
              {!(moodQ.data ?? []).length && <p className="text-sm text-muted-foreground">Pick images and theme folders from the Marketing Drive to plan this campaign.</p>}
              <MarketingDrivePicker label="Add from Google Drive" onPick={async (a) => { try { await addMood({ data: { campaignId: id, assetId: a.id } }); void moodQ.refetch(); } catch (e) { toast.error((e as Error).message); } }} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Emails in this campaign</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!d.emails.length && <p className="text-sm text-muted-foreground">None yet.</p>}
              {d.emails.map((e: any) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                  <Link to="/marketing/emails/$id" params={{ id: e.id }} className="font-medium hover:underline">{e.subject || e.name}</Link>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{fmt(e.sent_at ?? e.scheduled_at)}</span>
                    <StatusBadge status={e.status} />
                    {e.status === "draft" && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => decide({ data: { id: e.id, action: "submit" } }), "Submitted for approval.")}>Submit</Button>}
                    {e.status === "submitted" && d.canApprove && e.author_id !== d.me && <Button size="sm" disabled={busy} onClick={() => run(() => decide({ data: { id: e.id, action: "approve" } }), "Approved — sending on schedule.")}>Approve & send</Button>}
                    <Button size="sm" variant="ghost" onClick={() => run(() => assign({ data: { kind: "email", itemId: e.id, campaignId: null } }), "Removed from campaign.")}>Remove</Button>
                  </span>
                </div>
              ))}
              {d.unassignedEmails.length > 0 && (
                <select aria-label="Add an existing email" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value="" onChange={(e) => e.target.value && run(() => assign({ data: { kind: "email", itemId: e.target.value, campaignId: id } }), "Added to campaign.")}>
                  <option value="">Add an existing email…</option>
                  {d.unassignedEmails.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Social posts in this campaign</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!d.posts.length && <p className="text-sm text-muted-foreground">None yet. Write a post, then add it here.</p>}
              {d.posts.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <Link to="/marketing/posts/$id" params={{ id: p.id }} className="font-medium hover:underline">{p.title}</Link>
                  <span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{fmt(p.published_at ?? p.scheduled_at)}</span><StatusBadge status={p.status} />
                    <Button size="sm" variant="ghost" onClick={() => run(() => assign({ data: { kind: "post", itemId: p.id, campaignId: null } }), "Removed.")}>Remove</Button></span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </MkPage>
  );
}
