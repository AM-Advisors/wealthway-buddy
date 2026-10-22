import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { upgradeFundServiceLevel } from "@/lib/service-level-upgrade.functions";

const LEVELS = [["core", "Core"], ["plus", "Plus"], ["white_glove", "White Glove"], ["institutional", "Institutional"]] as const;

/** Confirms a paid service level after payment is received; moving up from Self Serve emails the account manager introduction. */
export function ServiceLevelUpgradeCard({ fundId }: { fundId: string }) {
  const fn = useServerFn(upgradeFundServiceLevel);
  const [level, setLevel] = useState<(typeof LEVELS)[number][0]>("core");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await fn({ data: { fundId, level, reason } }); toast.success(r.emailed ? `Level updated. Account manager introduction emailed to ${r.emailed} fund manager(s).` : "Level updated."); setReason(""); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Service level upgrade</CardTitle><CardDescription>Use once payment for the paid level is received. Moving up from Self Serve emails the fund managers an introduction to their account manager.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <select aria-label="Service level" className="h-9 rounded-md border bg-background px-2 text-sm" value={level} onChange={(e) => setLevel(e.target.value as any)}>
          {LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Input className="max-w-sm" placeholder="Payment reference or reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button disabled={busy || reason.trim().length < 3} onClick={go}>Confirm paid level</Button>
      </CardContent>
    </Card>
  );
}
