import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getFundRequestOptions } from "@/lib/self-service.functions";
import { FundRequestEngine } from "@/components/fund-request-engine";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/manager/request-fund")({
  head: () => ({
    meta: [
      { title: "Add Fund or SPV | Harmonious" },
      { name: "description", content: "Set up a new fund or SPV with the same guided steps Harmonious uses." },
      { property: "og:title", content: "Add Fund or SPV | Harmonious" },
      { property: "og:description", content: "Set up a new fund or SPV with the same guided steps Harmonious uses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestFund,
});

function RequestFund() {
  const loadOptions = useServerFn(getFundRequestOptions);
  const options = useQuery({ queryKey: ["fund-request-options"], queryFn: () => loadOptions() });
  const clients = ((options.data as any)?.clients ?? []) as { id: string; name: string }[];
  const [picked, setPicked] = useState("");
  const clientId = picked || clients[0]?.id || null;
  if (options.isPending) return <main className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading…</main>;
  if (!clients.length) return <main className="mx-auto max-w-5xl p-6 text-sm">Your login isn't linked to a client organization yet. Ask Harmonious to add you.</main>;
  const picker = clients.length > 1 ? (
    <div className="max-w-md space-y-1">
      <Label>Organization</Label>
      <Select value={clientId ?? ""} onValueChange={setPicked}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  ) : null;
  return (
    <main className="mx-auto max-w-5xl bg-background px-4 py-6">
      <FundRequestEngine key={clientId ?? "none"} clientId={clientId} mode="client" clientPicker={picker} backTo={{ to: "/manager", label: "Home" }} />
    </main>
  );
}
