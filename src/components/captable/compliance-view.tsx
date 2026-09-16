import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getCapAuditHistory } from "@/lib/captable-audit.functions";
import { fmtDate, fmtNumber, useCapTable } from "./captable-context";
import { CapTableSection } from "./captable-states";

const ENTITY_TYPES = [
  { value: "all", label: "Everything" },
  { value: "company", label: "Company" },
  { value: "stakeholder", label: "Stakeholders" },
  { value: "security", label: "Securities" },
  { value: "class", label: "Share classes" },
  { value: "round", label: "Rounds" },
  { value: "transfer", label: "Transfers" },
  { value: "migration", label: "Migration" },
];

const SOURCE_LABEL: Record<string, string> = {
  event: "Change",
  transaction: "Ledger",
  document: "Document",
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function ComplianceView() {
  return (
    <CapTableSection>
      <Body />
    </CapTableSection>
  );
}

function Body() {
  const { workspace, companyId } = useCapTable();
  const load = useServerFn(getCapAuditHistory);

  const [stakeholderId, setStakeholderId] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [source, setSource] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["captable-audit", companyId, stakeholderId, entityType, from, to],
    enabled: Boolean(companyId),
    queryFn: () =>
      load({
        data: {
          companyId: companyId!,
          stakeholderId: stakeholderId === "all" ? null : stakeholderId,
          entityType: entityType === "all" ? null : entityType,
          from: from || null,
          to: to || null,
          limit: 400,
        },
      }),
  });

  const data = query.data;
  const entries = useMemo(() => {
    const rows = data?.entries ?? [];
    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => (source === "all" ? true : row.source === source))
      .filter((row) =>
        q
          ? [row.action, row.stakeholder, row.entityLabel, row.detail, row.reason, row.change]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(q))
          : true,
      );
  }, [data, search, source]);

  function exportCsv() {
    const header = [
      "When",
      "Record",
      "Action",
      "Stakeholder",
      "Entity",
      "Detail",
      "Status",
      "Reason",
    ];
    const lines = [
      header.map(csvCell).join(","),
      ...entries.map((row) =>
        [
          row.occurredAt,
          SOURCE_LABEL[row.source] ?? row.source,
          row.action,
          row.stakeholder ?? "",
          row.entityLabel ?? "",
          row.detail ?? row.change ?? "",
          row.status ?? "",
          row.reason ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cap-table-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No company selected</CardTitle>
          <CardDescription>Choose a company to see its audit history.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance and audit history</CardTitle>
          <CardDescription>
            Every ownership change, ledger entry and filed document for{" "}
            {workspace?.company?.name ?? "this company"}, in one record. Entries are written as they
            happen and are never edited or removed — corrections are recorded as new entries.
          </CardDescription>
        </CardHeader>
        {summary ? (
          <CardContent className="grid gap-3 pt-0 sm:grid-cols-3 lg:grid-cols-6">
            <Figure label="Entries" value={fmtNumber(summary.totalEntries)} />
            <Figure label="Ledger entries" value={fmtNumber(summary.ledgerEntries)} />
            <Figure label="Documents" value={fmtNumber(summary.documents)} />
            <Figure label="Verified positions" value={fmtNumber(summary.verified)} />
            <Figure label="Awaiting verification" value={fmtNumber(summary.unverified)} />
            <Figure label="Positions without a document" value={fmtNumber(summary.securitiesWithoutDocuments)} />
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor="audit-stakeholder">Stakeholder</Label>
            <Select value={stakeholderId} onValueChange={setStakeholderId}>
              <SelectTrigger id="audit-stakeholder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {(data?.stakeholders ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-entity">Record type</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger id="audit-entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-source">Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="audit-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="event">Changes</SelectItem>
                <SelectItem value="transaction">Ledger</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-from">From</Label>
            <Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to">To</Label>
            <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-search">Search</Label>
            <Input
              id="audit-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Action, holder or note"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {query.isLoading ? "Loading history…" : `${fmtNumber(entries.length)} entries shown`}
          {summary?.firstEntry ? ` · earliest ${fmtDate(summary.firstEntry)}` : ""}
        </p>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
          Export CSV
        </Button>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="timeline">Audit trail</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Stakeholder</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      {query.isLoading ? "Loading…" : "No entries match these filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(row.occurredAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{SOURCE_LABEL[row.source] ?? row.source}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{row.action.replace(/[._]/g, " ")}</TableCell>
                      <TableCell>{row.stakeholder ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.entityLabel ?? "—"}</TableCell>
                      <TableCell className="max-w-[22rem] text-muted-foreground">
                        {row.detail ?? row.change ?? row.reason ?? "—"}
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {row.status ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Attached to</TableHead>
                  <TableHead>Stakeholder</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.documents ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No documents filed against these records yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.documents ?? []).map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.title}</TableCell>
                      <TableCell className="text-muted-foreground">{doc.docType ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.linkedLabel ?? doc.linkedType ?? "—"}
                      </TableCell>
                      <TableCell>{doc.stakeholder ?? "—"}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{doc.status}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(doc.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Harmonious keeps this record for you. It supports your own compliance and reporting work and
        is not legal, tax or accounting advice.
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
