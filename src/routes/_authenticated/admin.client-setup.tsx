import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { WhitelabelEditor } from "@/components/client-whitelabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WHITELABEL_STATUS_LABEL, isWhitelabelActive } from "@/lib/client-branding";
import { listClientSetup, setFreeWhitelabel } from "@/lib/client-branding.functions";

export const Route = createFileRoute("/_authenticated/admin/client-setup")({
  head: () => ({
    meta: [
      { title: "Client setup options - Harmonious Operations" },
      { name: "description", content: "Manage white-labeling and branding for each client." },
      { property: "og:title", content: "Client setup options - Harmonious" },
      { property: "og:description", content: "White-label status and branding per client." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientSetupAdmin,
});

const KEY = ["client-setup-admin"];

function ClientSetupAdmin() {
  const fn = useServerFn(listClientSetup);
  const q = useQuery({ queryKey: KEY, queryFn: () => fn() });
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const rows = (q.data?.clients ?? []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Client setup options</h1>
        <p className="text-sm text-muted-foreground">White-labeling costs $100/month by card. A Super Administrator can unlock it for free.</p>
      </div>
      <Input placeholder="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {rows.map((c) => {
        const status = c.branding?.whitelabel_status ?? "off";
        return (
          <Card key={c.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">{c.name}</CardTitle>
                <CardDescription><Badge variant={isWhitelabelActive(status) ? "default" : "secondary"}>{WHITELABEL_STATUS_LABEL[status]}</Badge></CardDescription>
              </div>
              <div className="flex gap-2">
                {q.data?.isSuperAdmin && <FreeUnlock clientId={c.id} unlocked={status === "unlocked_free"} />}
                <Button variant="outline" size="sm" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Close" : "Branding"}</Button>
              </div>
            </CardHeader>
            {open === c.id && (
              <CardContent>
                <WhitelabelEditor clientId={c.id} branding={c.branding} canEdit queryKey={KEY} />
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function FreeUnlock({ clientId, unlocked }: { clientId: string; unlocked: boolean }) {
  const qc = useQueryClient();
  const fn = useServerFn(setFreeWhitelabel);
  const m = useMutation({
    mutationFn: (reason: string) => fn({ data: { clientId, unlock: !unlocked, reason } }),
    onSuccess: () => { toast.success(unlocked ? "White-label turned off." : "White-label unlocked for free."); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Button size="sm" variant={unlocked ? "ghost" : "default"} disabled={m.isPending} onClick={() => {
      const reason = window.prompt(unlocked ? "Reason for turning white-label off:" : "Reason for unlocking free:");
      if (reason && reason.trim().length >= 3) m.mutate(reason.trim());
    }}>
      {unlocked ? "Remove free unlock" : "Unlock free"}
    </Button>
  );
}
