/** Shared status presentation helpers for the admin and manager consoles. */
export function statusTone(status: string) {
  if (status === "approved" || status === "settled") return "default" as const;
  if (status === "declined" || status === "failed" || status === "returned") return "destructive" as const;
  if (status === "not_started") return "outline" as const;
  return "secondary" as const;
}

export function prettyStatus(status: string) {
  return status.replace(/_/g, " ");
}

export function money(cents?: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}
