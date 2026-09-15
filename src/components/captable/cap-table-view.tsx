import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { fmtDate, fmtMoney, fmtNumber, fmtPercent, useCapTable } from "./captable-context";
import { CapTableSection } from "./captable-states";

function statusTone(status: string) {
  if (status === "verified" || status === "recorded") return "secondary" as const;
  if (status === "pending") return "outline" as const;
  if (status === "rejected") return "destructive" as const;
  return "outline" as const;
}

export function CapTableView() {
  return (
    <CapTableSection>
      <Body />
    </CapTableSection>
  );
}

function Body() {
  const { workspace } = useCapTable();
  const [search, setSearch] = useState("");
  const securities = workspace!.securities;
  const ownership = workspace!.ownership ?? [];
  const rounds = workspace!.rounds;
  const metrics = workspace!.metrics!;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return securities;
    return securities.filter((s) =>
      [s.stakeholder, s.securityLabel, s.className, s.roundName, s.label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [securities, search]);

  const byRound = useMemo(() => {
    const map = new Map<string, typeof securities>();
    for (const s of securities) {
      const key = s.roundName ?? "Founders and other issuances";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [securities]);

  const historical = useMemo(
    () => [...workspace!.transactions].sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1)),
    [workspace],
  );

  if (securities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No positions recorded yet</CardTitle>
          <CardDescription>
            Add stakeholders and issue securities from the Securities tab, or bring your existing
            records across from the Migration tab.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search holders, classes or rounds"
          className="max-w-xs"
          aria-label="Search the cap table"
        />
        <p className="text-sm text-muted-foreground">
          {fmtNumber(metrics.outstandingShares)} outstanding · {fmtNumber(metrics.fullyDiluted)} fully
          diluted
        </p>
      </div>

      <Tabs defaultValue="stakeholder">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="stakeholder">By stakeholder</TabsTrigger>
          <TabsTrigger value="security">By security</TabsTrigger>
          <TabsTrigger value="round">By round</TabsTrigger>
          <TabsTrigger value="diluted">Fully diluted</TabsTrigger>
          <TabsTrigger value="converted">As converted</TabsTrigger>
          <TabsTrigger value="history">Historical</TabsTrigger>
        </TabsList>

        <TabsContent value="stakeholder" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stakeholder</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Ownership</TableHead>
                  <TableHead className="text-right">Fully diluted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownership.map((holder) => (
                  <TableRow key={holder.id}>
                    <TableCell className="font-medium">{holder.name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{holder.type}</TableCell>
                    <TableCell className="text-right">{fmtNumber(holder.outstanding)}</TableCell>
                    <TableCell className="text-right">{fmtPercent(holder.outstandingPct)}</TableCell>
                    <TableCell className="text-right">{fmtPercent(holder.dilutedPct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stakeholder</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Exercise</TableHead>
                  <TableHead>Vesting</TableHead>
                  <TableHead>Restrictions</TableHead>
                  <TableHead>Verification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.stakeholder}</TableCell>
                    <TableCell>
                      {s.securityLabel}
                      {s.label ? <span className="text-muted-foreground"> · {s.label}</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.className ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmtNumber(s.quantity)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(s.issueDate)}</TableCell>
                    <TableCell className="text-right">{s.purchasePrice === null ? "—" : fmtMoney(s.purchasePrice, 4)}</TableCell>
                    <TableCell className="text-right">{s.exercisePrice === null ? "—" : fmtMoney(s.exercisePrice, 4)}</TableCell>
                    <TableCell className="text-muted-foreground">{s.vesting ?? "—"}</TableCell>
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                      {s.transferRestrictions ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusTone(s.verificationStatus)} className="capitalize">
                        {s.verificationStatus.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="round" className="mt-4 space-y-4">
          {byRound.map(([name, rows]) => {
            const round = rounds.find((r) => r.name === name);
            return (
              <Card key={name}>
                <CardHeader>
                  <CardTitle className="text-base">{name}</CardTitle>
                  <CardDescription>
                    {round
                      ? `${round.roundType} · closed ${fmtDate(round.closeDate)} · ${fmtMoney(round.amountRaised, 0)} raised at ${fmtMoney(round.pricePerShare, 4)} per share`
                      : "Issuances outside a priced financing"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y text-sm">
                    {rows.map((row) => (
                      <li key={row.id} className="flex items-center justify-between py-2">
                        <span>
                          {row.stakeholder}
                          <span className="text-muted-foreground"> · {row.securityLabel}</span>
                        </span>
                        <span className="font-medium">{fmtNumber(row.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="diluted" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Fully diluted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownership.map((holder) => (
                  <TableRow key={holder.id}>
                    <TableCell>{holder.name}</TableCell>
                    <TableCell className="text-right">{fmtNumber(holder.diluted)}</TableCell>
                    <TableCell className="text-right">{fmtPercent(holder.dilutedPct)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Unallocated option pool</TableCell>
                  <TableCell className="text-right">{fmtNumber(metrics.poolAvailable)}</TableCell>
                  <TableCell className="text-right">
                    {fmtPercent(metrics.fullyDiluted ? (metrics.poolAvailable / metrics.fullyDiluted) * 100 : 0)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{fmtNumber(metrics.fullyDiluted)}</TableCell>
                  <TableCell className="text-right font-semibold">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="converted" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">As converted</CardTitle>
              <CardDescription>
                Preferred shown on an as-converted basis. SAFEs and notes are listed separately
                because they convert on the terms of a future financing — nothing is converted into
                the official record until that financing closes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
                      <TableHead className="text-right">As converted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspace!.classes.map((cls) => {
                      const shares = securities
                        .filter((s) => s.className === cls.name)
                        .reduce((sum, s) => sum + s.quantity, 0);
                      return (
                        <TableRow key={cls.id}>
                          <TableCell>{cls.name}</TableCell>
                          <TableCell className="text-right">{fmtNumber(shares)}</TableCell>
                          <TableCell className="text-right">{cls.conversionRatio}×</TableCell>
                          <TableCell className="text-right">{fmtNumber(shares * cls.conversionRatio)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="rounded-lg border p-4 text-sm">
                <p className="font-medium">Convertible securities not yet converted</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {securities
                    .filter((s) => s.securityType === "safe" || s.securityType === "note")
                    .map((s) => (
                      <li key={s.id}>
                        {s.stakeholder} · {s.securityLabel} · {fmtMoney(s.principal, 0)}
                        {s.valuationCap ? ` · cap ${fmtMoney(s.valuationCap, 0)}` : ""}
                        {s.discountRate ? ` · ${s.discountRate}% discount` : ""}
                      </li>
                    ))}
                  {securities.filter((s) => s.securityType === "safe" || s.securityType === "note").length ===
                  0 ? (
                    <li>None on record.</li>
                  ) : null}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Stakeholder</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historical.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(tx.effectiveDate)}</TableCell>
                    <TableCell className="capitalize">{tx.kind}</TableCell>
                    <TableCell>{tx.stakeholder ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmtNumber(tx.quantity)}</TableCell>
                    <TableCell className="text-right">{tx.amount === null ? "—" : fmtMoney(tx.amount, 0)}</TableCell>
                    <TableCell>
                      <Badge variant={statusTone(tx.status)} className="capitalize">
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tx.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
