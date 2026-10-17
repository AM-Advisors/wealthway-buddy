import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { launchStatusFn, decideLaunchFn, launchFundFn } from "@/lib/fund-setup.functions";

/** Self-serve launch for fund managers. The server re-checks every requirement. */
export function ManagerLaunchCard({ fundId }: { fundId: string }) {
  const status = useServerFn(launchStatusFn);
  const decide = useServerFn(decideLaunchFn);
  const launch = useServerFn(launchFundFn);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["launch-status", fundId], queryFn: () => status({ data: { offeringId: fundId } }) });
  const s = q.data;
  if (!s || s.launchState === "launched") return null;
  const run = async () => {
    setBusy(true);
    try {
      if (s.launchState !== "ready") await decide({ data: { setupId: s.setupId, decision: "approved" } });
      await launch({ data: { setupId: s.setupId } });
      toast.success("Fund launched for investor onboarding");
      void q.refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="text-lg">Launch</h2>
      {s.blockers.length ? (
        <>
          <p className="text-sm text-muted-foreground">Finish these before launching:</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{s.blockers.map((b) => <li key={b.key}>{b.label}</li>)}</ul>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Everything is complete. You can open investor onboarding.</p>
          <Button size="sm" disabled={busy} onClick={() => { if (window.confirm("Launch this fund for investor onboarding?")) void run(); }}>Launch fund</Button>
        </div>
      )}
    </section>
  );
}
