import { ClientContactsPanel, ClientContractsPanel } from "@/components/client-contracts";
import { useMemo } from "react";

import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { DriveStatusCard } from "@/components/drive-status-card";
import { DriveInvestorCard } from "@/components/drive-investor-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getOpsClientRecord,
  getOpsClientTab,
  getOpsCompanyRecord,
  getOpsCompanyTab,
  getOpsFundRecord,
  getOpsFundTab,
  getOpsInvestorRecord,
  getOpsInvestorTab,
  listOpsRecords,
} from "@/lib/ops-records.functions";
import { allowedActions, recordPath, recordTabs, RECORD_AREA, type OpsRecordType } from "@/lib/ops-records";
import type { OpsCapability } from "@/lib/ops-capabilities";

const LABELS: Record<OpsRecordType, { title: string; plural: string }> = {
  client: { title: "Client", plural: "Clients" },
  fund: { title: "Fund / SPV", plural: "Funds & SPVs" },
  investor: { title: "Investor", plural: "Investors" },
  company: { title: "Company", plural: "Companies" },
};

const RECORD_FN = {
  client: getOpsClientRecord,
  fund: getOpsFundRecord,
  investor: getOpsInvestorRecord,
  company: getOpsCompanyRecord,
} as const;

const TAB_FN = {
  client: getOpsClientTab,
  fund: getOpsFundTab,
  investor: getOpsInvestorTab,
  company: getOpsCompanyTab,
} as const;

function money(cents?: number | null) {
  if (cents === null || cents === undefined) return "—";
  return (Number(cents) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function when(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function humanise(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function cell(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (/cents$/i.test(key) || /Cents$/.test(key)) return money(Number(value));
  if (/(_at|_on|date|At|Date)$/.test(key)) return when(String(value));
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "—";
  return String(value);
}

const HIDDEN_COLUMNS = /^(id|.*_id|.*Id)$/;

function Table({ title, rows }: { title: string; rows: any[] }) {
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows.slice(0, 20)) for (const key of Object.keys(row ?? {})) keys.add(key);
    return [...keys].filter((key) => !HIDDEN_COLUMNS.test(key));
  }, [rows]);

  if (!rows.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>Nothing recorded yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {rows.length} {rows.length === 1 ? "record" : "records"}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {columns.map((key) => (
                <th key={key} className="px-4 py-2 font-medium">
                  {humanise(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row?.id ?? index} className="border-t">
                {columns.map((key) => (
                  <td key={key} className="px-4 py-2">
                    {linkedCell(row, key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Relationships are clickable; the destination re-checks authority itself. */
function linkedCell(row: any, key: string) {
  const text = cell(key, row[key]);
  const link =
    key === "fundName" && row.offering_id
      ? recordPath("fund", row.offering_id)
      : key === "name" && row.stakeholder_id
        ? null
        : key === "person" && row.investorUserId
          ? recordPath("investor", row.investorUserId)
          : null;
  if (!link || text === "—") return text;
  return (
    <Link to={link as any} className="text-primary underline-offset-2 hover:underline">
      {text}
    </Link>
  );
}

function Summary({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function summaryFor(type: OpsRecordType, record: any): { label: string; value: string }[] {
  if (type === "client") {
    return [
      { label: "Status", value: record.status ?? "—" },
      { label: "Primary contact", value: record.contact ?? "—" },
      { label: "Entities", value: String(record.entityCount) },
      { label: "Funds & SPVs", value: String(record.fundCount) },
      { label: "Companies", value: String(record.companyCount) },
      { label: "Client since", value: when(record.since) },
    ];
  }
  if (type === "fund") {
    return [
      { label: "Stage", value: record.stage ?? record.status ?? "—" },
      { label: "Launch", value: record.launchState ?? "—" },
      { label: "Regulation", value: record.regType ?? "—" },
      { label: "Strategy", value: record.strategy ?? record.fundType ?? "—" },
      { label: "Accepted commitments", value: money(record.acceptedCents) },
      { label: "Funded capital", value: money(record.fundedCents) },
      { label: "Investors", value: String(record.investorCount) },
      { label: "Domicile", value: record.domicile ?? "—" },
    ];
  }
  if (type === "investor") {
    return [
      { label: "Investor type", value: record.investorType ?? "—" },
      { label: "Investment profiles", value: String(record.profileCount) },
      { label: "Active investments", value: String(record.investmentCount) },
      { label: "Accepted", value: money(record.acceptedCents) },
      { label: "Funded", value: money(record.fundedCents) },
      { label: "Open onboardings", value: String(record.openOnboardings) },
    ];
  }
  return [
    { label: "Entity type", value: record.entityType ?? "—" },
    { label: "Jurisdiction", value: record.jurisdiction ?? "—" },
    { label: "Incorporated", value: when(record.incorporated) },
    { label: "Authorized shares", value: record.authorizedShares?.toLocaleString?.() ?? "—" },
    { label: "Stakeholders", value: String(record.stakeholderCount) },
    { label: "Outstanding securities", value: Number(record.outstandingQuantity ?? 0).toLocaleString() },
  ];
}

function TabBody({ type, id, tab }: { type: OpsRecordType; id: string; tab: string }) {
  const load = useServerFn(TAB_FN[type] as any);
  const query = useQuery({
    queryKey: ["ops-record-tab", type, id, tab],
    queryFn: () => (load as any)({ data: { id, tab } }),
  });

  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (query.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not available</CardTitle>
          <CardDescription>{(query.error as Error).message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const payload = (query.data ?? {}) as Record<string, any>;
  const sections = Object.entries(payload).filter(([, value]) => Array.isArray(value));
  const scalars = Object.entries(payload).filter(
    ([, value]) => value !== null && typeof value === "object" && !Array.isArray(value),
  );

  return (
    <div className="space-y-4">
      {scalars.map(([key, value]) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle className="text-base">{humanise(key)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Summary
              items={Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
                label: humanise(k),
                value: cell(k, v),
              }))}
            />
          </CardContent>
        </Card>
      ))}
      {sections.map(([key, value]) => (
        <Table key={key} title={humanise(key)} rows={value as any[]} />
      ))}
      {!sections.length && !scalars.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nothing to show</CardTitle>
            <CardDescription>No authoritative records exist for this tab yet.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}

export function OpsRecordPage({ type, id }: { type: OpsRecordType; id: string }) {
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const load = useServerFn(RECORD_FN[type] as any);
  const query = useQuery({
    queryKey: ["ops-record", type, id],
    queryFn: () => (load as any)({ data: { id } }),
  });

  if (query.isPending) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Not available</CardTitle>
            <CardDescription>{(query.error as Error).message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to={`/ops/${type === "fund" ? "funds" : `${type}s`}` as any}>
                Back to {LABELS[type].plural.toLowerCase()}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { record, capabilities } = query.data as { record: any; capabilities: OpsCapability[] };
  const tabs = recordTabs(type, capabilities);
  const active = tabs.find((t) => t.id === search.tab)?.id ?? tabs[0]?.id ?? "overview";
  const actions = allowedActions(RECORD_AREA[type], capabilities);

  return (
    <div className="space-y-6 p-6">
      <nav className="text-xs text-muted-foreground">
        <Link to="/ops" className="hover:underline">
          Operations
        </Link>
        {" / "}
        <Link to={`/ops/${type === "fund" ? "funds" : `${type}s`}` as any} className="hover:underline">
          {LABELS[type].plural}
        </Link>
        {" / "}
        <span className="text-foreground">{record.title}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{record.title}</h1>
          {record.status ? <Badge variant="secondary">{record.status}</Badge> : null}
          <span className="text-sm text-muted-foreground">{LABELS[type].title}</span>
        </div>
        {record.subtitle ? <p className="text-sm text-muted-foreground">{record.subtitle}</p> : null}
        {type === "fund" && record.clientId ? (
          <p className="text-sm">
            Client:{" "}
            <Link to={recordPath("client", record.clientId) as any} className="text-primary hover:underline">
              {record.clientName}
            </Link>
          </p>
        ) : null}
        {type === "company" && record.clientId ? (
          <p className="text-sm">
            Client:{" "}
            <Link to={recordPath("client", record.clientId) as any} className="text-primary hover:underline">
              View client
            </Link>
          </p>
        ) : null}
        <Summary items={summaryFor(type, record)} />
        {type === "fund" ? <DriveStatusCard offeringId={id} /> : null}
        {type === "investor" ? <DriveInvestorCard investorUserId={id} /> : null}
        <p className="text-xs text-muted-foreground">
          You may {Object.entries(actions).filter(([, ok]) => ok).map(([name]) => name).join(", ")} in this
          area. Every action is checked again by the backend.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            size="sm"
            variant={tab.id === active ? "default" : "ghost"}
            onClick={() => navigate({ to: ".", search: { tab: tab.id } as any })}
          >
            {tab.title}
          </Button>
        ))}
      </div>

      {type === "client" && active === "contracts" ? (
        <ClientContractsPanel clientId={id} />
      ) : type === "client" && active === "contacts" ? (
        <ClientContactsPanel clientId={id} />
      ) : (
        <TabBody type={type} id={id} tab={active} />
      )}
    </div>
  );
}

export function OpsRecordList({ type }: { type: OpsRecordType }) {
  const load = useServerFn(listOpsRecords);
  const query = useQuery({
    queryKey: ["ops-record-list", type],
    queryFn: () => load({ data: { type } }),
  });

  return (
    <div className="space-y-4 p-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-heading text-2xl font-semibold">{LABELS[type].plural}</h1>
          {type === "client" ? (
            <Button asChild size="sm"><Link to="/ops/clients/new">+ New Client</Link></Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Open a record to see everything Harmonious holds for it.
        </p>
      </header>
      {query.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {query.error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not available</CardTitle>
            <CardDescription>{(query.error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {((query.data as any)?.records ?? []).map((item: any) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
              <CardDescription>{item.subtitle ?? "—"}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              {item.status ? <Badge variant="secondary">{item.status}</Badge> : <span />}
              <Button asChild size="sm" variant="outline">
                <Link to={recordPath(type, item.id) as any}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
