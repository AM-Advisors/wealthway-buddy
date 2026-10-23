import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { contactWorkspaceFn } from "@/lib/investor-helpers.functions";

export const Route = createFileRoute("/onboard/contact/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Investment Overview | Harmonious" },
      { name: "description", content: "View-only access to an investment you're a point of contact for." },
      { property: "og:title", content: "Investment Overview | Harmonious" },
      { property: "og:description", content: "Secure view-only investment access by Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: location.pathname } as never });
  },
  component: ContactPage,
});

const usd = (c: number | null) => (c == null ? "-" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const lbl = (s: string | null | undefined) => (s ?? "not started").replace(/_/g, " ");

function ContactPage() {
  const { token } = Route.useParams();
  const load = useServerFn(contactWorkspaceFn);
  const q = useQuery({ queryKey: ["contact-workspace", token], queryFn: () => load({ data: { token } }) });
  const d = q.data;
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.isError ? (
        <Card><CardContent className="space-y-2 p-6"><p className="text-sm text-destructive">{(q.error as Error).message}</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Try again</Button></CardContent></Card>
      ) : d && (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{d.fundName}</h1>
            <p className="text-muted-foreground">{d.investingAs} · view only</p>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Investment</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div><p className="text-muted-foreground">Commitment</p><p className="font-medium">{usd(d.commitmentCents)}</p></div>
              <div><p className="text-muted-foreground">Received</p><p className="font-medium">{usd(d.fundedCents)}</p></div>
              <div><p className="text-muted-foreground">Status</p><p className="font-medium capitalize">{lbl(d.stage)}</p></div>
              <div><p className="text-muted-foreground">Funding</p><p className="font-medium capitalize">{lbl(d.fundingStatus)}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">People</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{d.primary.name || "Primary investor"}</span><Badge variant="outline" className="capitalize">Identity: {lbl(d.primary.kyc)}</Badge></div>
              {d.people.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2"><span>{p.name} · <span className="capitalize">{lbl(p.role)}</span>{p.signer ? " · signer" : ""}</span><Badge variant="outline" className="capitalize">Identity: {lbl(p.kyc)}</Badge></div>
              ))}
              {d.contacts.length > 0 && <p className="pt-2 text-xs text-muted-foreground">Also on this investment: {d.contacts.map((c) => `${c.name} (${c.role})`).join(", ")}</p>}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">You can view this investment. Details, signing and funding are handled by the investor and their named signer.</p>
        </>
      )}
    </main>
  );
}
