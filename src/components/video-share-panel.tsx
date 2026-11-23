import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2 } from "lucide-react";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { parseDevice } from "@/lib/recording-details";
import { cancelVideoShareFn, createVideoShareFn, videoShareStatusFn } from "@/lib/video-share.functions";

/** One link per screen video that anyone can open after typing a name and email; shows who watched. */
export function VideoSharePanel({ recordingId }: { recordingId: string }) {
  const status = useServerFn(videoShareStatusFn);
  const create = useServerFn(createVideoShareFn);
  const cancel = useServerFn(cancelVideoShareFn);
  const qc = useQueryClient();
  const key = ["video-share", recordingId];
  const q = useQuery({ queryKey: key, queryFn: () => status({ data: { recordingId } }), retry: false });
  const [includeCamera, setIncludeCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "replace" | "off">(null);
  const fmt = (s: string) => new Date(s).toLocaleString();

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copied. Paste it into your email or text."); }
    catch { toast.info("Select the link in the box and copy it."); }
  };
  const make = async () => {
    setBusy(true);
    try {
      const r = await create({ data: { recordingId, includeCamera } });
      await qc.invalidateQueries({ queryKey: key });
      await copy(r.url);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setConfirm(null); }
  };
  const turnOff = async () => {
    setBusy(true);
    try { await cancel({ data: { recordingId } }); await qc.invalidateQueries({ queryKey: key }); toast.success("Link turned off. It no longer opens the video."); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setConfirm(null); }
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading share link…</p>;
  if (q.isError) return <LoadError error={q.error} what="Share link" onRetry={() => q.refetch()} />;
  const d = q.data!;
  const a = d.active;
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium"><Link2 className="size-4" />Share this video</p>
      <p className="text-muted-foreground">Anyone with the link can watch after typing their name and email. Names aren't checked, so treat them as what the viewer typed.</p>
      {d.hasCamera && (
        <div className="flex items-center gap-2">
          <Checkbox id={`cam-${recordingId}`} checked={includeCamera} onCheckedChange={(v) => setIncludeCamera(v === true)} />
          <Label htmlFor={`cam-${recordingId}`}>Include their {d.cameraVideo ? "camera and microphone" : "microphone"} (for the next link you make)</Label>
        </div>
      )}
      {a ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input readOnly value={a.url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={() => void copy(a.url)}><Copy className="mr-1 size-4" />Copy</Button>
          </div>
          <p className="text-muted-foreground">Works until {new Date(a.expiresAt).toLocaleDateString()} · {a.viewCount} {a.viewCount === 1 ? "viewing" : "viewings"}{a.lastViewedAt ? ` · last ${fmt(a.lastViewedAt)}` : " · not watched yet"}{d.hasCamera ? (a.includeCamera ? " · includes camera/microphone" : " · screen only") : ""}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm("replace")}>Make a new link</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm("off")}>Turn off link</Button>
          </div>
        </div>
      ) : (
        <Button disabled={busy} onClick={() => void make()}>{busy ? "Making link…" : "Make share link"}</Button>
      )}
      <div>
        <p className="mb-1 font-medium">Who watched</p>
        {d.views.length === 0 ? <p className="text-muted-foreground">No one yet.</p> : (
          <ul className="divide-y rounded border bg-background">
            {d.views.map((v: any) => { const dev = parseDevice(v.user_agent); return (
              <li key={v.id} className="flex flex-wrap justify-between gap-2 p-2">
                <span><span className="font-medium">{v.viewer_name}</span> · {v.viewer_email}{!v.current && <Badge variant="outline" className="ml-2">earlier link</Badge>}</span>
                <span className="text-muted-foreground">{fmt(v.viewed_at)} · {dev.type} · {dev.browser}{v.ip_address ? ` · ${v.ip_address}` : ""}</span>
              </li>
            ); })}
          </ul>
        )}
      </div>
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "replace" ? "Make a new link?" : "Turn off this link?"}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === "replace" ? "The link you already sent will stop working. Anyone who still needs the video will need the new link." : "The link stops opening the video. The list of who watched stays."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current link</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void (confirm === "replace" ? make() : turnOff()); }}>{confirm === "replace" ? "Make new link" : "Turn off"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
