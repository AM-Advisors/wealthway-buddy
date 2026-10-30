import { launchAction } from "./launch-action";

export type FundTodo = {
  id: string; label: string; description: string | null; status: string;
  dueDate: string | null; answer: string; section?: string | null; done?: boolean;
};

/** Display only: notes cannot approve terms or complete canonical setup work. */
export function fundTodoState(step: FundTodo, hasApprovedTerms = false) {
  const economics = step.section === "economics";
  const complete = economics ? hasApprovedTerms : !!step.done || ["complete", "completed", "done", "not_applicable", "waived"].includes(step.status);
  const review = !complete && step.status === "review";
  const action = economics
    ? { target: "approvals" as const, label: "Review fees & terms" }
    : launchAction(step.section ?? "", step.section ?? undefined);
  return { complete, review, action };
}