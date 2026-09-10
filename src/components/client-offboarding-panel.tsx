import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exportClientData, getMyOffboarding } from "@/lib/offboarding.functions";

const STAGE: Record<string, string> = {
  open: "Notice received",
  winding_down: "Winding down",
  settlement: "Final settlement",
  data_delivered: "Data delivered",
  closed: "Closed",
};

function saveCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Read-only wind-down summary for a client contact. */
export function ClientOffboardingPanel() {
  const load = useServerFn(getMyOffboarding);
  const runExport = useServerFn(exportClientData);

  const { data } = useQuery({
    queryKey: ["my-offboarding"],
    queryFn: () => load(),
    retry: false,
  });

  const c = data?.case;

  const download = useMutation({
    mutationFn: () => runExport({ data: { clientId: c!.clientId } }),
    onSuccess: (result: any) => {
      const slug = String(result.clientName).toLowerCase().replace(/[^a-z0-9]+/g, "-");
      for (const file of result.files) saveCsv(`${slug}-${file.name}`, file.content);
      toast.success("Your records have been downloaded.");
    },
    onError: (e: any) => toast.error(e?.message ?? "That download isn't available right now."),
  });

  if (!c) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Winding down</CardTitle>
          <Badge variant={c.status === "closed" ? "secondary" : "default"}>
            {STAGE[c.status] ?? c.status}
          </Badge>
        </div>
        <CardDescription>
          {c.sowTitle
            ? `Covering ${c.sowTitle}.`
            : "Covering your whole engagement with Harmonious."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Notice received</p>
            <p className="font-medium">{c.noticeReceivedOn ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Services end</p>
            <p className="font-medium">{c.effectiveEndDate ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Days remaining</p>
            <p className="font-medium">
              {c.status === "closed" || c.daysRemaining === null
                ? "—"
                : c.daysRemaining >= 0
                  ? c.daysRemaining
                  : "Period ended"}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {c.openAmounts === 0
            ? "No amounts are currently marked outstanding."
            : `${c.openAmounts} amount${c.openAmounts === 1 ? "" : "s"} still to settle, totalling ${(
                c.openAmountCents / 100
              ).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`}
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium">Your records</p>
          <p className="text-sm text-muted-foreground">
            {c.exportDelivered
              ? `Your export was delivered on ${c.exportDeliveredOn}.`
              : "Your export has not been delivered yet. You can download a copy at any time."}
          </p>
          <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate()}>
            Download my records
          </Button>
        </div>

        {c.retention.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Records Harmonious keeps</p>
            <p className="text-sm text-muted-foreground">
              Some records are kept after the engagement ends for legal, regulatory, audit or claims
              reasons.
            </p>
            <ul className="space-y-1 text-sm">
              {c.retention.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span>{r.label}</span>
                  <Badge variant="outline">{r.category}</Badge>
                  {r.retainUntil ? (
                    <span className="text-muted-foreground">until {r.retainUntil}</span>
                  ) : null}
                  {r.legalHold ? <Badge variant="secondary">On hold</Badge> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
