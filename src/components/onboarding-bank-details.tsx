import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { onboardingDetailFn } from "@/lib/investor-onboarding.functions";
import { getFunding } from "@/lib/funding.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Read-only bank details for the investor's own onboarding page. Shows the
 * same wire instructions the Funding step already shows this investor (the
 * server function only returns them to the investing user), so they can see
 * where to send money without waiting for the funding step to open.
 */
export function OnboardingBankDetails({ onboardingId }: { onboardingId: string }) {
  const detailFn = useServerFn(onboardingDetailFn);
  const fundingFn = useServerFn(getFunding);

  const { data: detail } = useQuery({
    queryKey: ["onboarding", onboardingId],
    queryFn: () => detailFn({ data: { onboardingId } }),
  });
  const offeringId = (detail as any)?.offering?.id as string | undefined;

  const { data: funding, isLoading } = useQuery({
    queryKey: ["funding", offeringId ?? "none"],
    queryFn: () => fundingFn({ data: { offering_id: offeringId } }),
    enabled: Boolean(offeringId),
  });

  const instructions = ((funding as any)?.offering?.wire_instructions ?? {}) as Record<string, string>;
  const entries = Object.entries(instructions).filter(([, v]) => v);

  const copyAll = async () => {
    const lines = entries.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Bank details copied");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bank details</CardTitle>
        <CardDescription>
          Where to send your investment for {(detail as any)?.offering?.name ?? "this fund"}. These are the
          fund's official wire instructions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading && <p className="text-muted-foreground">Loading…</p>}

        {!isLoading && entries.length === 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
            This fund has not published its bank details yet. They will appear here as soon as the fund team
            adds them - please check back before sending any money.
          </p>
        )}

        {entries.length > 0 && (
          <>
            <dl className="grid gap-x-8 gap-y-2 rounded-md border p-4 sm:grid-cols-2">
              {entries.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted-foreground">{k.replace(/_/g, " ")}:</dt>
                  <dd className="break-words font-medium">{String(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              These details come from Harmonious. Never act on bank details sent to you by email, and call the
              fund to verify by phone before sending money if anything changes.
            </p>
            <Button variant="outline" size="sm" onClick={copyAll}>
              Copy bank details
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
