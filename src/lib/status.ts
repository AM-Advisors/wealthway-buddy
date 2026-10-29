/** Shared status presentation helpers for the admin and manager consoles. */
export function statusTone(status: string) {
  if (status === "approved" || status === "settled") return "default" as const;
  if (status === "declined" || status === "failed" || status === "returned" || status === "rejected")
    return "destructive" as const;
  if (status === "not_started") return "outline" as const;
  return "secondary" as const;
}

/** Display only: turns stored values like "not_started" into "Not started". Stored values never change. */
export function prettyStatus(status: string | null | undefined) {
  const text = String(status ?? "").trim().replace(/_/g, " ").toLowerCase();
  if (!text) return "Not started";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function money(cents?: number | null) {
  if (!cents) return "-";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}
