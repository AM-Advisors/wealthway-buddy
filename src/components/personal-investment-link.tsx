import { useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPersonalInvestmentLink, getMyPersonalInvestmentLinks, getPersonalInvestmentLink, recordPersonalInvestmentLinkCopy, sendPersonalInvestmentLink } from "@/lib/personal-investment-link.functions";
import { personalLinkStatus } from "@/lib/personal-investment-link-model";

/** Fund manager / Harmonious: the investor's own personal link for this investment. */
export function PersonalInvestmentLinkCard({ onboardingId, email }: { onboardingId: string; email?: string | undefined }) {
  const load = useServerFn(getPersonalInvestmentLink), create = useServerFn(createPersonalInvestmentLink), send = useServerFn(sendPersonalInvestmentLink), copied = useServerFn(recordPersonalInvestmentLinkCopy), qc = useQueryClient();
  const key = ["personal-investment-link", onboardingId];
  const { data, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: () => load({ data: { onboardingId } }) });
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); await qc.invalidateQueries({ queryKey: key }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const copy = async (url: string) => { try { if (!navigator.clipboard) throw new Error("Copy isn't available in this browser."); await navigator.clipboard.writeText(url); toast.success("Link copied"); void copied({ data: { onboardingId } }).catch(() => null); } catch { toast.error("Couldn't copy the link. Please try again."); } };
  const status = personalLinkStatus(data?.link ?? null);
  return (
    <Card className="md:col-span-2"><CardHeader><CardTitle className="text-base">Investor invitation</CardTitle>{email && <p className="break-all text-sm text-muted-foreground">{email}</p>}</CardHeader><CardContent className="space-y-3 text-sm">
      {error ? <div><p className="text-destructive">Couldn't check this invitation.</p><Button variant="outline" onClick={() => refetch()}>Check again</Button></div> : isLoading || !data ? <p className="text-muted-foreground">Checking invitation…</p> : data.link ? <>
        <div className="flex flex-wrap items-center gap-2"><Badge variant={data.link.state === "claimed" ? "default" : "secondary"}>{status.label}</Badge>
          <span>{data.link.lastSentAt ? `Last emailed ${new Date(data.link.lastSentAt).toLocaleString()}` : "Not emailed"}</span>
          {data.link.expiresAt ? <span>Expires {new Date(data.link.expiresAt).toLocaleDateString()}</span> : null}</div>
        {data.link.state === "claimed" && <p className="text-muted-foreground">The investor has connected their account. No new invite is needed.</p>}
        {!status.usable && <p className="text-muted-foreground">This invite cannot be used. Harmonious needs to replace it before sending another.</p>}
        <div className="flex flex-wrap gap-2">
          {status.usable && <Button variant="outline" onClick={() => { if (data.link) void copy(data.link.url); }}>Copy investor link</Button>}
          {data.canSend && <Button disabled={busy} onClick={() => run(async () => { const result = await send({ data: { onboardingId } }); if (!result.emailSent) throw new Error("The invite email wasn't sent. Please try again."); }, "Invite email sent")}>{busy ? "Sending…" : data.link.lastSentAt ? "Resend invite" : "Send invite"}</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => refetch()}>Check status</Button>
        </div>
      </> : <>
        <Badge variant="outline">Not invited</Badge>
        {data.canCreate ? <Button disabled={busy} onClick={() => run(async () => { await create({ data: { onboardingId } }); const result = await send({ data: { onboardingId } }); if (!result.emailSent) throw new Error("The link was created but the email wasn't sent. Check status and try again."); }, "Invite email sent")}>{busy ? "Sending…" : "Invite investor"}</Button> : !data.hasEmail ? <p className="text-muted-foreground">Add the investor's email first.</p> : null}
      </>}
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

/** One-click invite: creates the investor's personal link if needed, then emails it. Uses the same authorized link engine. */
export function InviteInvestorButton({ onboardingId }: { onboardingId: string }) {
  const load = useServerFn(getPersonalInvestmentLink), create = useServerFn(createPersonalInvestmentLink), send = useServerFn(sendPersonalInvestmentLink), qc = useQueryClient();
  const key = ["personal-investment-link", onboardingId];
  const { data } = useQuery({ queryKey: key, queryFn: () => load({ data: { onboardingId } }) });
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  if (data.link?.state === "claimed") return <p className="text-sm text-muted-foreground">Invite accepted. No new invite is needed.</p>;
  if (!data.hasEmail) return <p className="text-sm text-muted-foreground">Add the investor's email to send an invite.</p>;
  if (!data.link && !data.canCreate) return null;
  return <div className="space-y-1">
    <Button size="lg" className="w-full justify-start text-base sm:w-auto" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        if (!data.link) await create({ data: { onboardingId } });
        await send({ data: { onboardingId } });
        toast.success("Invite sent to the investor");
        qc.invalidateQueries({ queryKey: key });
      } catch (e) { toast.error((e as Error).message); }
      finally { setBusy(false); }
    }}>{busy ? "Sending…" : data.link?.lastSentAt ? "Resend invite" : "Invite investor"}</Button>
    {data.link?.lastSentAt ? <p className="text-xs text-muted-foreground">Last invited {new Date(data.link.lastSentAt).toLocaleDateString()}</p> : null}
  </div>;
}

/** Menu item for roster rows: creates the personal link if needed and emails the invite. Server checks authorization. */
export function InviteInvestorMenuItem({ onboardingId, label = "Invite investor" }: { onboardingId: string; label?: string }) {
  const create = useServerFn(createPersonalInvestmentLink), send = useServerFn(sendPersonalInvestmentLink), load = useServerFn(getPersonalInvestmentLink), qc = useQueryClient();
  return <DropdownMenuItem onClick={async () => {
    try {
      const cur = await load({ data: { onboardingId } });
      if (cur.link?.state === "claimed") { toast.message("This investor already accepted their invite."); return; }
      if (!cur.link) await create({ data: { onboardingId } });
      await send({ data: { onboardingId } });
      toast.success("Invite sent to the investor");
      qc.invalidateQueries({ queryKey: ["personal-investment-link", onboardingId] });
    } catch (e) { toast.error((e as Error).message); }
  }}>{label}</DropdownMenuItem>;
}
