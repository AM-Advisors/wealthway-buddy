/**
 * A worked example of a cap table migration, shown on the public CapTable page.
 *
 * Everything here is invented sample data held in this file. It never touches a
 * real company, never reads or writes the database, and is clearly labelled as
 * a sample so nobody mistakes it for their own record.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { MigrationWizard } from "./migration-wizard";

type Provider = "carta" | "pulley";

type Row = {
  holder: string;
  type: string;
  klass: string;
  quantity: number;
  issued: string;
  state: "ready" | "attention";
  note?: string;
};

type ClassLine = {
  name: string;
  authorized: number;
  issued: number;
  outstanding: number;
  reserved: number;
};

type Exception = {
  klass: string;
  status: "open" | "resolved";
  raised: string;
  reason: string;
  resolution?: string;
};

type Sample = {
  label: string;
  fileName: string;
  detected: string;
  columns: [string, string][];
  rows: Row[];
  classes: ClassLine[];
  exceptions: Exception[];
};

const SAMPLES: Record<Provider, Sample> = {
  carta: {
    label: "Carta",
    fileName: "acme-labs-carta-export.csv",
    detected: "Carta stakeholder and securities export, 5 columns recognised",
    columns: [
      ["Stakeholder Name", "Shareholder"],
      ["Security Type", "Instrument"],
      ["Share Class", "Share class"],
      ["Quantity Issued", "Shares"],
      ["Issue Date", "Issued on"],
    ],
    rows: [
      { holder: "Dana Whitfield", type: "Common", klass: "Common", quantity: 4_000_000, issued: "12 Mar 2021", state: "ready" },
      { holder: "Priya Raman", type: "Common", klass: "Common", quantity: 3_200_000, issued: "12 Mar 2021", state: "ready" },
      { holder: "Northgate Seed Fund I", type: "Preferred", klass: "Series Seed", quantity: 1_850_000, issued: "04 Nov 2022", state: "ready" },
      { holder: "Harbourline Ventures", type: "Preferred", klass: "Series A", quantity: 2_400_000, issued: "19 Jun 2024", state: "ready" },
      { holder: "J. Okafor", type: "Option", klass: "Option pool", quantity: 120_000, issued: "02 Feb 2023", state: "ready" },
      {
        holder: "SPV — Ridgeway Co-Invest",
        type: "Preferred",
        klass: "Series A",
        quantity: 600_000,
        issued: "19 Jun 2024",
        state: "attention",
        note: "Held through an SPV — we ask who sits behind it before recording.",
      },
      {
        holder: "Unnamed holder (row 41)",
        type: "Common",
        klass: "—",
        quantity: 25_000,
        issued: "—",
        state: "attention",
        note: "No share class and no issue date in the file. Flagged, never guessed.",
      },
    ],
    classes: [
      { name: "Common", authorized: 10_000_000, issued: 7_225_000, outstanding: 7_225_000, reserved: 0 },
      { name: "Series Seed", authorized: 2_000_000, issued: 1_850_000, outstanding: 1_850_000, reserved: 0 },
      { name: "Series A", authorized: 3_000_000, issued: 3_000_000, outstanding: 3_000_000, reserved: 0 },
      { name: "Option pool", authorized: 1_500_000, issued: 120_000, outstanding: 120_000, reserved: 1_380_000 },
    ],
    exceptions: [
      {
        klass: "Common",
        status: "open",
        raised: "Issued shares are 25,000 higher than the last board consent",
        reason: "The unnamed row 41 is counted in the file total but has no class or date.",
      },
      {
        klass: "Series A",
        status: "resolved",
        raised: "Series A issued equals authorised, leaving nothing spare",
        reason: "Checked against the Series A financing documents.",
        resolution: "Correct — the round was fully allocated at close. Settled by the founder.",
      },
    ],
  },
  pulley: {
    label: "Pulley",
    fileName: "acme-labs-pulley-securities.xlsx",
    detected: "Pulley securities export, 5 columns recognised",
    columns: [
      ["Holder", "Shareholder"],
      ["Type", "Instrument"],
      ["Class", "Share class"],
      ["Shares", "Shares"],
      ["Grant Date", "Issued on"],
    ],
    rows: [
      { holder: "Dana Whitfield", type: "Common", klass: "Common", quantity: 4_000_000, issued: "12 Mar 2021", state: "ready" },
      { holder: "Priya Raman", type: "Common", klass: "Common", quantity: 3_200_000, issued: "12 Mar 2021", state: "ready" },
      { holder: "Northgate Seed Fund I", type: "SAFE", klass: "—", quantity: 0, issued: "04 Nov 2022", state: "ready", note: "Converts at the next priced round." },
      { holder: "Harbourline Ventures", type: "Preferred", klass: "Series A", quantity: 2_400_000, issued: "19 Jun 2024", state: "ready" },
      { holder: "M. Alvarez", type: "Option", klass: "Option pool", quantity: 90_000, issued: "15 Aug 2023", state: "ready" },
      {
        holder: "Harbourline Ventures",
        type: "Preferred",
        klass: "Series A",
        quantity: 2_400_000,
        issued: "19 Jun 2024",
        state: "attention",
        note: "Looks like the same grant twice. We flag possible duplicates instead of merging them.",
      },
    ],
    classes: [
      { name: "Common", authorized: 10_000_000, issued: 7_200_000, outstanding: 7_200_000, reserved: 0 },
      { name: "Series A", authorized: 3_000_000, issued: 4_800_000, outstanding: 4_800_000, reserved: 0 },
      { name: "Option pool", authorized: 1_500_000, issued: 90_000, outstanding: 90_000, reserved: 1_410_000 },
    ],
    exceptions: [
      {
        klass: "Series A",
        status: "open",
        raised: "Issued shares exceed authorised by 1,800,000",
        reason: "The duplicated Harbourline grant is counted twice in the file.",
      },
    ],
  },
};

const fmt = (value: number) => value.toLocaleString("en-US");

export function DemoMigration() {
  const [provider, setProvider] = useState<Provider>("carta");
  const sample = SAMPLES[provider];

  const ready = sample.rows.filter((r) => r.state === "ready").length;
  const attention = sample.rows.filter((r) => r.state === "attention").length;
  const open = sample.exceptions.filter((e) => e.status === "open").length;
  const totals = sample.classes.reduce(
    (acc, c) => ({
      authorized: acc.authorized + c.authorized,
      issued: acc.issued + c.issued,
      outstanding: acc.outstanding + c.outstanding,
      diluted: acc.diluted + c.outstanding + c.reserved,
    }),
    { authorized: 0, issued: 0, outstanding: 0, diluted: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["carta", "pulley"] as Provider[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setProvider(key)}
            aria-pressed={provider === key}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition",
              provider === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-secondary",
            )}
          >
            {SAMPLES[key].label} export
          </button>
        ))}
        <Badge variant="outline">Sample data — not a real company</Badge>
      </div>

      <MigrationWizard
        title={`Acme Labs, Inc. — ${sample.label} migration`}
        description={`${sample.fileName} · ${sample.detected}`}
        facts={{
          total: sample.rows.length,
          ready,
          error: attention,
          status: "mapped",
          reconciliation: {
            note: "Sample reconciliation",
            exceptions: Object.fromEntries(
              sample.exceptions.map((e, index) => [`${e.klass}-${index}`, { status: e.status }]),
            ),
          },
          openQuestions: open,
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What the file said</CardTitle>
            <CardDescription>
              The provider is recognised from the column headings, then each heading is matched to
              what it means here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {sample.columns.map(([from, to]) => (
                <li key={from} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                  <span className="truncate font-mono text-xs text-muted-foreground">{from}</span>
                  <span aria-hidden className="text-muted-foreground">→</span>
                  <span className="truncate">{to}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">The rows, as they will be recorded</CardTitle>
            <CardDescription>
              {fmt(ready)} ready · {fmt(attention)} flagged for a person to look at. Nothing is
              recorded until a founder accepts it.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shareholder</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead>Issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sample.rows.map((row, index) => (
                  <TableRow key={`${row.holder}-${index}`} className={row.state === "attention" ? "bg-destructive/5" : undefined}>
                    <TableCell>
                      <span className="font-medium">{row.holder}</span>
                      {row.note ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{row.note}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{row.klass}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity ? fmt(row.quantity) : "—"}
                    </TableCell>
                    <TableCell>{row.issued}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reconciliation</CardTitle>
          <CardDescription>
            Authorised, issued, outstanding and fully diluted shares are compared class by class
            before anything goes live.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Share class</TableHead>
                <TableHead className="text-right">Authorised</TableHead>
                <TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Fully diluted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sample.classes.map((line) => {
                const over = line.issued > line.authorized;
                return (
                  <TableRow key={line.name} className={over ? "bg-destructive/5" : undefined}>
                    <TableCell className="font-medium">
                      {line.name}
                      {over ? (
                        <Badge variant="destructive" className="ml-2">
                          Over authorised by {fmt(line.issued - line.authorized)}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(line.authorized)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(line.issued)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(line.outstanding)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(line.reserved)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(line.outstanding + line.reserved)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-medium">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.authorized)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.issued)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.outstanding)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(totals.diluted - totals.outstanding)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.diluted)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exceptions</CardTitle>
          <CardDescription>
            Anything that does not add up is raised as an exception with a written reason. The
            migration cannot go live while one is still open.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {sample.exceptions.map((exception, index) => (
              <li
                key={`${exception.klass}-${index}`}
                className={cn(
                  "rounded-lg border p-4",
                  exception.status === "open" ? "border-destructive/40 bg-destructive/5" : "bg-muted/30",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {exception.klass}: {exception.raised}
                  </p>
                  <Badge variant={exception.status === "open" ? "destructive" : "secondary"}>
                    {exception.status === "open" ? "Open" : "Settled"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{exception.reason}</p>
                {exception.resolution ? (
                  <p className="mt-1 text-sm text-muted-foreground">{exception.resolution}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
