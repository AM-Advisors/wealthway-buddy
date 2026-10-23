import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FundPaymentDialog } from "@/components/fund-payment-checkout";
import { listSideLetterNeedsFn, sideLetterDocumentUrlFn } from "@/lib/side-letter-fee.functions";
import { usdWhole } from "@/lib/side-letter-fee";

/** Fund manager: investors below the minimum, pay the side-letter fee, then download the generated side letter. */
export function SideLetterNeeds({ offeringId }: { offeringId: string }) {
  const load = useServerFn(listSideLetterNeedsFn);
  const openDoc = useServerFn(sideLetterDocumentUrlFn);
  const qc = useQueryClient();
  const [paying, setPaying] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["side-letter-needs", offeringId], queryFn: () => load({ data: { offeringId } }) });
  if (!q.data?.investors.length) return null;
  const { minimumCents, feeCents } = q.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Side letters needed</CardTitle>
        <CardDescription>These investors committed less than the {usdWhole(minimumCents)} minimum. A side letter costs {usdWhole(feeCents)}; it is generated as soon as your payment is confirmed.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {q.data.investors.map((i) => (
            <li key={i.onboardingId} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm font-medium">{i.name}</p>
                <p className="text-xs text-muted-foreground">Commitment {usdWhole(i.commitmentCents)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {i.sideLetter ? (
                  <>
                    <Badge variant="secondary">{i.sideLetter.status === "active" ? "Side letter active" : "Side letter generated: awaiting approval"}</Badge>
                    {i.sideLetter.hasDocument ? (
                      <Button size="sm" variant="outline" onClick={async () => {
                        try { const r = await openDoc({ data: { sideLetterId: i.sideLetter!.id } }); window.open(r.url, "_blank", "noopener"); }
                        catch (e) { toast.error((e as Error).message); }
                      }}>Download side letter</Button>
                    ) : null}
                  </>
                ) : (
                  <Button size="sm" onClick={() => setPaying(i.onboardingId)}>Pay {usdWhole(feeCents)} &amp; generate side letter</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      {paying ? (
        <FundPaymentDialog
          open
          cardOnly
          description={`Side letter fee: ${usdWhole(feeCents)}. The side letter is generated once payment is confirmed.`}
          onOpenChange={(v) => { if (!v) setPaying(null); }}
          target={{ kind: "side_letter", onboardingId: paying }}
          onPaid={() => {
            setPaying(null);
            toast.success("Payment confirmed, your side letter has been generated.");
            qc.invalidateQueries({ queryKey: ["side-letter-needs", offeringId] });
          }}
        />
      ) : null}
    </Card>
  );
}
