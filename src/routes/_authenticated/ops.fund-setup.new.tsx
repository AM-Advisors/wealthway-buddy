import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStaffClients, listStaffFunds } from "@/lib/staff-funds.functions";
import { FundRequestEngine } from "@/components/fund-request-engine";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ops/fund-setup/new")({
  validateSearch: (s: Record<string, unknown>): { clientId?: string; draft?: string } => ({
    ...(typeof s["clientId"] === "string" ? { clientId: s["clientId"] } : {}),
    ...(typeof s["draft"] === "string" ? { draft: s["draft"] } : {}),
  }),
  head: () => ({ meta: [
    { title: "Add Fund or SPV | Harmonious" },
    { name: "description", content: "Set up a new fund or SPV for a client with the same guided steps clients use." },
    { property: "og:title", content: "Add Fund or SPV | Harmonious" },
    { property: "og:description", content: "Set up a new fund or SPV for a client with the same guided steps clients use." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: NewFundSetup,
});

function NewFundSetup() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const loadFunds = useServerFn(listStaffFunds);
  const listClients = useServerFn(listStaffClients);
  const perm = useQuery({ queryKey: ["staff-funds"], queryFn: () => loadFunds(), retry: false });
  const clients = useQuery({ queryKey: ["staff-fund-clients"], queryFn: () => listClients(), enabled: !!perm.data?.canPrepare, retry: false });
  // The chosen client lives in the page address, so a refresh or a page redraw never clears it.
  const clientId = search.clientId ?? "";
  const setClientId = (next: string) => {
    if (!next || next === clientId) return;
    void navigate({ search: (prev: { clientId?: string; draft?: string }) => ({ ...prev, clientId: next }), replace: true });
  };

  if (perm.isPending) return <main className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading…</main>;
  // A failed background re-check must not close the form (that would erase what's been typed); only a first check can.
  if (!perm.data) return <main className="mx-auto max-w-5xl p-6 text-sm">We couldn't check your access. Refresh the page to try again.</main>;
  if (!perm.data.canPrepare) return <main className="mx-auto max-w-5xl p-6 text-sm">Only Operations staff and Account Managers can set up funds.</main>;

  const picker = (
    <div className="max-w-md space-y-1">
      <Label>Client *</Label>
      <Select value={clientId} onValueChange={setClientId}>
        <SelectTrigger aria-label="Client"><SelectValue placeholder={clients.isPending ? "Loading clients…" : "Select a Client"} /></SelectTrigger>
        <SelectContent>{(clients.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  return (
    <main className="mx-auto max-w-5xl bg-background px-4 py-6">
      {/* Only opening a different saved draft starts the form over; choosing or changing the client keeps every answer. */}
      <FundRequestEngine key={search.draft ?? "new"} clientId={clientId || null} draft={search.draft} mode="staff" clientPicker={picker} backTo={{ to: "/ops/funds", label: "Funds" }} />
    </main>
  );
}
