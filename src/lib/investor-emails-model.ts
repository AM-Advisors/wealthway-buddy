export type EmailEvent = { event: string; at: string; reason?: string | null };
export type DeliveryStatus = { label: string; tone: "good" | "bad" | "neutral"; detail?: string | null };

const BAD = ["hard_bounce", "soft_bounce", "blocked", "invalid_email", "spam", "error", "deferred"];
const OPEN = ["opened", "unique_opened", "proxy_open"];

/** Provider-reported facts only: never "delivered" without a delivered (or later) event. */
export function deliveryStatus(events: EmailEvent[]): DeliveryStatus {
  const has = (names: string[]) => events.filter((e) => names.includes(e.event)).sort((a, b) => a.at.localeCompare(b.at))[0];
  const bad = has(BAD.filter((b) => b !== "deferred"));
  if (bad) return { label: bad.event === "spam" ? "Marked as spam" : bad.event === "blocked" ? "Blocked" : "Bounced", tone: "bad", detail: bad.reason ?? null };
  const click = has(["click"]); if (click) return { label: "Clicked", tone: "good", detail: click.at };
  const open = has(OPEN); if (open) return { label: "Opened", tone: "good", detail: open.at };
  const delivered = has(["delivered"]); if (delivered) return { label: "Delivered", tone: "good", detail: delivered.at };
  if (has(["deferred"])) return { label: "Delayed by recipient server", tone: "neutral", detail: null };
  return { label: "No delivery report yet", tone: "neutral", detail: null };
}
