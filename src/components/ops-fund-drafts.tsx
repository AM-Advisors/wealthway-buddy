import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listStaffFundDrafts } from "@/lib/client-fund-request.functions";

/** Operations view of Add Fund or SPV drafts that clients or staff have started but not sent. */
export function OpsFundDrafts() {
  const load = useServerFn(listStaffFundDrafts);
  const q = useQuery({ queryKey: ["ops-fund-drafts"], queryFn: () => load(), retry: false });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft funds</CardTitle>
        <CardDescription>Funds and SPVs started in Add Fund or SPV but not yet sent to Harmonious.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isPending ? <p className="text-sm text-muted-foreground">Loading…</p>
          : q.isError ? (
            <div className="flex items-center gap-3 text-sm text-destructive">Draft funds could not be loaded.<Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button></div>
          ) : !q.data.length ? <p className="text-sm text-muted-foreground">No draft funds right now.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-2 pr-3">Fund</th><th className="pr-3">Client</th><th className="pr-3">Started by</th><th className="pr-3">Last saved</th><th /></tr>
                </thead>
                <tbody>
                  {q.data.map((d: { id: string; clientId: string; clientName: string; fundName: string; kind: string; startedBy: string; updatedAt: string }) => (
                    <tr key={d.id} className="border-t">
                      <td className="py-2 pr-3 font-medium">{d.fundName} {d.kind ? <Badge variant="secondary" className="ml-1 uppercase">{d.kind}</Badge> : null}</td>
                      <td className="pr-3">{d.clientName}</td>
                      <td className="pr-3">{d.startedBy}</td>
                      <td className="pr-3 whitespace-nowrap">{format(parseISO(d.updatedAt), "MMM d, h:mm a")}</td>
                      <td className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to="/ops/fund-setup/new" search={{ clientId: d.clientId, draft: d.id }}>Open</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
