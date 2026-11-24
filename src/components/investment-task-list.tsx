import { Badge } from "@/components/ui/badge";
import type { InvestorOutstandingTask } from "@/lib/investor-outstanding-tasks";

export function InvestmentTaskList({ tasks }: { tasks: readonly InvestorOutstandingTask[] }) {
  if (!tasks.length) return null;
  return <ul className="divide-y" aria-label="Outstanding investment tasks">
    {tasks.map((t) => <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span className="text-base font-medium">{t.label}</span>
      <Badge variant={t.actionable ? "secondary" : "outline"}>{t.status}</Badge>
    </li>)}
  </ul>;
}