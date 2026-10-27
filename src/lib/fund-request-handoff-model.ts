import { staffProfile } from "./harmonious-staff";

export function validateOperationsTransfer(input: { owner: string | null; dueDate: string | null; roles: readonly string[]; status: string; taskId: string | null }) {
  if (!input.taskId) throw new Error("This request needs its linked task before transfer.");
  if (["COMPLETED", "CANCELLED", "CANCELLATION_REVIEW"].includes(input.status)) throw new Error("This request cannot be transferred.");
  if (!input.owner || !staffProfile(input.roles).teams.includes("operations")) throw new Error("Choose a receiving Operations owner.");
  const parsed = input.dueDate ? Date.parse(`${input.dueDate}T00:00:00Z`) : NaN;
  if (!input.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== input.dueDate) throw new Error("Set a receiving deadline.");
}

export type RequestTaskProgress = { id: string; status: string; team: string | null; ownerName: string | null; dueDate: string | null };
export const requestTaskStatusLabel = (status: string) => ({ open: "Awaiting review", in_progress: "In progress", done: "Completed", cancelled: "Canceled" })[status] ?? "Not recorded";