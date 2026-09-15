import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { fmtDate, fmtMoney, fmtNumber, fmtPercent, useCapTable } from "./captable-context";
import { CapTableSection } from "./captable-states";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={ok ? "secondary" : "destructive"}>{ok ? "Clear" : "Needs attention"}</Badge>
    </div>
  );
}

export function CapTableOverview() {
  return (
    <CapTableSection>
      <OverviewBody />
    </CapTableSection>
  );
}

function OverviewBody() {
  const { workspace } = useCapTable();
  const m = workspace!.metrics!;
  const company = workspace!.company!;
  const ownership = workspace!.ownership ?? [];
  const events = workspace!.events ?? [];

  const issuedPct = m.authorizedShares ? (m.outstandingShares / m.authorizedShares) * 100 : 0;
  const attention = [
    m.unverifiedSecurities > 0,
    m.pendingTransactions > 0,
    m.missingDocuments > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{company.name}</h3>
          <p className="text-sm text-muted-foreground">
            {[company.entityType, company.jurisdiction, company.incorporationDate ? `Incorporated ${fmtDate(company.incorporationDate)}` : null]
              .filter(Boolean)
              .join(" · ") || "Company details not recorded yet"}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/client/cap-table/table">Open cap table</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Fully diluted shares"
          value={fmtNumber(m.fullyDiluted)}
          hint="Includes granted equity and the unallocated option pool"
        />
        <Stat label="Outstanding shares" value={fmtNumber(m.outstandingShares)} hint={`${fmtPercent(issuedPct)} of authorised`} />
        <Stat label="Authorised shares" value={fmtNumber(m.authorizedShares)} />
        <Stat
          label="Options available"
          value={fmtNumber(m.poolAvailable)}
          hint={`${fmtNumber(m.poolGranted)} granted of ${fmtNumber(m.poolSize)} pool`}
        />
        <Stat label="Stakeholders" value={fmtNumber(m.stakeholders)} />
        <Stat label="Employees with equity" value={fmtNumber(m.employeesWithEquity)} />
        <Stat label="Investors" value={fmtNumber(m.investors)} hint={`${fmtNumber(m.spvs)} funds or SPVs on record`} />
        <Stat
          label="Convertibles"
          value={`${fmtNumber(m.safes)} SAFEs · ${fmtNumber(m.notes)} notes`}
          hint={`${fmtMoney(m.safePrincipal + m.notePrincipal, 0)} principal outstanding`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ownership health</CardTitle>
            <CardDescription>
              {attention === 0
                ? "Your records reconcile and nothing is waiting on you."
                : `${attention} area${attention === 1 ? "" : "s"} need your attention.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <HealthRow
              label="Cap table reconciled"
              ok={m.outstandingShares <= m.authorizedShares}
              detail={`${fmtNumber(m.outstandingShares)} outstanding against ${fmtNumber(m.authorizedShares)} authorised`}
            />
            <HealthRow
              label="Unverified securities"
              ok={m.unverifiedSecurities === 0}
              detail={`${fmtNumber(m.unverifiedSecurities)} position${m.unverifiedSecurities === 1 ? "" : "s"} still to be verified`}
            />
            <HealthRow
              label="Pending approvals"
              ok={m.pendingTransactions === 0}
              detail={`${fmtNumber(m.pendingTransactions)} transaction${m.pendingTransactions === 1 ? "" : "s"} awaiting a decision`}
            />
            <HealthRow
              label="Supporting documents"
              ok={m.missingDocuments === 0}
              detail={`${fmtNumber(m.missingDocuments)} position${m.missingDocuments === 1 ? "" : "s"} without a reference document`}
            />
            <div className="pt-4">
              <p className="mb-1 text-xs text-muted-foreground">Authorised shares issued</p>
              <Progress value={Math.min(issuedPct, 100)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Largest holders</CardTitle>
            <CardDescription>By fully diluted ownership</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {ownership.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No positions recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {ownership.slice(0, 8).map((holder) => (
                  <li key={holder.id} className="flex items-center justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{holder.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{holder.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fmtPercent(holder.dilutedPct)}</p>
                      <p className="text-xs text-muted-foreground">{fmtNumber(holder.diluted)} shares</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent ownership changes</CardTitle>
          <CardDescription>Every change is kept in the audit history</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {events.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {events.slice(0, 8).map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                  <div>
                    <p className="text-sm font-medium">{event.action.replace(/[._]/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(event.occurredAt)}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
