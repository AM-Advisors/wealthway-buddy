import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  acceptSubscriptionFn,
  closeInvestmentFn,
  raiseExceptionFn,
  resolveExceptionFn,
  reviewDetailFn,
  reviewQueueFn,
} from "@/lib/investor-onboarding.functions";
import { matchesQueueSearch } from "@/lib/review-queue-label";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const money = (cents: number | null | undefined) =>
  cents == null ? "-" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function InvestorOnboardingOps({ initialOnboardingId = null }: { initialOnboardingId?: string | null } = {}) {
  const qc = useQueryClient();
  const queueFn = useServerFn(reviewQueueFn);
  const detailFn = useServerFn(reviewDetailFn);
  const acceptFn = useServerFn(acceptSubscriptionFn);
  const closeFn = useServerFn(closeInvestmentFn);
  const raiseFn = useServerFn(raiseExceptionFn);
  const resolveFn = useServerFn(resolveExceptionFn);

  // A link to one investor (?onboarding=) opens that investor's review directly.
  const [selected, setSelected] = useState<string | null>(initialOnboardingId);
  const [signer, setSigner] = useState("");
  const [capacity, setCapacity] = useState("");
  const [search, setSearch] = useState("");
  const reviewRef = useRef<HTMLDivElement>(null);

  const queue = useQuery({ queryKey: ["onboarding-queue"], queryFn: () => queueFn({ data: {} }) });
  const detail = useQuery({
    queryKey: ["onboarding-review", selected],
    queryFn: () => detailFn({ data: { onboardingId: selected! } }),
    enabled: Boolean(selected),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["onboarding-queue"] });
    void qc.invalidateQueries({ queryKey: ["onboarding-review", selected] });
  };
  const act = (fn: (v: any) => Promise<unknown>, ok: string) =>
    useMutation({
      mutationFn: (v: any) => fn(v),
      onSuccess: () => {
        toast.success(ok);
        refresh();
      },
      onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
    });

  const raise = act(raiseFn, "Issue raised.");
  const resolve = act(resolveFn, "Issue resolved.");

  const items: any[] = (queue.data as any)?.items ?? [];
  const shown = useMemo(() => items.filter((i) => matchesQueueSearch(i, search)), [items, search]);
  const current = items.find((i) => i.id === selected) ?? null;
  const d: any = detail.data;

  const choose = (id: string) => {
    setSelected(id);
    setSigner("");
    setCapacity("");
    // On narrow screens the review sits below the list; bring it into view so it is clear it opened.
    requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="lg:sticky lg:top-4">
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>Review queue</CardTitle>
            <CardDescription>Every investor waiting on Harmonious.</CardDescription>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              aria-label="Search investors"
              placeholder="Search by investor, email, fund or status"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8"
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {!queue.isLoading && items.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {search.trim() ? `Showing ${shown.length} of ${items.length} investors` : `${items.length} investor${items.length === 1 ? "" : "s"} waiting`}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto">
          {queue.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {items.length === 0 && !queue.isLoading ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting right now.</p>
          ) : null}
          {items.length > 0 && shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No investors match "{search.trim()}".</p>
          ) : null}
          {shown.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected === item.id}
              onClick={() => choose(item.id)}
              className={`w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                selected === item.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{item.investorName ?? "Investor"}</span>
                <Badge variant="outline" className="shrink-0">{String(item.bucket ?? item.stage).replace(/_/g, " ")}</Badge>
              </div>
              {item.contactName || item.investorEmail ? (
                <div className="truncate text-xs text-muted-foreground">
                  {[item.contactName, item.investorEmail].filter(Boolean).join(" · ")}
                </div>
              ) : null}
              <div className="text-muted-foreground">
                {item.offeringName ?? item.offeringId} · {money(item.requestedAmountCents)}
              </div>
              {item.materialCorrections > 0 ? (
                <div className="mt-1 text-xs font-medium text-destructive">Investor corrected {item.materialCorrections} prepared detail{item.materialCorrections === 1 ? "" : "s"} - review requirements</div>
              ) : null}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card ref={reviewRef} className="scroll-mt-4 lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle>Investment review</CardTitle>
          <CardDescription>
            Approval, acceptance and closing stay with Harmonious.
          </CardDescription>
          {current ? (
            <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Now reviewing</div>
              <div className="text-base font-semibold">{current.investorName}</div>
              <div className="text-muted-foreground">
                {[current.contactName, current.investorEmail].filter(Boolean).join(" · ")}
                {current.contactName || current.investorEmail ? <br /> : null}
                {current.offeringName} · {money(current.requestedAmountCents)}
              </div>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Choose an investor on the left.</p>
          ) : detail.isLoading || !d ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {(d.requirements ?? []).map((r: any) => (
                  <div key={r.key} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{r.label}</span>
                    <Badge variant="outline">{String(r.state).replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>

              <div className="text-sm text-muted-foreground">
                Requested {money(d.onboarding?.requested_amount_cents)} · Accepted{" "}
                {money(d.onboarding?.accepted_amount_cents)} · Received{" "}
                {money(d.onboarding?.funded_amount_cents)}
              </div>

              <div className="flex flex-wrap gap-2">
                {d.onboarding?.stage === "harmonious_review" && <p className="text-sm text-muted-foreground">Awaiting the fund manager’s subscription approval.</p>}
                <Button
                  variant="outline"
                  onClick={() =>
                    raise.mutate({
                      data: { onboardingId: selected, type: "information_requested", severity: "blocking" },
                    })
                  }
                >
                  Request more information
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="signer">Accepting signer</Label>
                  <Input id="signer" value={signer} onChange={(e) => setSigner(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="cap">Capacity</Label>
                  <Input id="cap" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={signer.trim().length < 2 || capacity.trim().length < 2}
                  onClick={async () => {
                    try {
                      if (!d.onboarding?.accepted_at) await acceptFn({ data: { onboardingId: selected, signerName: signer.trim(), capacity: capacity.trim() } });
                      await closeFn({ data: { onboardingId: selected } });
                      toast.success("Accepted and admitted.");
                    } catch (e: any) {
                      toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, ""));
                    }
                    refresh();
                  }}
                >
                  Accept & admit
                </Button>
              </div>

              {(d.exceptions ?? []).filter((e: any) => e.status === "open").length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Open issues</h3>
                  {(d.exceptions ?? [])
                    .filter((e: any) => e.status === "open")
                    .map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                        <span>
                          {String(e.exception_type).replace(/_/g, " ")} · {e.detail ?? "no detail"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            resolve.mutate({ data: { exceptionId: e.id, resolution: "Resolved by Harmonious" } })
                          }
                        >
                          Resolve
                        </Button>
                      </div>
                    ))}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
