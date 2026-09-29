import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { phase3OverviewFn } from "@/lib/fund-setup-canonical.functions";
import { BANK_VERSION_STATUS_LABELS } from "@/lib/fund-setup-phase3";

const PATH_LABELS: Record<string, string> = {
  harmonious: "Harmonious is setting up the account",
  client_provided: "Account provided by the fund",
  not_required: "Not required",
};

/**
 * Fund Manager view of banking: a masked, read-only summary of the current
 * canonical banking version. Managers cannot enter or verify bank details.
 */
export function ManagerBankingSummary({ fundId }: { fundId: string }) {
  const load = useServerFn(phase3OverviewFn);
  const q = useQuery({
    queryKey: ["phase3", fundId],
    queryFn: () => load({ data: { offeringId: fundId } }),
    retry: false,
  });
  const banking = q.data?.banking;
  const cur = banking?.versions?.[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bank account</CardTitle>
        <CardDescription>
          Harmonious enters and verifies bank details. Contact your Harmonious team to change them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {q.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : q.error ? (
          <p className="text-muted-foreground">Banking details aren&apos;t available to you.</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Banking setup</dt>
            <dd>{banking?.path ? PATH_LABELS[banking.path] ?? banking.path : "Not chosen yet"}</dd>
            <dt className="text-muted-foreground">Bank name</dt>
            <dd className="break-words">{cur?.bankName || "—"}</dd>
            <dt className="text-muted-foreground">Account name</dt>
            <dd className="break-words">{cur?.accountName || "—"}</dd>
            <dt className="text-muted-foreground">Account number</dt>
            <dd>{cur?.accountMasked ? cur.accountMasked.replace("••••", "•••• ") : "—"}</dd>
            <dt className="text-muted-foreground">Verification</dt>
            <dd>
              {cur ? (
                <Badge variant={cur.status === "verified" ? "secondary" : cur.status === "rejected" ? "destructive" : "outline"}>
                  {cur.status === "rejected" ? "Needs Correction" : BANK_VERSION_STATUS_LABELS[cur.status]}
                </Badge>
              ) : (
                "No details yet"
              )}
            </dd>
            <dt className="text-muted-foreground">Funding instructions</dt>
            <dd>{banking?.releasable ? "Released to investors after signing" : "Not released to investors"}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
