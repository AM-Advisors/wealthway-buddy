import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { getFundDemoFn, setFundDemoFn } from "@/lib/staff-funds.functions";

/** Display-only demo flag for staff. Asks for a reason; logged in Audit History. */
export function DemoFundToggle({ fundId }: { fundId: string }) {
  const get = useServerFn(getFundDemoFn);
  const set = useServerFn(setFundDemoFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-demo", fundId], queryFn: () => get({ data: { fundId } }), retry: false });
  if (!q.data) return null;
  const on = q.data.isDemo;
  const change = async (v: boolean) => {
    const reason = window.prompt(v ? "Why is this a demo fund?" : "Why is this a real fund again?");
    if (!reason || reason.trim().length < 3) return;
    try {
      await set({ data: { fundId, isDemo: v, reason } });
      toast.success(v ? "Marked as demo fund" : "Now shown as a real fund");
      qc.invalidateQueries({ queryKey: ["fund-demo", fundId] });
      qc.invalidateQueries({ queryKey: ["ops-funds-dashboard"] });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
      <Switch checked={on} onCheckedChange={change} aria-label="Demo fund" />Demo fund
    </label>
  );
}
