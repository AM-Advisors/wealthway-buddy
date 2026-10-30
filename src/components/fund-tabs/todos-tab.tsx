import { ArrowRight, CheckCircle2, Clock, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fundTodoState, type FundTodo } from "@/lib/fund-todo-model";
import { fmtDate } from "./shared";

export type TodoStep = FundTodo;

/** Navigate to the actual setup/review tool; never approve work with a note. */
export function TodosTab({ steps, hasApprovedTerms = false, onNavigate }: {
  steps: TodoStep[]; hasApprovedTerms?: boolean; onNavigate: (target: string) => void;
}) {
  const items = steps.map((step) => ({ step, ...fundTodoState(step, hasApprovedTerms) }));
  const open = items.filter((item) => !item.complete);
  return (
    <section className="space-y-4" aria-label="Fund setup to-dos">
      <div>
        <h3 className="text-lg font-semibold">To dos</h3>
        <p className="text-sm text-muted-foreground">{open.length ? `${open.length} setup ${open.length === 1 ? "item needs" : "items need"} attention.` : "No setup items waiting on you."}</p>
      </div>
      <div className="divide-y border-y">
        {[...open, ...items.filter((item) => item.complete)].map(({ step, complete, review, action }) => (
          <div key={step.id} className="flex flex-wrap items-center gap-3 py-4">
            {complete ? <CheckCircle2 className="size-5 shrink-0 text-primary" /> : review ? <Clock className="size-5 shrink-0 text-muted-foreground" /> : <Circle className="size-5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-base font-medium">{step.section === "economics" ? "Fees & terms" : step.label}</p>
              {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
              {!complete && step.dueDate && <p className="text-sm text-muted-foreground">Due {fmtDate(step.dueDate)}</p>}
            </div>
            <Badge variant={complete ? "secondary" : "outline"}>{complete ? "Complete" : review ? "Awaiting approval" : "Needs attention"}</Badge>
            {!complete && <Button onClick={() => onNavigate(action.target)} className="w-full sm:w-auto">{action.label}<ArrowRight className="ml-2 size-4" /></Button>}
          </div>
        ))}
      </div>
    </section>
  );
}