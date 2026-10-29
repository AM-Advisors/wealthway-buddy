import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MANAGER_RESPONSIBILITIES, managerNextAction, type ManagerWorkItem } from "@/lib/fund-manager-responsibility";

export function FundManagerNextAction({ items, today, managerName, onNavigate }: { items: readonly ManagerWorkItem[]; today: string; managerName: string; onNavigate: (area: string) => void }) {
  const next = managerNextAction(items, today);
  return <section aria-label="Fund manager responsibilities" className="space-y-4 border-y py-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-muted-foreground">Responsible: {managerName}</p>
        <h2 className="font-heading text-xl">{next ? "Next action" : "No action waiting"}</h2>
        {next ? <><p className="break-words text-base font-medium">{next.title}</p><p className="text-sm text-muted-foreground">{next.waitingOn ? `Waiting on: ${next.waitingOn}` : "Ready for fund manager review"}{next.due ? ` · ${next.due < today ? "Overdue since" : "Due"} ${next.due}` : ""}</p></> : <CheckCircle2 className="size-5 text-primary" aria-hidden />}
      </div>
      {next && <Button className="min-h-11" onClick={() => onNavigate(next.area)}>Continue<ArrowRight className="size-4" aria-hidden /></Button>}
    </div>
    <details className="text-sm">
      <summary className="cursor-pointer py-2 font-medium">All responsibilities{items.length ? ` · ${items.length} open items` : ""}</summary>
      {items.length > 0 && <ul aria-label="Open fund work" className="divide-y">{items.map(item => <li key={item.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-medium">{item.title}</p>{item.waitingOn && <p className="text-muted-foreground">Waiting on: {item.waitingOn}</p>}{item.due && <p className="text-muted-foreground">{item.due < today ? "Overdue since" : "Due"}: {item.due}</p>}</div><Button size="icon" variant="ghost" aria-label={`Open ${item.title}`} title={`Open ${item.title}`} onClick={() => onNavigate(item.area)}><ArrowRight className="size-4" /></Button></li>)}</ul>}
      <ul className="divide-y">{MANAGER_RESPONSIBILITIES.map(item => <li key={item.key} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium">{item.label}</p><p className="mt-1 text-muted-foreground">{item.safeguard}</p></div><Button size="icon" variant="ghost" aria-label={`Open ${item.label}`} title={`Open ${item.label}`} onClick={() => onNavigate(item.area)}><ArrowRight className="size-4" /></Button></li>)}</ul>
    </details>
  </section>;
}