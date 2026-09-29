import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listRelatedPersonReviewsFn, resolveRelatedPersonReviewFn } from "@/lib/investor-record.functions";

/** Harmonious-only: resolve possible existing owners / signers. Never merges People. */
export function RelatedPersonReviews() {
  const load = useServerFn(listRelatedPersonReviewsFn);
  const resolve = useServerFn(resolveRelatedPersonReviewFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["related-person-reviews"], queryFn: () => load(), retry: false });
  const m = useMutation({
    mutationFn: (v: { reviewId: string; resolution: "use_existing" | "keep_new" | "review_later"; personId?: string }) => resolve({ data: v }),
    onSuccess: () => { toast.success("Saved."); void qc.invalidateQueries({ queryKey: ["related-person-reviews"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });
  const items = ((q.data as any)?.items ?? []) as any[];
  if (q.error || !items.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Owner and signer records to review <Badge variant="secondary">{items.length}</Badge></CardTitle>
        <CardDescription>These people may already exist in Harmonious. Nothing is merged until you choose. Fund managers and investors only see that a review is in progress.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((it) => (
          <div key={it.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{it.supplied?.firstName} {it.supplied?.lastName}{it.supplied?.email ? ` · ${it.supplied.email}` : ""}</span>
              <Badge variant="outline">{it.matchKind === "ambiguous" ? "Several possible matches" : "Possible existing person"}{it.status === "review_later" ? " · Later" : ""}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Role {String(it.supplied?.role ?? "").replace(/_/g, " ")}
              {it.supplied?.ownershipPercent != null ? ` · ${it.supplied.ownershipPercent}%` : ""}
              {it.supplied?.isSigner ? " · signer" : ""}
            </p>
            <ul className="mt-2 space-y-1">
              {it.candidates.map((c: any) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{c.name}{c.email ? ` · ${c.email}` : ""}{c.claimed ? " · has account" : ""}</span>
                  <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ reviewId: it.id, resolution: "use_existing", personId: c.id })}>Use Existing Person</Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={m.isPending} onClick={() => m.mutate({ reviewId: it.id, resolution: "keep_new" })}>Keep as New Person</Button>
              {it.status !== "review_later" ? (
                <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ reviewId: it.id, resolution: "review_later" })}>Review Later</Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
