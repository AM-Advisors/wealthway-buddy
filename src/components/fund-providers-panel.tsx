import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listProviders } from "@/lib/contracts.functions";
import { type FundScope, type FundSection } from "@/lib/fund-scope";

/**
 * Which parts of a fund each kind of third-party provider supports. Anything not
 * listed here is treated as general platform support for the whole fund.
 */
const PROVIDER_TYPE_SECTIONS: Record<string, FundSection[]> = {
  bank: ["banking", "wires", "funding", "distributions"],
  banking: ["banking", "wires", "funding", "distributions"],
  payments: ["wires", "funding", "distributions"],
  screening: ["identity", "screening"],
  identity: ["identity", "screening", "accreditation"],
  signing: ["documents", "signed_documents"],
  software: ["documents", "signed_documents"],
  tax: ["tax"],
  filings: ["filings"],
  government: ["filings"],
  registered_agent: ["filings"],
  "fund administration": ["capital_accounts", "reporting"],
  reporting: ["reporting"],
  storage: [],
  technology: [],
  infrastructure: [],
  other: [],
};

const readableType = (v: string) => v.replace(/_/g, " ");
const readableCategory = (v: string) => v.replace(/_/g, " ");

const contractTone = (v: string) =>
  v === "active" ? "outline" : v === "terminated" || v === "expired" ? "destructive" : "secondary";

const statusTone = (v: string) =>
  v === "operational" ? "outline" : v === "retired" ? "secondary" : "destructive";

/**
 * The third-party providers this fund depends on, tied back to the services in the
 * client's statement of work. Harmonious coordinates these providers; it does not
 * take on their role.
 */
export function FundProvidersPanel({ scope }: { scope: FundScope }) {
  const load = useServerFn(listProviders);
  const { data, isLoading, error } = useQuery({
    queryKey: ["third-party-providers"],
    queryFn: () => load(),
    retry: false,
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const providers = ((data as any)?.providers ?? []) as any[];
    return providers
      .filter((p) => !p.retired_at)
      .map((p) => {
        const sections = PROVIDER_TYPE_SECTIONS[String(p.provider_type)] ?? [];
        const services = sections
          .map((s) => scope.serviceFor(s))
          .filter(Boolean)
          .filter(
            (s, i, all) => all.findIndex((o) => o!.key === s!.key) === i,
          ) as { key: string; name: string; status: string }[];
        const inScope = services.some((s) => s.status === "included");
        return { provider: p, services, general: sections.length === 0, inScope };
      })
      .filter((r) => r.general || r.services.length === 0 || r.inScope || scope.isStaff);
  }, [data, scope]);

  if (error) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Third-party dependencies</CardTitle>
        <CardDescription>
          The outside providers this fund relies on, and what each one supports. Harmonious
          coordinates and keeps records of these providers; it does not act as the bank, transfer
          agent, custodian or filing authority.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading providers…</p> : null}
        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No providers are recorded yet.</p>
        ) : null}
        {rows.map(({ provider: p, services, general, inScope }) => (
          <div key={p.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <Badge variant="secondary">{readableType(String(p.provider_type))}</Badge>
                <Badge variant={contractTone(String(p.contract_status))}>
                  Contract: {readableType(String(p.contract_status))}
                </Badge>
                <Badge variant={statusTone(String(p.status))}>
                  {readableType(String(p.status))}
                </Badge>
              </div>
              {general ? (
                <Badge variant="outline">Platform-wide</Badge>
              ) : inScope ? (
                <Badge variant="outline">Supports services in scope</Badge>
              ) : (
                <Badge variant="destructive">Supports services outside scope</Badge>
              )}
            </div>

            {p.service_dependency ? (
              <p className="mt-1 text-sm text-muted-foreground">{p.service_dependency}</p>
            ) : null}

            {services.length > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Used for: {services.map((s) => s.name).join(", ")}
              </p>
            ) : null}

            <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="font-medium text-foreground">Data handled: </span>
                {(p.data_categories ?? []).length > 0
                  ? (p.data_categories as string[]).map(readableCategory).join(", ")
                  : "None recorded"}
              </div>
              <div>
                <span className="font-medium text-foreground">Service level: </span>
                {p.sla ? p.sla : "Not recorded"}
              </div>
            </div>

            {p.outage_note && p.status !== "operational" ? (
              <p className="mt-2 text-sm text-destructive">{p.outage_note}</p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
