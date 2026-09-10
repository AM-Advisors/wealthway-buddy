import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FundConditionsPanel } from "@/components/fund-conditions-panel";
import { HoldBanner } from "@/components/hold-banner";
import { ResponsibilityMatrix } from "@/components/responsibility-matrix";
import { RequestServiceCard, statusLabel, statusTone } from "@/components/service-gate";
import { getFundScope, SERVICE_CATEGORIES } from "@/lib/contracts.functions";
import { getResponsibilities, setResponsibilityStatus } from "@/lib/responsibilities.functions";

const RESPONSIBILITY_STATUSES = [
  { value: "outstanding", label: "Outstanding" },
  { value: "in_progress", label: "In progress" },
  { value: "provided", label: "Provided" },
  { value: "not_applicable", label: "Not applicable" },
];

/** Scope, conditions, client to-do list and any holds for one fund. */
export function FundAgreementCard({ offeringId }: { offeringId: string }) {
  const loadScope = useServerFn(getFundScope);
  const loadResponsibilities = useServerFn(getResponsibilities);
  const save = useServerFn(setResponsibilityStatus);
  const queryClient = useQueryClient();

  const scope = useQuery({
    queryKey: ["fund-scope", offeringId],
    queryFn: () => loadScope({ data: { offeringId } }),
    retry: false,
  });
  const responsibilities = useQuery({
    queryKey: ["fund-responsibilities", offeringId],
    queryFn: () => loadResponsibilities({ data: { offeringId } }),
    retry: false,
  });

  const update = useMutation({
    mutationFn: (vars: { templateKey: string; status: string }) =>
      save({ data: { offeringId, templateKey: vars.templateKey, status: vars.status } as any }),
    onSuccess: () => {
      toast.success("Updated.");
      queryClient.invalidateQueries({ queryKey: ["fund-responsibilities", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  if (scope.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your scope…</p>;
  }
  if (scope.isError || !scope.data) return null;

  const holds = scope.data.holds ?? [];
  const services = scope.data.services ?? [];
  const included = services.filter((s: any) => s.status === "included");
  const outOfScope = services.filter(
    (s: any) => s.status === "not_included" || s.status === "requested" || s.status === "optional",
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Your agreement and scope</CardTitle>
            <CardDescription>
              {scope.data.client
                ? `${scope.data.client.name} · services under the current statement of work.`
                : "No client engagement recorded for this fund yet."}
            </CardDescription>
          </div>
          {scope.data.configured ? (
            <Badge variant="secondary">
              {included.length} service{included.length === 1 ? "" : "s"} in scope
            </Badge>
          ) : (
            <Badge variant="outline">Scope not recorded</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <HoldBanner holds={holds} />

        <Tabs defaultValue="scope">
          <TabsList>
            <TabsTrigger value="scope">What's included</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="yours">Your responsibilities</TabsTrigger>
          </TabsList>

          <TabsContent value="scope" className="space-y-3 pt-4">
            {!scope.data.configured ? (
              <p className="text-sm text-muted-foreground">
                No statement of work has been recorded for this fund yet, so nothing here is
                presented as included or excluded. Your Harmonious contact can set it up.
              </p>
            ) : (
              <>
                {SERVICE_CATEGORIES.map((category) => {
                  const rows = included.filter((s: any) => s.category === category.key);
                  if (!rows.length) return null;
                  return (
                    <div key={category.key} className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {category.label}
                      </p>
                      {rows.map((service: any) => (
                        <ResponsibilityMatrix key={service.key} service={service} />
                      ))}
                    </div>
                  );
                })}
                {outOfScope.length ? (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Available to add
                    </p>
                    {outOfScope.map((service: any) => (
                      <RequestServiceCard
                        key={service.key}
                        service={service}
                        clientId={scope.data.client?.id ?? null}
                        offeringId={offeringId}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </TabsContent>

          <TabsContent value="conditions" className="space-y-2 pt-4">
            <FundConditionsPanel offeringId={offeringId} />
          </TabsContent>

          <TabsContent value="yours" className="space-y-2 pt-4">
            {responsibilities.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : responsibilities.data ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {responsibilities.data.outstanding} item
                  {responsibilities.data.outstanding === 1 ? "" : "s"} still with you.
                </p>
                {responsibilities.data.items.map((item: any) => (
                  <div key={item.key} className="flex flex-wrap items-start gap-2 rounded-md border p-3">
                    <div className="min-w-64">
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.detail ? (
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      ) : null}
                      {item.leadTimeNote ? (
                        <p className="mt-1 text-xs">{item.leadTimeNote}</p>
                      ) : null}
                    </div>
                    <div className="ml-auto w-44">
                      <Select
                        value={item.status}
                        onValueChange={(status) =>
                          update.mutate({ templateKey: item.key, status })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RESPONSIBILITY_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Your list isn't available.</p>
            )}
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          Harmonious provides administrative, technology, onboarding, reporting, payment-facilitation
          and recordkeeping support. It does not act as investment adviser, broker-dealer, custodian,
          transfer agent, escrow agent, trustee, fund manager, fiduciary, valuation agent, auditor,
          accountant, tax preparer or legal counsel unless a statement of work says so.
        </p>
      </CardContent>
    </Card>
  );
}

export { statusLabel, statusTone };
