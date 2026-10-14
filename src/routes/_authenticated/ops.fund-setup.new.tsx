import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listStaffClients, listStaffFunds } from "@/lib/staff-funds.functions";
import { FundRequestEngine } from "@/components/fund-request-engine";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ops/fund-setup/new")({
  validateSearch: (s: Record<string, unknown>): { clientId?: string } => (typeof s["clientId"] === "string" ? { clientId: s["clientId"] } : {}),
  head: () => ({ meta: [
    { title: "Add Fund or SPV - Harmonious" },
    { name: "description", content: "Set up a new fund or SPV for a client with the same guided steps clients use." },
    { property: "og:title", content: "Add Fund or SPV - Harmonious" },
    { property: "og:description", content: "Set up a new fund or SPV for a client with the same guided steps clients use." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: NewFundSetup,
});

function NewFundSetup() {
  const search = Route.useSearch();
  const loadFunds = useServerFn(listStaffFunds);
  const listClients = useServerFn(listStaffClients);
  const perm = useQuery({ queryKey: ["staff-funds"], queryFn: () => loadFunds(), retry: false });
  const clients = useQuery({ queryKey: ["staff-fund-clients"], queryFn: () => listClients(), enabled: !!perm.data?.canPrepare, retry: false });
  const [clientId, setClientId] = useState(search.clientId ?? "");

  if (perm.isPending) return <main className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading…</main>;
  if (perm.isError || !perm.data?.canPrepare) return <main className="mx-auto max-w-5xl p-6 text-sm">Only Operations staff and Account Managers can set up funds.</main>;

  const picker = (
    <div className="max-w-md space-y-1">
      <Label>Client *</Label>
      <Select value={clientId} onValueChange={setClientId}>
        <SelectTrigger><SelectValue placeholder="Select a Client" /></SelectTrigger>
        <SelectContent>{(clients.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  return (
    <main className="mx-auto max-w-5xl bg-background px-4 py-6">
      <FundRequestEngine key={clientId || "none"} clientId={clientId || null} mode="staff" clientPicker={picker} backTo={{ to: "/ops/fund-setup", label: "Fund Setup" }} />
    </main>
  );
}
