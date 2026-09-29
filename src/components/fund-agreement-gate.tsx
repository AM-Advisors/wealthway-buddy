import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getFundAgreement } from "@/lib/fund-sow.functions";
import { getFundAgreementNotice } from "@/lib/commercial-agreements.functions";
import { CommercialAgreementCard } from "@/components/commercial-agreement-card";
import { ServicesPricingCard } from "@/components/services-pricing-card";

/**
 * Harmonious commercial agreement for a fund. Never blocks the fund: staff see
 * the agreement status as a follow-up item; clients see a quiet notice only.
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
  if (data.canSee) {
    return (
      <div className="space-y-2">
        <ServicesPricingCard fundId={fundId} />
        <CommercialAgreementCard offeringId={fundId} />
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/pricing">Open agreements</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ServicesPricingCard fundId={fundId} />
      <ClientAgreementNotice fundId={fundId} />
    </div>
  );
}

export function ClientAgreementNotice({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundAgreementNotice);
  const q = useQuery({ queryKey: ["fund-agreement-notice", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const notice = (q.data as any)?.notice as { title: string; body: string } | null | undefined;
  if (!notice) return null;
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="font-medium">{notice.title}</p>
      <p className="mt-1 text-muted-foreground">{notice.body}</p>
    </div>
  );
}
