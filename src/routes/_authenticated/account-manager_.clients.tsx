import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accountBookFn } from "@/lib/staff-roles.functions";
import { setClientTeamMember } from "@/lib/harmonious-team.functions";

export const Route = createFileRoute("/_authenticated/account-manager_/clients")({
  head: () => ({
    meta: [
      { title: "My clients - Account management - Harmonious" },
      { name: "description", content: "Account Manager client books: funds, setup progress and client health." },
      { property: "og:title", content: "My clients - Account management - Harmonious" },
      { property: "og:description", content: "Client books for Harmonious Account Managers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountManagerPage,
});

const tone = (h: string) => (h === "Healthy" ? "secondary" : h === "Needs attention" ? "destructive" : "outline") as "secondary" | "destructive" | "outline";

function AccountManagerPage() {
  const load = useServerFn(accountBookFn);
  const assign = useServerFn(setClientTeamMember);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["account-book"], queryFn: () => load(), retry: false });
  const m = useMutation({
    mutationFn: (v: { clientId: string; userId: string }) => assign({ data: { clientId: v.clientId, role: "account_manager", userId: v.userId } }),
    onSuccess: () => { toast.success("Account Manager changed"); qc.invalidateQueries({ queryKey: ["account-book"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.error) return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-3xl">My clients</h1><p className="mt-4 text-sm text-muted-foreground">{(q.error as Error).message}</p></main>;
  const d = q.data;
  const counts = d ? { total: d.book.length, attention: d.book.filter((c) => c.health === "Needs attention").length, setup: d.book.reduce((s, c) => s + c.inSetup, 0) } : null;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl">My clients</h1>
        <p className="mt-2 text-sm text-muted-foreground">{d?.team ? "Every Account Manager's clients." : "Your assigned clients."} Assignment is for ownership only and never changes anyone's access.</p>
      </header>
      {counts && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Clients" value={counts.total} />
          <Stat label="Need attention" value={counts.attention} />
          <Stat label="Funds in setup" value={counts.setup} />
        </div>
      )}
      <section className="rounded-lg border">
        {!d ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : d.book.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No clients assigned yet. Assign an Account Manager on a client's page.</p>
        ) : (
          <ul className="divide-y">
            {d.book.map((c) => (
              <li key={c.clientId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link to="/ops/clients/$clientId" params={{ clientId: c.clientId }} search={{} as any} className="font-medium hover:underline">{c.name}</Link>
                  <p className="text-xs text-muted-foreground">{c.funds} funds · {c.inSetup} in setup{c.stale ? ` · ${c.stale} quiet 30+ days` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={tone(c.health)}>{c.health}</Badge>
                  {d.team ? (
                    <Select value={c.accountManagerId ?? ""} onValueChange={(v) => m.mutate({ clientId: c.clientId, userId: v })}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="Account Manager" /></SelectTrigger>
                      <SelectContent>{d.accountManagers.map((a) => <SelectItem key={a.userId} value={a.userId}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>;
}
