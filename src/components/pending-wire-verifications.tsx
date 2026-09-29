import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { pendingWireVerificationsFn } from "@/lib/fund-setup-canonical.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PendingWireVerifications() {
  const load = useServerFn(pendingWireVerificationsFn);
  const q = useQuery({ queryKey: ["pending-wire-verifications"], queryFn: () => load() });
  if (q.isLoading || q.error) return null;
  const rows = q.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verify Existing Wire Instructions</CardTitle>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? "Nothing waiting." : `${rows.length} fund${rows.length === 1 ? "" : "s"} waiting. Investors don't receive these until a second Harmonious team member verifies them.`}
        </p>
      </CardHeader>
      {rows.length > 0 && (
        <CardContent className="space-y-2">
          {rows.map((r) => (
            <Link key={r.offeringId} to="/admin/fund/$fundId" params={{ fundId: r.offeringId }} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm hover:bg-muted/50">
              <span className="min-w-0 break-words">{r.fundName} · version {r.version}</span>
              <span className="flex gap-1">
                {r.ownershipReview === "review_required" && <Badge variant="destructive">Ownership review</Badge>}
                <Badge variant="outline">{r.hasDocument ? "Document attached" : "No document"}</Badge>
              </span>
            </Link>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
