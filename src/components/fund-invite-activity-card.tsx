import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fundInviteActivityFn } from "@/lib/fund-invite-activity.functions";
import { INVITE_LEVEL_LABEL, INVITE_LEVEL_ORDER, type InviteLevel } from "@/lib/fund-invite-activity-model";
import { useInvestorRecordRoute } from "@/lib/use-investor-record-route";
import { fmtDate } from "@/components/fund-tabs/shared";

const TONE: Record<InviteLevel, "default" | "secondary" | "outline" | "destructive"> = {
  not_invited: "outline", invited: "outline", opened: "secondary", started: "secondary", verified: "default",
};

/** Fund managers and staff: who was invited, who clicked, who started, and who needs a nudge. */
export function FundInviteActivityCard({ fundId }: { fundId: string }) {
  const load = useServerFn(fundInviteActivityFn);
  const recordTo = useInvestorRecordRoute();
  const q = useQuery({ queryKey: ["fund-invite-activity", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const d: any = q.data;
  if (!d) return null;
  const rows: any[] = d.rows ?? [];
  const linkOnly: any[] = d.linkOnly ?? [];
  if (!rows.length && !linkOnly.length && !d.anonymousOpens) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Invitations and activity</CardTitle>
        <CardDescription className="text-base">
          Everyone you've invited or who has clicked a link for this fund, and how far they've got. People who need a nudge are listed first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {d.followUps > 0 && <Badge variant="destructive" className="text-sm">{d.followUps} need a follow-up</Badge>}
          {INVITE_LEVEL_ORDER.map((l) => d.counts[l] > 0 && (
            <Badge key={l} variant={TONE[l]} className="text-sm">{d.counts[l]} {INVITE_LEVEL_LABEL[l].toLowerCase()}</Badge>
          ))}
        </div>
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-2">Investor</th><th>Status</th><th>Invited</th><th>Last click or activity</th><th>Follow-up</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.onboardingId} className="border-t">
                    <td className="py-2">
                      <Link to={recordTo} params={{ fundId, onboardingId: r.onboardingId }} className="font-medium text-primary hover:underline">{r.name}</Link>
                      {r.investingAs && <p className="text-xs text-muted-foreground">{r.investingAs}</p>}
                    </td>
                    <td><Badge variant={TONE[r.level as InviteLevel]}>{INVITE_LEVEL_LABEL[r.level as InviteLevel]}</Badge></td>
                    <td className="whitespace-nowrap">{r.lastInvitedAt ? fmtDate(r.lastInvitedAt) : <span className="text-muted-foreground">Not yet</span>}</td>
                    <td className="whitespace-nowrap">{r.lastTouchAt ? fmtDate(r.lastTouchAt) : <span className="text-muted-foreground">Nothing yet</span>}</td>
                    <td className={r.followUp ? "text-destructive" : "text-muted-foreground"}>{r.followUpReason ?? "On track"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(linkOnly.length > 0 || d.anonymousOpens > 0) && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="font-medium">Used the fund's verification link but not on your investor list yet</p>
            {linkOnly.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{p.name}</span>
                <span className="text-muted-foreground">{p.label} · {fmtDate(p.lastActivity)}</span>
              </div>
            ))}
            {d.anonymousOpens > 0 && (
              <p className="text-sm text-muted-foreground">
                {d.anonymousOpens} more {d.anonymousOpens === 1 ? "person" : "people"} opened the link in the last {d.anonymousWindowDays} days without giving a name yet. Their name shows here once they start.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Harmonious adds them to your list once they've given their name.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
