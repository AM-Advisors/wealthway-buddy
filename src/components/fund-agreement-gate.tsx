import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFundAgreement } from "@/lib/fund-sow.functions";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Shows the signed statement of work behind a fund, or warns the Harmonious
 * team when a fund is running without one.
 */
export function FundAgreementGate({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundAgreement);
  const query = useQuery({
    queryKey: ["fund-agreement", fundId],
    queryFn: () => load({ data: { offeringId: fundId } }),
    retry: false,
  });

  const data = query.data as any;
  if (!data) return null;

  if (data.signed) {
    return (
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Statement of work</CardTitle>
            <Badge>Signed</Badge>
          </div>
          <CardDescription>
            {data.clientName ? `${data.clientName} · ` : ""}
            {data.sow.title} · {data.sow.sowType}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Signed by {data.sow.signedBy} on {formatDate(data.sow.signedOn)}. This agreement sets the
          services, fees and terms Harmonious provides for this fund.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Statement of work not signed</CardTitle>
          <Badge variant="destructive">Action needed</Badge>
        </div>
        <CardDescription>
          {data.sow
            ? `${data.sow.title} is recorded as ${data.sow.status} and has no recorded client signature.`
            : "No statement of work is attached to this fund."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Harmonious only performs services covered by a signed statement of work. Attach and sign
          the agreement before running this fund's onboarding, documents, banking or payments.
        </p>
        {data.canSee ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/pricing">Open agreements</Link>
          </Button>
        ) : (
          <p>Your Harmonious contact will confirm the agreement before this fund goes ahead.</p>
        )}
      </CardContent>
    </Card>
  );
}
