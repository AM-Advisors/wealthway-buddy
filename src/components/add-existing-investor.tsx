import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { addExistingInvestorToFund, searchExistingInvestors } from "@/lib/invitations.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export function AddExistingInvestor({ fundId }: { fundId: string }) {
  const search = useServerFn(searchExistingInvestors);
  const add = useServerFn(addExistingInvestorToFund);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const term = q.trim();
  const { data, isFetching, error } = useQuery({
    queryKey: ["existing-investor-search", fundId, term],
    queryFn: () => search({ data: { fundId, q: term } }),
    enabled: term.length >= 2,
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Add existing investor</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, or entity / trust / IRA name" />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />Send invitation email</label>
        {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
        {isFetching ? <p className="text-sm text-muted-foreground">Searching…</p> : null}
        <div className="divide-y rounded-md border">
          {(data ?? []).map((p: any) => (
            <div key={p.userId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.email}{p.profiles.length ? ` · ${p.profiles.join(", ")}` : ""}</p></div>
              {p.alreadyAdded ? <Badge variant="secondary">Already added</Badge> : (
                <Button size="sm" disabled={busy === p.userId} onClick={async () => {
                  setBusy(p.userId);
                  try {
                    const r = await add({ data: { fundId, userId: p.userId, sendEmail } });
                    toast.success(r.status === "already_added" ? "Already added to this fund" : "Added to this fund");
                    await qc.invalidateQueries({ queryKey: ["existing-investor-search", fundId] });
                    await qc.invalidateQueries({ queryKey: ["manager-fund-home", fundId] });
                  } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
                }}>Add to this fund</Button>
              )}
            </div>
          ))}
          {term.length >= 2 && data && data.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No one matches. Use Invite New Investor instead.</p> : null}
        </div>
        <p className="text-xs text-muted-foreground">Adding gives access to this fund only. Their existing profiles and other funds are unchanged, and onboarding still has to be completed.</p>
      </CardContent>
    </Card>
  );
}
