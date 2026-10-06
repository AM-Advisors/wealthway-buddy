import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel } from "@/components/sales/sales-ui";
import { MkPage, StatusBadge, fileToBase64, fmt, fromLocalInput, mkHead, toLocalInput } from "@/components/marketing-ui";
import { CHANNELS, CHANNEL_LABEL, CHANNEL_LIMIT, postProblems, type Channel } from "@/lib/marketing-model";
import { PostBrandLayout } from "@/components/marketing/post-brand-layout";
import { MarketingDrivePicker } from "@/components/marketing-drive-picker";
import { useMarketingDriveImage } from "@/lib/marketing-drive.functions";
import { decideMarketingPost, getMarketingPost, marketingDraftCopy, marketingGenerateImage, saveMarketingPost, uploadMarketingAsset } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/marketing_/posts_/$id")({
  head: mkHead("Post editor", "Design a social post for LinkedIn, Facebook and Instagram."),
  component: PostEditor,
});

function PostEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const nav = useNavigate();
  const qc = useQueryClient();
  const load = useServerFn(getMarketingPost);
  const save = useServerFn(saveMarketingPost);
  const decide = useServerFn(decideMarketingPost);
  const upload = useServerFn(uploadMarketingAsset);
  const fromDrive = useServerFn(useMarketingDriveImage);
  const draft = useServerFn(marketingDraftCopy);
  const genImg = useServerFn(marketingGenerateImage);
  const q = useQuery({ queryKey: ["mk-post", id], queryFn: () => load({ data: { id } }), enabled: !isNew, retry: false });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["linkedin"]);
  const [images, setImages] = useState<{ path: string; url: string }[]>([]);
  const [when, setWhen] = useState("");
  const [brief, setBrief] = useState("");
  const [imgPrompt, setImgPrompt] = useState("");
  const [note, setNote] = useState("");
  const [imgMode, setImgMode] = useState<"brand" | "free">("brand");
  const [preview, setPreview] = useState<Channel>("linkedin");

  useEffect(() => {
    const p = q.data?.post;
    if (!p) return;
    setTitle(p.title); setBody(p.body); setChannels(p.channels); setWhen(toLocalInput(p.scheduled_at));
    setImages((p.image_paths ?? []).map((path: string, i: number) => ({ path, url: q.data!.imageUrls[i] ?? "" })));
    if (p.channels[0]) setPreview(p.channels[0]);
  }, [q.data]);

  const status = q.data?.post.status ?? "draft";
  const locked = ["publishing", "published", "sending", "sent"].includes(status);
  const problems = postProblems({ title, body, channels, imageCount: images.length });

  const saveM = useMutation({
    mutationFn: () => save({ data: { id: isNew ? null : id, title, body, channels, imagePaths: images.map((i) => i.path), scheduledAt: fromLocalInput(when) } }),
    onSuccess: (r) => { toast.success(status !== "draft" && !isNew ? "Saved — back to draft for re-approval" : "Saved"); qc.invalidateQueries({ queryKey: ["mk-posts"] }); if (isNew) nav({ to: "/marketing/posts/$id", params: { id: r.id } }); else q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const decideM = useMutation({
    mutationFn: (action: "submit" | "approve" | "reject") => decide({ data: { id, action, note: note || null } }),
    onSuccess: (_r, a) => { toast.success(a === "submit" ? "Sent for approval" : a === "approve" ? "Approved and scheduled" : "Sent back to the author"); setNote(""); q.refetch(); qc.invalidateQueries({ queryKey: ["mk-posts"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const draftM = useMutation({
    mutationFn: () => draft({ data: { kind: preview, brief: brief || title, current: body || null } }),
    onSuccess: (r) => setBody(r.text), onError: (e) => toast.error((e as Error).message),
  });
  const imgM = useMutation({
    mutationFn: (prompt: string) => genImg({ data: { prompt } }),
    onSuccess: (r) => { setImages((x) => [...x, r]); setImgPrompt(""); }, onError: (e) => toast.error((e as Error).message),
  });
  const postTextPrompt = `Create a brand image for this social media post. Post title: ${title || "Untitled"}. Post text: ${body.slice(0, 1200)}`;
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { const r = await upload({ data: { fileName: f.name, contentType: f.type, base64: await fileToBase64(f) } }); setImages((x) => [...x, r]); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (!isNew && q.isLoading) return <MkPage title="Post" intro=""><p className="text-sm text-muted-foreground">Loading…</p></MkPage>;
  if (q.error) return <MkPage title="Post" intro=""><p className="text-sm text-destructive">{(q.error as Error).message}</p></MkPage>;

  return (
    <MkPage title={isNew ? "New post" : title || "Post"} intro={isNew ? "Write it once and pick where it goes." : `By ${q.data?.post.author_name}`}
      actions={<div className="flex items-center gap-2">{!isNew && <StatusBadge status={status} />}<Button variant="outline" asChild><Link to="/marketing/posts">All posts</Link></Button></div>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div><Label htmlFor="t">Title (internal)</Label><Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} placeholder="e.g. Q4 fund admin tips" /></div>
          <div>
            <Label>Channels</Label>
            <div className="mt-2 flex gap-4">{CHANNELS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={channels.includes(c)} disabled={locked} onCheckedChange={(v) => setChannels((x) => v ? [...x, c] : x.filter((y) => y !== c))} />{CHANNEL_LABEL[c]}</label>
            ))}</div>
          </div>
          <div>
            <div className="flex items-center justify-between"><Label htmlFor="b">Post text</Label><span className="text-xs text-muted-foreground">{body.length} characters</span></div>
            <Textarea id="b" rows={10} value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} />
          </div>
          {!locked && (
            <Panel title="Draft with AI">
              <div className="flex gap-2"><Input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What's the post about? (AI writes for the channel shown in the preview)" /><Button variant="outline" onClick={() => draftM.mutate()} disabled={draftM.isPending || !(brief || title)}><Sparkles className="mr-1 h-4 w-4" />{draftM.isPending ? "Writing…" : body ? "Rewrite" : "Write"}</Button></div>
            </Panel>
          )}
          <Panel title="Images">
            <div className="grid grid-cols-3 gap-2">{images.map((im, i) => (
              <div key={im.path} className="relative">
                <img src={im.url} alt="" className="aspect-square w-full rounded object-cover" />
                {!locked && <Button size="icon" variant="destructive" className="absolute right-1 top-1 h-7 w-7" onClick={() => setImages((x) => x.filter((_, j) => j !== i))} aria-label="Remove image"><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>))}</div>
            {!locked && (<div className="mt-3 space-y-2">
              <MarketingDrivePicker kind="image" label="Pick from Google Drive" onPick={async (a) => { try { const r = await fromDrive({ data: { assetId: a.id } }); setImages((x) => [...x, r]); } catch (e) { toast.error((e as Error).message); } }} />
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary"><ImagePlus className="h-4 w-4" />Upload image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
              <div className="flex gap-2"><Button size="sm" variant={imgMode === "brand" ? "default" : "outline"} onClick={() => setImgMode("brand")}>Brand layout</Button><Button size="sm" variant={imgMode === "free" ? "default" : "outline"} onClick={() => setImgMode("free")}>Freeform (AI)</Button></div>
              {imgMode === "brand" ? <PostBrandLayout title={title} body={body} onAdd={(r) => setImages((x) => [...x, r])} /> : <>
              <div className="flex gap-2"><Input value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} placeholder="Describe an image for AI to create" /><Button variant="outline" onClick={() => imgM.mutate(imgPrompt)} disabled={imgM.isPending || imgPrompt.trim().length < 3}><Wand2 className="mr-1 h-4 w-4" />{imgM.isPending ? "Creating…" : "Create"}</Button></div>
              <Button variant="outline" size="sm" onClick={() => imgM.mutate(postTextPrompt)} disabled={imgM.isPending || body.trim().length < 10}><Sparkles className="mr-1 h-4 w-4" />{imgM.isPending ? "Creating…" : "Create image from post text"}</Button>
              </>}
              <p className="text-xs text-muted-foreground">The first image is used on every channel.</p>
            </div>)}
          </Panel>
          <div className="max-w-xs"><Label htmlFor="w">Publish at</Label><Input id="w" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={locked} /><p className="mt-1 text-xs text-muted-foreground">Leave empty to publish as soon as it's approved.</p></div>

          {!locked && <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? "Saving…" : "Save"}</Button>
            {!isNew && (status === "draft" || status === "rejected") && <Button variant="secondary" onClick={() => decideM.mutate("submit")} disabled={decideM.isPending || problems.length > 0}>Submit for approval</Button>}
          </div>}
          {!locked && problems.length > 0 && <ul className="list-disc pl-5 text-xs text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

          {status === "submitted" && q.data?.canApprove && (
            <Panel title="Approve this post">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional, required context when sending back)" />
              <div className="mt-2 flex gap-2"><Button onClick={() => decideM.mutate("approve")} disabled={decideM.isPending}>Approve & schedule</Button><Button variant="outline" onClick={() => decideM.mutate("reject")} disabled={decideM.isPending}>Send back</Button></div>
            </Panel>
          )}
          {status === "submitted" && q.data?.isAuthor && <p className="text-sm text-muted-foreground">Waiting for a Marketing Manager to approve. Editing sends it back to draft.</p>}

          {!!q.data?.targets.length && (
            <Panel title="Publishing results">
              <ul className="space-y-1 text-sm">{q.data.targets.map((t: any) => <li key={t.id}><strong>{CHANNEL_LABEL[t.channel as Channel]}</strong>: {t.status}{t.published_at ? ` · ${fmt(t.published_at)}` : ""}{t.error ? <span className="block text-xs text-destructive">{t.error}</span> : null}</li>)}</ul>
            </Panel>
          )}
          {!!q.data?.history.length && (
            <Panel title="History">
              <ul className="space-y-1 text-xs text-muted-foreground">{q.data.history.map((h: any) => <li key={h.id}>{fmt(h.created_at)} · {h.actor_name} · {h.action.replace(/_/g, " ")}{h.note ? ` — “${h.note}”` : ""}</li>)}</ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-3">
          <div className="flex gap-1">{CHANNELS.filter((c) => channels.includes(c)).map((c) => <Button key={c} size="sm" variant={preview === c ? "default" : "outline"} onClick={() => setPreview(c)}>{CHANNEL_LABEL[c]}</Button>)}</div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><div className="h-9 w-9 rounded-full bg-primary" /><div><p className="text-sm font-semibold">Harmonious</p><p className="text-xs text-muted-foreground">{CHANNEL_LABEL[preview]} · preview</p></div></div>
            {preview !== "instagram" && <p className="whitespace-pre-wrap text-sm">{body || "Your post text appears here."}</p>}
            {images[0] && <img src={images[0].url} alt="" className={`mt-3 w-full rounded ${preview === "instagram" ? "aspect-square object-cover" : ""}`} />}
            {preview === "instagram" && <p className="mt-3 whitespace-pre-wrap text-sm"><strong>harmonious</strong> {body}</p>}
            {body.length > CHANNEL_LIMIT[preview] && <p className="mt-2 text-xs text-destructive">Too long for {CHANNEL_LABEL[preview]}.</p>}
          </div>
        </aside>
      </div>
    </MkPage>
  );
}
