import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Link2, MessageSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getFundLinkFn, regenerateFundLinkFn, setFundLinkEnabledFn } from "@/lib/fund-onboarding-link.functions";
import { invitationMessage, LINK_STATUS_LABEL } from "@/lib/fund-onboarding-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-");

export async function copyText(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error("Could not copy. Select and copy the link manually."); }
}

/** Investor Onboarding Link for one fund. Staff manage it; the fund's own managers view and copy it. */
export function FundOnboardingLinkCard({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundLinkFn);
  const regen = useServerFn(regenerateFundLinkFn);
  const toggle = useServerFn(setFundLinkEnabledFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-link", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  if (q.isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (q.isError || !q.data) return <p className="text-sm text-muted-foreground">The onboarding link is available to Harmonious staff and managers of this fund.</p>;
  const d = q.data;
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { const r = await fn(); qc.setQueryData(["fund-link", fundId], r); toast.success(ok); } catch (e) { toast.error((e as Error).message); } };
  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><Link2 className="h-5 w-5" />Investor Onboarding Link</h2>
          <p className="text-sm text-muted-foreground">Share this link with investors to begin or continue onboarding for this Fund.</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", d.status === "active" ? "bg-accent/30" : "bg-muted text-muted-foreground")}>{LINK_STATUS_LABEL[d.status]}</span>
      </div>
      {d.url ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs">{d.url}</code>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => copyText(d.url!, "Link copied")}><Copy className="mr-1 h-3.5 w-3.5" />Copy Link</Button>
            <Button size="sm" variant="outline" asChild><a href={d.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Preview Investor Experience</a></Button>
            <Button size="sm" variant="outline" onClick={() => copyText(invitationMessage(d.fundName, d.url!), "Invitation message copied")}><MessageSquare className="mr-1 h-3.5 w-3.5" />Copy Invitation Message</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{d.status === "disabled" ? "This link is turned off. Investors who open it see that it isn't active." : "No onboarding link has been set up for this fund yet. Press Create Link below to make one."}</p>
      )}
      <dl className="grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-4">
        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Created</dt><dd>{fmt(d.createdAt)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Regenerated</dt><dd>{fmt(d.regeneratedAt)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Last used</dt><dd>{fmt(d.lastUsedAt)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Onboarding starts</dt><dd>{d.starts}</dd></div>
      </dl>
      {d.canManage ? (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button size="sm" variant="outline" onClick={() => { if (d.status === "not_configured" || window.confirm("Regenerate the link? The current link will stop working. Investors who already started keep their onboarding.")) void act(() => regen({ data: { offeringId: fundId } }), d.status === "not_configured" ? "Link created" : "Link regenerated"); }}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />{d.status === "not_configured" ? "Create Link" : "Regenerate Link"}
          </Button>
          {d.status !== "not_configured" ? (
            <Button size="sm" variant="ghost" onClick={() => act(() => toggle({ data: { offeringId: fundId, enabled: d.status !== "active" } }), d.status === "active" ? "Link turned off" : "Link turned on")}>
              {d.status === "active" ? "Turn off link" : "Turn on link"}
            </Button>
          ) : null}
          <p className="w-full text-xs text-muted-foreground">Regenerating or turning off the link never removes investors or onboarding already started through it.</p>
        </div>
      ) : null}
    </section>
  );
}
