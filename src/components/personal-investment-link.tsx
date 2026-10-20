import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPersonalInvestmentLink, getMyPersonalInvestmentLinks, getPersonalInvestmentLink, recordPersonalInvestmentLinkCopy, sendPersonalInvestmentLink } from "@/lib/personal-investment-link.functions";

const STATE: Record<string, string> = { active: "Not opened yet", claimed: "Claimed by investor", expired: "Expired", disabled: "Disabled" };

/** Fund manager / Harmonious: the investor's own personal link for this investment. */
export function PersonalInvestmentLinkCard({ onboardingId }: { onboardingId: string }) {
  const load = useServerFn(getPersonalInvestmentLink), create = useServerFn(createPersonalInvestmentLink), send = useServerFn(sendPersonalInvestmentLink), copied = useServerFn(recordPersonalInvestmentLinkCopy), qc = useQueryClient();
  const key = ["personal-investment-link", onboardingId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => load({ data: { onboardingId } }) });
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: key }); } catch (e) { toast.error((e as Error).message); } };
  const copy = async (url: string) => { await navigator.clipboard?.writeText(url).catch(() => undefined); toast.success("Link copied"); void copied({ data: { onboardingId } }).catch(() => null); };
  return (
    <Card className="md:col-span-2"><CardHeader><CardTitle className="text-base">Personal link</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      {isLoading || !data ? <p className="text-muted-foreground">Loading…</p> : data.link ? <>
        <div className="flex flex-wrap items-center gap-2"><code className="break-all rounded bg-muted px-2 py-1 text-xs">{data.link.url}</code><Button size="sm" variant="outline" onClick={() => copy(data.link!.url)}>Copy</Button></div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant={data.link.state === "claimed" ? "default" : "secondary"}>{STATE[data.link.state] ?? data.link.state}</Badge>
          <span>{data.link.lastSentAt ? `Emailed ${new Date(data.link.lastSentAt).toLocaleDateString()}` : "Not emailed"}</span>
          {data.link.expiresAt ? <span>· expires {new Date(data.link.expiresAt).toLocaleDateString()}</span> : null}</div>
        {data.canSend ? <Button size="sm" onClick={() => run(() => send({ data: { onboardingId } }), "Invite email sent")}>Send invite email</Button> : null}
      </> : <>
        <p className="text-muted-foreground">No personal link yet. Creating one does not email the investor; share it however you like, or send the invite email after.</p>
        {data.canCreate ? <Button size="sm" onClick={() => run(() => create({ data: { onboardingId } }), "Personal link created")}>Create personal link</Button> : !data.hasEmail ? <p className="text-xs text-muted-foreground">Add the investor's email first.</p> : null}
      </>}
      <p className="text-xs text-muted-foreground">Only the investor, signed in with this email, can open it.{data && !data.launched ? " This fund opens to new investments at launch; the investor can still review and prepare their existing investment." : ""}</p>
    </CardContent></Card>
  );
}

/** Investor: their own links back to each investment. */
export function MyPersonalInvestmentLinks({ onlyOnboardingId }: { onlyOnboardingId?: string } = {}) {
  const load = useServerFn(getMyPersonalInvestmentLinks), copied = useServerFn(recordPersonalInvestmentLinkCopy);
  const { data } = useQuery({ queryKey: ["my-personal-investment-links"], queryFn: () => load() });
  const links = (data?.links ?? []).filter((l) => !onlyOnboardingId || l.onboardingId === onlyOnboardingId);
  if (!links.length) return null;
  return (
    <Card><CardHeader><CardTitle className="text-base">Your personal investment link{links.length > 1 ? "s" : ""}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      {links.map((l) => <div key={l.onboardingId} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
        <span>{l.fundName}</span>
        <span className="flex gap-2"><Button size="sm" variant="outline" asChild><a href={l.url}>Open</a></Button><Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard?.writeText(l.url).catch(() => undefined); toast.success("Link copied"); void copied({ data: { onboardingId: l.onboardingId } }).catch(() => null); }}>Copy</Button></span>
      </div>)}
      <p className="text-xs text-muted-foreground">Use this link to return to your investment. It only opens when you're signed in.</p>
    </CardContent></Card>
  );
}

/** Compact per-row control: copies the investor's existing personal link, or creates one (no email sent). */
export function PersonalLinkCopyButton({ onboardingId }: { onboardingId: string }) {
  const load = useServerFn(getPersonalInvestmentLink), create = useServerFn(createPersonalInvestmentLink), copied = useServerFn(recordPersonalInvestmentLinkCopy), qc = useQueryClient();
  const key = ["personal-investment-link", onboardingId];
  const go = async () => {
    try {
      let d = await qc.fetchQuery({ queryKey: key, queryFn: () => load({ data: { onboardingId } }) });
      if (!d.link) {
        if (!d.canCreate) { toast.error(d.hasEmail ? "No personal link yet." : "Add the investor's email first."); return; }
        await create({ data: { onboardingId } });
        d = await qc.fetchQuery({ queryKey: key, queryFn: () => load({ data: { onboardingId } }), staleTime: 0 });
      }
      if (!d.link) return;
      await navigator.clipboard?.writeText(d.link.url).catch(() => undefined);
      toast.success("Personal link copied", { description: d.link.url });
      void copied({ data: { onboardingId } }).catch(() => null);
    } catch (e) { toast.error((e as Error).message); }
  };
  return <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={go}>Copy link</Button>;
}
