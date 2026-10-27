export type HandoffRow = { quoteId: string; quoteNumber: string; title: string; taskId: string | null; ownerId: string | null; ownerName: string | null; dueDate: string | null; status: string; canAssign: boolean; canReceive: boolean };
export type HandoffData = { rows: HandoffRow[]; owners: { id: string; name: string }[] };
export function handoffStatus(row: Pick<HandoffRow, "status" | "ownerId" | "dueDate">, today: string) {
  if (row.status === "done") return { label: "Completed", overdue: false };
  if (row.status === "cancelled") return { label: "Cancelled", overdue: false };
  const overdue = !!row.dueDate && row.dueDate < today;
  return { label: !row.ownerId || !row.dueDate ? "Needs assignment" : row.status === "in_progress" ? "Acknowledged" : "Awaiting acknowledgment", overdue };
}