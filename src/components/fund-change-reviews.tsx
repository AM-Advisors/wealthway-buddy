import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getFundChanges } from "@/lib/fund-changes.functions";
import { FeesSection } from "@/components/fund-tabs/team-tab";
import { SideLetterRegistry } from "@/components/side-letter-registry";
import { Button } from "@/components/ui/button";

export function FundChangeReviews({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundChanges);
  const q = useQuery({ queryKey: ["fund-changes", fundId], queryFn: () => load({ data: { fundId } }) });
  if (q.error) return <p className="text-sm text-destructive">{q.error.message}</p>;
  const rows = q.data?.pending ?? [];
  return <div className="space-y-4">
    {rows.some(r => r.kind === "fees") && <FeesSection fundId={fundId} />}
    {rows.some(r => r.kind === "side_letter") && <SideLetterRegistry fundId={fundId} />}
    {rows.some(r => r.kind === "locked_edit") && <section className="space-y-2 border-y py-3"><h3 className="text-sm font-semibold">Saved fund changes awaiting Harmonious approval</h3><p className="text-sm text-muted-foreground">{rows.filter(r => r.kind === "locked_edit").length} pending</p>{q.data?.staff && <Button variant="outline" size="sm" asChild><Link to="/ops/locked-edits">Review saved changes</Link></Button>}</section>}
  </div>;
}