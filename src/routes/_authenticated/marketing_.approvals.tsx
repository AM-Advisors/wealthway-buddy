import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MkPage, fmt, mkHead } from "@/components/marketing-ui";
import { getMarketingApprovals } from "@/lib/marketing-approvals.functions";
import { STUDIO_NEXT } from "@/lib/marketing-approvals-model";
import { decideMarketingEmail, decideMarketingPost } from "@/lib/marketing.functions";
import { moveStudioItem } from "@/lib/marketing-studio.functions";
import { decideMarketingCollateral } from "@/lib/marketing-collateral.functions";

export const Route = createFileRoute("/_authenticated/marketing_/approvals")({
  head: mkHead("Approvals", "Everything in Marketing waiting for approval, in one list with one-click approve or send back."),
  component: ApprovalsPage,
});

const KIND = { post: "Social post", email: "Email", article: "Article", collateral: "Collateral" } as const;
const href = (r: any) => r.kind === "post" ? { to: "/marketing/posts/$id", params: { id: r.id } } : r.kind === "email" ? { to: "/marketing/emails/$id", params: { id: r.id } } : r.kind === "article" ? { to: "/marketing/studio/content/$itemId", params: { itemId: r.id } } : { to: "/marketing/collateral", params: {} };

function ApprovalsPage() {
  const load = useServerFn(getMarketingApprovals);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mk-approvals"], queryFn: () => load(), retry: false });
  const post = useServerFn(decideMarketingPost), email = useServerFn(decideMarketingEmail), move = useServerFn(moveStudioItem), coll = useServerFn(decideMarketingCollateral);
  const [pending, setPending] = useState<{ row: any; action: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!pending) return;
    const { row, action } = pending;
    setBusy(true);
    try {
      const n = note.trim() || null;
      if (row.kind === "post") await post({ data: { id: row.id, action, note: n } });
      else if (row.kind === "email") await email({ data: { id: row.id, action, note: n } });
      else if (row.kind === "collateral") await coll({ data: { id: row.id, action, note: n } });
      else await move({ data: { id: row.id, to: action === "approve" ? STUDIO_NEXT[row.status] : "drafting", note: n } } as never);
      toast.success(action === "approve" ? "Approved" : "Sent back to the author");
      setPending(null); setNote("");
      await qc.invalidateQueries({ queryKey: ["mk-approvals"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const rows = q.data?.rows ?? [];
  return (
    <MkPage title="Approvals" intro="Everything in Marketing waiting for a decision, in one list. Approved items still go live only at their scheduled time.">
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.data && !rows.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">Nothing is waiting for approval.</p>}
      <ul className="space-y-3">
        {rows.map((r: any) => (
          <li key={`${r.kind}-${r.id}`} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{KIND[r.kind as keyof typeof KIND]} · {r.stage}</div>
                <Link {...(href(r) as any)} className="mt-1 block text-lg font-medium hover:underline">{r.title}</Link>
                <div className="mt-1 text-sm text-muted-foreground">{r.author ? `By ${r.author}` : ""}{r.at ? ` · ${fmt(r.at)}` : ""}</div>
                {r.children?.length > 0 && <div className="mt-2 text-sm">Includes: {r.children.map((c: any) => <Link key={c.id} {...(href(c) as any)} className="mr-2 text-primary underline">{KIND[c.kind as keyof typeof KIND]}: {c.title}</Link>)}
                  <p className="text-xs text-muted-foreground">These are approved separately after the article is approved.</p></div>}
              </div>
              {r.canApprove ? (
                <div className="flex gap-2">
                  <Button size="lg" onClick={() => setPending({ row: r, action: "approve" })}>Approve</Button>
                  <Button size="lg" variant="outline" onClick={() => setPending({ row: r, action: "reject" })}>Send back</Button>
                </div>
              ) : <span className="rounded bg-muted px-2 py-1 text-sm">{r.reason}</span>}
            </div>
          </li>
        ))}
      </ul>
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setNote(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.action === "approve" ? "Approve" : "Send back"} “{pending?.row.title}”?</AlertDialogTitle>
            <AlertDialogDescription>{pending?.action === "approve" ? "It moves to the next step and goes live only at its scheduled time." : "The author will see your note and can edit it."}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={pending?.action === "approve" ? "Optional note" : "What needs to change?"} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy || (pending?.action === "reject" && !note.trim())} onClick={(e) => { e.preventDefault(); void run(); }}>{pending?.action === "approve" ? "Approve" : "Send back"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MkPage>
  );
}
