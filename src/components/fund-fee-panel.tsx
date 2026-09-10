import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFundFeeRates, setFundFeeSource } from "@/lib/fund-fees.functions";

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function sourceText(source: string) {
  if (source === "client_rate") return "Client agreed rate";
  if (source === "standard") return "Standard rate card";
  return "Set just for this fund";
}

/** Shows where a fund's wire fee and closing cost come from and lets contract
 *  authority point them at the client's agreed rates or the standard card. */
export function FundFeePanel({ offeringId }: { offeringId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getFundFeeRates);
  const save = useServerFn(setFundFeeSource);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-fee-rates", offeringId],
    queryFn: () => load({ data: { offeringId } }),
    retry: false,
  });

  const mut = useMutation({
    mutationFn: (vars: any) => save({ data: vars }),
    onSuccess: () => {
      toast.success("Fee updated.");
      queryClient.invalidateQueries({ queryKey: ["fund-fee-rates", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["offerings"] });
      queryClient.invalidateQueries({ queryKey: ["fund-fee-sources"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading fees…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as any).message}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {data.clientName
          ? `Rates on file for ${data.clientName}.`
          : "This fund isn't linked to a client, so only the standard rate card applies."}
      </p>

      {data.kinds.map((kind) => {
        const agreed = kind.clientRate?.cents ?? null;
        const off = agreed !== null && agreed !== kind.current.cents;
        return (
          <div key={kind.key} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{kind.label}</p>
                <p className="text-sm text-muted-foreground">
                  {money(kind.current.cents)} · {sourceText(kind.current.source)}
                  {kind.current.reason ? ` — ${kind.current.reason}` : ""}
                </p>
              </div>
              {off ? <Badge variant="destructive">Differs from agreed rate</Badge> : null}
            </div>

            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div>
                Client agreed rate: <strong>{money(kind.clientRate?.cents ?? null)}</strong>
                {kind.clientRate ? ` (${kind.clientRate.label})` : ""}
              </div>
              <div>
                Standard rate card: <strong>{money(kind.standardRate?.cents ?? null)}</strong>
                {kind.standardRate ? ` (${kind.standardRate.label})` : ""}
              </div>
            </div>

            {data.canManage ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.isPending || kind.clientRate?.cents == null}
                    onClick={() =>
                      mut.mutate({ offeringId, kind: kind.key, source: "client_rate" })
                    }
                  >
                    Use client agreed rate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.isPending || kind.standardRate?.cents == null}
                    onClick={() => mut.mutate({ offeringId, kind: kind.key, source: "standard" })}
                  >
                    Use standard rate card
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-[140px_1fr_auto] md:items-end">
                  <div>
                    <Label className="text-xs">Rate for this fund ($)</Label>
                    <Input
                      inputMode="decimal"
                      value={amounts[kind.key] ?? String(kind.current.cents / 100)}
                      onChange={(e) =>
                        setAmounts({ ...amounts, [kind.key]: e.target.value.replace(/[^0-9.]/g, "") })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Why this fund is different</Label>
                    <Input
                      value={reasons[kind.key] ?? kind.current.reason ?? ""}
                      onChange={(e) => setReasons({ ...reasons, [kind.key]: e.target.value })}
                      placeholder="Agreed in the signed statement of work"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={mut.isPending}
                    onClick={() =>
                      mut.mutate({
                        offeringId,
                        kind: kind.key,
                        source: "custom",
                        cents: Math.round(
                          Number(amounts[kind.key] ?? kind.current.cents / 100) * 100,
                        ),
                        reason: reasons[kind.key] ?? kind.current.reason ?? "",
                      })
                    }
                  >
                    Save one-off rate
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Changing where a fee comes from needs legal, compliance, finance, client success or
                admin authority.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
