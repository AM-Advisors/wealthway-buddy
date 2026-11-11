import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createFundFromRequest, listStaffFundDrafts, listUnlinkedFundRequests } from "@/lib/client-fund-request.functions";

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

/** Sent requests that never became a fund: one click creates the fund with every answer in Setup. */
export function OpsUnlinkedFundRequests() {
  const load = useServerFn(listUnlinkedFundRequests);
  const create = useServerFn(createFundFromRequest);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["ops-unlinked-fund-requests"], queryFn: () => load(), retry: false });
  const m = useMutation({
    mutationFn: (intakeId: string) => create({ data: { intakeId } }),
    onSuccess: (res: any) => {
      void qc.invalidateQueries({ queryKey: ["ops-unlinked-fund-requests"] });
      toast.success(res.issues?.length ? `Fund created. ${res.issues.length} item${res.issues.length === 1 ? "" : "s"} to enter by hand are in the Work queue.` : "Fund created with every request answer in Setup.");
      void navigate({ to: "/ops/fund/$fundId", params: { fundId: res.offeringId }, search: { tab: "setup" } as any });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the fund."),
  });
  if (q.isPending || q.isError || !q.data.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sent requests without a fund</CardTitle>
        <CardDescription>These requests were sent but no fund was created, so their answers are not in Setup yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.data.map((r: { id: string; clientName: string; fundName: string; possibleDuplicate: boolean; submittedAt: string }) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{r.fundName} {r.possibleDuplicate && <Badge variant="outline" className="ml-1">Name may match an existing fund</Badge>}</p>
              <p className="text-xs text-muted-foreground">{r.clientName} · sent {format(parseISO(r.submittedAt), "MMM d, yyyy")}</p>
            </div>
            <Button size="sm" disabled={m.isPending} onClick={() => { if (window.confirm(`Create "${r.fundName}" for ${r.clientName} and copy every answer into its Setup? Nothing is approved or sent.`)) m.mutate(r.id); }}>
              {m.isPending && m.variables === r.id ? "Creating…" : "Create fund"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
