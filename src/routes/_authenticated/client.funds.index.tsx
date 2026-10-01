import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useClientPortal } from "@/components/client-portal-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/client/funds/")({
  head: () => ({
    meta: [
      { title: "Your funds — Harmonious" },
      {
        name: "description",
        content:
          "The funds Harmonious administers for you, with legal entity, exemption and formation details.",
      },
      { property: "og:title", content: "Your funds — Harmonious" },
      {
        property: "og:description",
        content: "The funds Harmonious administers for you under your agreement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientFundsPage,
});

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

function ClientFundsPage() {
  const { data } = useClientPortal();
  const all = (data?.funds ?? []) as any[];
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "open" | "setup">("all");
  const funds = all.filter(
    (f) =>
      (show === "all" || (show === "open" ? f.is_open : !f.is_open)) &&
      `${f.name} ${f.legal_entity_name ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );
  const openCount = all.filter((f) => f.is_open).length;

  return (
    <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { l: "Funds", v: all.length },
        { l: "Open to investors", v: openCount },
        { l: "In setup", v: all.length - openCount },
      ].map((k) => (
        <Card key={k.l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.l}</p><p className="text-2xl font-semibold">{k.v}</p></CardContent></Card>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Input className="max-w-xs" placeholder="Search funds" value={q} onChange={(e) => setQ(e.target.value)} />
      {(["all", "open", "setup"] as const).map((k) => (
        <Button key={k} size="sm" variant={show === k ? "default" : "outline"} onClick={() => setShow(k)}>
          {k === "all" ? "All" : k === "open" ? "Open" : "In setup"}
        </Button>
      ))}
      <Button asChild size="sm" className="ml-auto"><Link to="/client/services/request">Launch a new fund or SPV</Link></Button>
    </div>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Funds we administer for you</CardTitle>
        <CardDescription>
          Harmonious provides administration, technology, onboarding, reporting, payment
          facilitation and recordkeeping support for these funds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {funds.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {all.length === 0 ? "No funds are attached to your engagement yet." : "No funds match this filter."}
          </p>
        )}
        {funds.map((f) => (
          <div key={f.id} className="rounded-md border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {f.legal_entity_name ? `${f.legal_entity_name} · ` : ""}
                  {f.reg_type ? `Reg D ${f.reg_type}` : "Exemption not recorded"}
                  {f.target_raise_cents ? ` · target ${money(Number(f.target_raise_cents))}` : ""}
                </p>
              </div>
              <Badge variant={f.is_open ? "default" : "secondary"}>
                {f.is_open ? "Open" : "Closed"}
              </Badge>
            </div>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Legal entity</dt>
                <dd className="font-medium">{f.legal_entity_name || "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Type</dt>
                <dd className="font-medium">
                  {(f.fund_type === "other" ? f.fund_type_other : f.fund_type) || "Not recorded"}
                  {f.entity_type ? ` · ${f.entity_type}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">State formed</dt>
                <dd className="font-medium">{f.state_formed || "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date formed</dt>
                <dd className="font-medium">
                  {f.date_formed
                    ? new Date(f.date_formed).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Not recorded"}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm"><Link to="/client/funds/$fundId" params={{ fundId: f.id }}>Open fund</Link></Button>
              </div>
            {!f.is_open ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Harmonious is setting this fund up. It stays closed to investors until your
                statement of work is signed and approved.
              </p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
    </div>
  );
}
