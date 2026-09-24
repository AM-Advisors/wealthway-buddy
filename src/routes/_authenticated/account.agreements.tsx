import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformAgreements } from "@/lib/my-funds.functions";

export const Route = createFileRoute("/_authenticated/account/agreements")({
  head: () => ({
    meta: [
      { title: "Agreements & Policies — Harmonious" },
      { name: "description", content: "Platform terms, e-sign consent, privacy and pricing acknowledgments you have accepted, with full history." },
      { property: "og:title", content: "Agreements & Policies — Harmonious" },
      { property: "og:description", content: "Your accepted platform agreements and their history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgreementsPage,
});

const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");

function Rows({ rows, empty }: { rows: any[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3 text-sm">
          <div>
            <p className="font-medium">{r.label}</p>
            <p className="text-xs text-muted-foreground">Version {r.version} · accepted {when(r.acceptedAt)}{r.acceptedBy ? ` by ${r.acceptedBy}` : ""}</p>
          </div>
          <Badge variant={r.current ? "secondary" : "outline"}>{r.current ? "Current" : "Superseded"}</Badge>
        </div>
      ))}
    </div>
  );
}

function AgreementsPage() {
  const load = useServerFn(getPlatformAgreements);
  const q = useQuery({ queryKey: ["platform-agreements"], queryFn: () => load() });
  const d = q.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agreements & Policies</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform-wide acknowledgments. Your fund and client contracts are under Documents.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Platform Agreements</CardTitle><CardDescription>Terms, electronic records consent, privacy and migration terms.</CardDescription></CardHeader>
        <CardContent><Rows rows={d?.agreements ?? []} empty={q.isLoading ? "Loading…" : "Nothing accepted yet."} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Pricing & Commercial Terms</CardTitle><CardDescription>Platform-level pricing acknowledgments — not fund SOWs.</CardDescription></CardHeader>
        <CardContent><Rows rows={d?.pricing ?? []} empty={q.isLoading ? "Loading…" : "No pricing acknowledgments."} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle><CardDescription>Every version you've accepted is kept.</CardDescription></CardHeader>
        <CardContent><Rows rows={d?.history ?? []} empty={q.isLoading ? "Loading…" : "No history yet."} /></CardContent>
      </Card>
    </div>
  );
}
