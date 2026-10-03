import { CommercialAgreementCard } from "@/components/commercial-agreement-card";
import { HarmoniousTeamCard } from "@/components/harmonious-team-card";
import { ClientContractsPanel } from "@/components/client-contracts";
import { InvestorDriveIntakeCard } from "@/components/investor-drive-intake";
import { ClientFundsPanel, ClientOverviewActions, ClientPeoplePanel, ClientServicesPricingPanel } from "@/components/client-admin";
import { useEffect, useMemo, useState } from "react";

import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AccessBadge, PeopleActions, useAccessStatus } from "@/components/people-actions";
import { getPeopleDirectory, setClientArchived, setTestDemoFlag } from "@/lib/user-access.functions";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { DriveStatusCard } from "@/components/drive-status-card";
import { DriveInvestorCard } from "@/components/drive-investor-card";
import { DriveImportsCard } from "@/components/drive-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table as UiTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { allowedActions, recordPath, recordTabs, RECORD_AREA, type InvestorListRow, type OpsRecordType } from "@/lib/ops-records";
import type { OpsCapability } from "@/lib/ops-capabilities";
import { SideLetterRegistry } from "@/components/side-letter-registry";
import { FundCapTable } from "@/components/fund-cap-table";

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
  if (cents === null || cents === undefined) return "-";
  return (Number(cents) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function when(value?: string | null) {
  if (!value) return "-";
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
  if (value === null || value === undefined || value === "") return "-";
  if (/cents$/i.test(key) || /Cents$/.test(key)) return money(Number(value));
  if (/(_at|_on|date|At|Date)$/.test(key)) return when(String(value));
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "-";
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
  if (!link || text === "-") return text;
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
      { label: "Status", value: record.status ?? "-" },
      { label: "Primary contact", value: record.contact ?? "-" },
      { label: "Entities", value: String(record.entityCount) },
      { label: "Funds & SPVs", value: String(record.fundCount) },
      { label: "Companies", value: String(record.companyCount) },
      { label: "Client since", value: when(record.since) },
    ];
  }
  if (type === "fund") {
    return [
      { label: "Stage", value: record.stage ?? record.status ?? "-" },
      { label: "Launch", value: record.launchState ?? "-" },
      { label: "Regulation", value: record.regType ?? "-" },
      { label: "Strategy", value: record.strategy ?? record.fundType ?? "-" },
      { label: "Accepted commitments", value: money(record.acceptedCents) },
      { label: "Funded capital", value: money(record.fundedCents) },
      { label: "Investors", value: String(record.investorCount) },
      { label: "Domicile", value: record.domicile ?? "-" },
    ];
  }
  if (type === "investor") {
    return [
      { label: "Investor type", value: record.investorType ?? "-" },
      { label: "Investment profiles", value: String(record.profileCount) },
      { label: "Active investments", value: String(record.investmentCount) },
      { label: "Accepted", value: money(record.acceptedCents) },
      { label: "Funded", value: money(record.fundedCents) },
      { label: "Open onboardings", value: String(record.openOnboardings) },
    ];
  }
  return [
    { label: "Entity type", value: record.entityType ?? "-" },
    { label: "Jurisdiction", value: record.jurisdiction ?? "-" },
    { label: "Incorporated", value: when(record.incorporated) },
    { label: "Authorized shares", value: record.authorizedShares?.toLocaleString?.() ?? "-" },
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
        {type === "client" ? (
          <ClientOverviewActions clientId={id} goTo={(tab) => navigate({ to: ".", search: { tab } as any })} />
        ) : null}
        {type === "client" ? <HarmoniousTeamCard clientId={id} /> : null}
        {type === "fund" ? <HarmoniousTeamCard offeringId={id} /> : null}
        {type === "client" ? <CommercialAgreementCard clientId={id} /> : null}
        {type === "fund" ? <CommercialAgreementCard offeringId={id} /> : null}
        {type === "fund" ? <DriveStatusCard offeringId={id} /> : null}
        {type === "investor" ? <DriveInvestorCard investorUserId={id} /> : null}
        {type === "fund" ? <DriveImportsCard offeringId={id} /> : null}
        {type === "investor" ? <InvestorDriveIntakeCard investorUserId={id} /> : null}
        {type === "investor" ? <DriveImportsCard investorUserId={id} /> : null}
        <p className="text-xs text-muted-foreground">
          You may {Object.entries(actions).filter(([, ok]) => ok).map(([name]) => name).join(", ")} in this
          area. Every action is checked again by the backend.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.filter((tab) => !tab.hidden).map((tab) => (
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
        <ClientPeoplePanel clientId={id} />
      ) : type === "client" && active === "services" ? (
        <ClientServicesPricingPanel clientId={id} />
      ) : type === "client" && active === "funds" ? (
        <ClientFundsPanel clientId={id} />
      ) : type === "fund" && active === "side-letters" ? (
        <SideLetterRegistry fundId={id} />
      ) : type === "fund" && active === "cap-table" ? (
        <FundCapTable fundId={id} />
      ) : (
        <TabBody type={type} id={id} tab={active} />
      )}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function ClientAccessMenu({ id, archived, test }: { id: string; archived: boolean; test: boolean }) {
  const qc = useQueryClient();
  const arch = useServerFn(setClientArchived), flag = useServerFn(setTestDemoFlag);
  const run = async (fn: () => Promise<any>, msg: string) => { try { await fn(); toast.success(msg); await qc.invalidateQueries(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } };
  return (
    <span className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt(archived ? "Reason for restoring this client" : "Reason for archiving this client (people keep their own access until revoked)"); if (reason && reason.trim().length >= 3) void run(() => arch({ data: { clientId: id, archive: !archived, reason } }), archived ? "Client restored." : "Client archived."); }}>{archived ? "Restore" : "Archive"}</Button>
      <Button size="sm" variant="ghost" onClick={() => run(() => flag({ data: { kind: "client", id, value: !test } }), test ? "Unmarked test/demo." : "Marked test/demo.")}>{test ? "Unmark test" : "Mark test"}</Button>
    </span>
  );
}

function InvestorListTable({ records: all }: { records: InvestorListRow[] }) {
  const emails = all.map((r) => (r.subtitle && r.subtitle.includes("@") ? r.subtitle : "")).filter(Boolean) as string[];
  const access = useAccessStatus(emails);
  const [show, setShow] = useState<"current" | "archived" | "test">("current");
  const acc = (r: InvestorListRow) => (r.subtitle ? access.data?.[r.subtitle.toLowerCase()] : undefined);
  const records = all.filter((r) => show === "archived" ? acc(r)?.status === "archived" : show === "test" ? acc(r)?.isTestDemo : acc(r)?.status !== "archived");
  const tabs = access.data ? <div className="mb-2 flex gap-1">{(["current", "archived", "test"] as const).map((v) => <button key={v} onClick={() => setShow(v)} className={`rounded border px-3 py-1 text-xs ${show === v ? "bg-primary text-primary-foreground" : ""}`}>{v === "current" ? "Current" : v === "archived" ? "Archived" : "Test/Demo"}</button>)}</div> : null;
  if (!records.length) {
    return <div>{tabs}<p className="text-sm text-muted-foreground">No investors match.</p></div>;
  }
  return (
    <div>{tabs}
    <div className="rounded-md border">
      <UiTable>
        <TableHeader>
          <TableRow>
            <TableHead>Investor</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Funds</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link to={recordPath("investor", row.id) as any} className="font-medium hover:underline">
                  {row.title}
                </Link>
                {row.subtitle ? <div className="text-xs text-muted-foreground">{row.subtitle}</div> : null}
                <AccessBadge info={acc(row)} />
              </TableCell>
              <TableCell>
                {row.clients.length
                  ? row.clients.map((c) => (
                      <div key={c.id}>
                        <Link to={recordPath("client", c.id) as any} className="hover:underline">
                          {c.name}
                        </Link>
                      </div>
                    ))
                  : "—"}
              </TableCell>
              <TableCell>
                {row.funds.length
                  ? row.funds.map((f) => (
                      <div key={f.fundId}>
                        <Link to={recordPath("fund", f.fundId) as any} className="hover:underline">
                          {f.fundName}
                        </Link>
                      </div>
                    ))
                  : "—"}
              </TableCell>
              <TableCell>{row.status ? <Badge variant="secondary">{row.status}</Badge> : "—"}</TableCell>
              <TableCell>{row.stage ?? "—"}</TableCell>
              <TableCell>
                <Button asChild size="sm" variant="outline">
                  <Link to={recordPath("investor", row.id) as any}>Open</Link>
                </Button>
                {access.data && row.subtitle?.includes("@") ? <PeopleActions email={row.subtitle} name={row.title} info={acc(row)}
                  /> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </UiTable>
    </div>
    </div>
  );
}

export function OpsRecordList({ type }: { type: OpsRecordType }) {
  const load = useServerFn(listOpsRecords);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const query = useQuery({
    queryKey: ["ops-record-list", type, type === "investor" ? debounced : ""],
    queryFn: () => load({ data: { type, search: type === "investor" && debounced ? debounced : undefined } }),
  });

  const records = (query.data as any)?.records ?? [];

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
      {type === "investor" ? (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by investor, client or fund…"
          className="max-w-sm"
          aria-label="Search investors"
        />
      ) : null}
      {query.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {query.error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not available</CardTitle>
            <CardDescription>{(query.error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {type === "investor" && !query.isPending && !query.error ? (
        <InvestorListTable records={records} />
      ) : (
        <ClientGrid type={type} records={records} />
      )}
    </div>
  );
}

function ClientGrid({ type, records: all }: { type: OpsRecordType; records: any[] }) {
  const [show, setShow] = useState<"current" | "archived" | "test">("current");
  const dir = useQuery({ queryKey: ["people-directory-clients"], queryFn: useServerFn(getPeopleDirectory), enabled: type === "client", retry: false });
  const meta = new Map(((dir.data?.clients ?? []) as any[]).map((c) => [c.id, c]));
  const records = type !== "client" ? all : all.filter((r) => {
    const m = meta.get(r.id);
    return show === "archived" ? m?.status === "archived" : show === "test" ? m?.is_test_demo : m?.status !== "archived";
  });
  return (
    <div className="space-y-2">
      {type === "client" && dir.data ? <div className="flex gap-1">{(["current", "archived", "test"] as const).map((v) => <button key={v} onClick={() => setShow(v)} className={`rounded border px-3 py-1 text-xs ${show === v ? "bg-primary text-primary-foreground" : ""}`}>{v === "current" ? "Current" : v === "archived" ? "Archived" : "Test/Demo"}</button>)}</div> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((item: any) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription>{item.subtitle ?? "-"}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                {item.status ? <Badge variant="secondary">{item.status}</Badge> : <span />}
                <span className="flex items-center gap-1">
                  {type === "client" && (dir.data as any)?.canManage ? <ClientAccessMenu id={item.id} archived={meta.get(item.id)?.status === "archived"} test={!!meta.get(item.id)?.is_test_demo} /> : null}
                  <Button asChild size="sm" variant="outline">
                    <Link to={recordPath(type, item.id) as any}>Open</Link>
                  </Button>
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
    </div>
  );
}
