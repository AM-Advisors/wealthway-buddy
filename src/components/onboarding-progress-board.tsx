import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Circle } from "lucide-react";

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
import { getOnboardingProgress } from "@/lib/onboarding-progress.functions";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const when = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/** Every client's onboarding, stage by stage, with the quiet ones flagged. */
export function OnboardingProgressBoard() {
  const load = useServerFn(getOnboardingProgress);
  const [stallDays, setStallDays] = useState(7);
  const [view, setView] = useState<"all" | "stalled" | "open" | "complete">("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["onboarding-progress", stallDays],
    queryFn: () => load({ data: { stallDays } }),
    retry: false,
  });

  const rows = useMemo(() => {
    const all = data?.clients ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((row: any) => {
      if (view === "stalled" && !row.stalled) return false;
      if (view === "open" && !row.nextStage) return false;
      if (view === "complete" && row.nextStage) return false;
      if (!q) return true;
      return (
        String(row.name ?? "").toLowerCase().includes(q) ||
        String(row.contactEmail ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, view, search]);

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">{(error as Error).message}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Clients", value: data?.summary.total ?? 0 },
          { label: "Stalled", value: data?.summary.stalled ?? 0 },
          { label: "Fully onboarded", value: data?.summary.complete ?? 0 },
          { label: "With overdue invoices", value: data?.summary.overdue ?? 0 },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-3xl">{card.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor="progress-search">Search</Label>
              <Input
                id="progress-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Client or contact email"
              />
            </div>
            <div className="w-44">
              <Label>Show</Label>
              <Select value={view} onValueChange={(v) => setView(v as typeof view)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="stalled">Stalled only</SelectItem>
                  <SelectItem value="open">Still in progress</SelectItem>
                  <SelectItem value="complete">Fully onboarded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-52">
              <Label>Flag as stalled after</Label>
              <Select value={String(stallDays)} onValueChange={(v) => setStallDays(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 7, 14, 30].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} days of no movement
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!isLoading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clients match this view.</p>
          ) : null}

          {rows.map((row: any) => (
            <div key={row.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-medium">{row.name}</h3>
                    {row.stalled ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Stalled {row.quietFor}d
                      </Badge>
                    ) : null}
                    {!row.nextStage ? <Badge variant="secondary">Fully onboarded</Badge> : null}
                    {row.overdueInvoices > 0 ? (
                      <Badge variant="destructive">{row.overdueInvoices} overdue</Badge>
                    ) : null}
                    {row.capTablePlan ? (
                      <Badge variant="outline" className="gap-1">
                        Cap table: {row.capTablePlan}
                      </Badge>
                    ) : null}
                    {row.status !== "active" ? <Badge variant="outline">{row.status}</Badge> : null}
                  </div>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {row.contactEmail ?? "No contact recorded"} · {row.contactCount} contact
                    {row.contactCount === 1 ? "" : "s"} · last movement {when(row.lastActivity)}
                    {row.signInCount > 0 ? (
                      <>
                        {" "}
                        · {row.signInCount} sign-in{row.signInCount === 1 ? "" : "s"}, last{" "}
                        {when(row.lastSignIn)}
                      </>
                    ) : (
                      <> · no sign-ins yet</>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {row.complete}/{row.total} stages
                  </span>
                  {row.unpaidCents > 0 ? (
                    <span className="text-muted-foreground">{money(row.unpaidCents)} outstanding</span>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/onboarding">Open onboarding</Link>
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {row.stages.map((stage: any) => (
                  <div
                    key={stage.key}
                    className={`rounded-md border p-3 text-sm ${
                      stage.done
                        ? "border-primary/30 bg-primary/5"
                        : row.nextStage === stage.label
                          ? "border-destructive/40"
                          : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {stage.done ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{stage.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{stage.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{when(stage.at)}</p>
                  </div>
                ))}
              </div>

              {row.nextStage ? (
                <p className="mt-3 text-sm">
                  Next: <span className="font-medium">{row.nextStage}</span>
                </p>
              ) : null}

              {(row.contacts ?? []).length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contacts — sign-ins and document sign-off
                  </p>
                  {(row.contacts as any[]).map((contact) => (
                    <div
                      key={contact.userId}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {contact.name ?? contact.email ?? "Portal contact"}
                        </p>
                        {contact.name && contact.email ? (
                          <p className="truncate text-xs text-muted-foreground">{contact.email}</p>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {contact.signInCount > 0
                          ? `${contact.signInCount} sign-in${contact.signInCount === 1 ? "" : "s"} · last ${when(contact.lastSignInAt)}`
                          : "Never signed in"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {contact.docsAccepted}/{contact.docsTotal} documents
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(contact.documents as any[]).map((doc) => (
                          <Badge
                            key={doc.kind}
                            variant={doc.accepted ? "secondary" : "outline"}
                            className="gap-1 text-xs"
                            title={doc.title}
                          >
                            {doc.accepted ? <Check className="h-3 w-3" /> : null}
                            {doc.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
