/**
 * Server-side cap on staff/manager-triggered emails. Every guarded send is
 * recorded (recipient stored only as a hash) and refused once the caller,
 * the record, or the recipient has had too many recent sends. Callers must
 * already be authorized; this only bounds how much they can send.
 */

export type OutboundLimits = {
  /** Max sends for this action + scope (e.g. one shareholder) in the window. */
  perScope: number;
  /** Max sends to the same recipient address across all actions in the window. */
  perRecipient: number;
  /** Max guarded sends by this caller in the window. */
  perActor: number;
  /** Window length in hours. */
  windowHours: number;
};

export const DEFAULT_OUTBOUND_LIMITS: OutboundLimits = {
  perScope: 5,
  perRecipient: 10,
  perActor: 200,
  windowHours: 24,
};

async function hashRecipient(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class OutboundLimitError extends Error {}

/**
 * Throws OutboundLimitError when any limit is reached; otherwise records the
 * send. Call immediately before sending.
 */
export async function reserveOutboundEmail(opts: {
  actorId: string;
  action: string;
  scopeKey: string;
  recipient: string;
  limits?: Partial<OutboundLimits>;
}): Promise<void> {
  const limits = { ...DEFAULT_OUTBOUND_LIMITS, ...(opts.limits ?? {}) };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const since = new Date(Date.now() - limits.windowHours * 3600_000).toISOString();
  const recipientHash = await hashRecipient(opts.recipient);

  const [scope, recipient, actor] = await Promise.all([
    db
      .from("outbound_email_events")
      .select("id", { count: "exact", head: true })
      .eq("action", opts.action)
      .eq("scope_key", opts.scopeKey)
      .gte("created_at", since),
    db
      .from("outbound_email_events")
      .select("id", { count: "exact", head: true })
      .eq("recipient_hash", recipientHash)
      .gte("created_at", since),
    db
      .from("outbound_email_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", opts.actorId)
      .gte("created_at", since),
  ]);
  for (const r of [scope, recipient, actor]) {
    if (r.error) throw new Error("Could not check the email sending limit. Try again shortly.");
  }
  if ((scope.count ?? 0) >= limits.perScope || (recipient.count ?? 0) >= limits.perRecipient) {
    throw new OutboundLimitError(
      "This person has already been emailed several times recently. Wait a day before sending again.",
    );
  }
  if ((actor.count ?? 0) >= limits.perActor) {
    throw new OutboundLimitError(
      "You have reached today's sending limit. Try again tomorrow or ask Operations for help.",
    );
  }

  const { error } = await db.from("outbound_email_events").insert({
    actor_id: opts.actorId,
    action: opts.action,
    scope_key: opts.scopeKey,
    recipient_hash: recipientHash,
  });
  if (error) throw new Error("Could not record the email before sending. Try again shortly.");
}
