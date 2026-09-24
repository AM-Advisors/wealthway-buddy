import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { contractCapabilitiesFor } from "@/lib/contract-intelligence";
import { listContractGrants, setContractGrant } from "@/lib/contract-intelligence.functions";

export const Route = createFileRoute("/_authenticated/ops/contracts/permissions")({
  head: () => ({
    meta: [
      { title: "Contract permissions — Harmonious operations" },
      { name: "description", content: "Granular contract permissions for Harmonious staff." },
      { property: "og:title", content: "Contract permissions — Harmonious operations" },
      { property: "og:description", content: "Who may upload, review, approve and price contracts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Permissions,
});

function Permissions() {
  const load = useServerFn(listContractGrants);
  const set = useServerFn(setContractGrant);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["contract-grants"], queryFn: () => load() });
  if (q.isPending) return <Skeleton className="m-6 h-96" />;
  if (q.error) return <p className="p-6 text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const d = q.data as any;
  const active = (uid: string) => d.grants.filter((g: any) => g.user_id === uid && !g.revoked_at).map((g: any) => g.capability);

  return (
    <div className="space-y-4 px-4 py-6">
      <h1 className="text-2xl">Contract permissions</h1>
      <p className="text-sm text-muted-foreground">
        Greyed boxes come from the person's role. Ticked extra boxes are explicit grants, recorded with a reason. Ordinary Operations access never includes approval, and Fund Managers can't hold these.
      </p>
      <Card>
        <CardHeader><CardTitle className="text-base">Harmonious staff</CardTitle><CardDescription>Changes are audited. You can't change your own.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="p-1 text-left">Person</th>
                {d.capabilities.map((c: any) => <th key={c.value} className="p-1 text-left font-normal">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {d.staff.map((p: any) => {
                const base = contractCapabilitiesFor(p.roles);
                const grants = active(p.user_id);
                return (
                  <tr key={p.user_id} className="border-t">
                    <td className="p-1">{p.legal_name ?? p.email}<div className="text-muted-foreground">{p.roles.join(", ")}</div></td>
                    {d.capabilities.map((c: any) => {
                      const fromRole = (base as string[]).includes(c.value);
                      return (
                        <td key={c.value} className="p-1">
                          <input type="checkbox" aria-label={`${c.label} for ${p.email}`} disabled={fromRole} checked={fromRole || grants.includes(c.value)}
                            onChange={async (e) => {
                              const reason = window.prompt("Reason for this change?");
                              if (!reason) return;
                              try {
                                await set({ data: { userId: p.user_id, capability: c.value, grant: e.target.checked, reason } });
                                qc.invalidateQueries({ queryKey: ["contract-grants"] });
                              } catch (err) { toast.error((err as Error).message); }
                            }} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
