/** Automatic matching of bank deposits to the fee invoices clients declared.
 *  Server-only: both the staff bank statement and the client's own linked
 *  account run the same rules, so a payment matches the same way either way. */

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function daysApart(a: string, b: string) {
  const one = Date.parse(`${a}T00:00:00Z`);
  const two = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(one) || Number.isNaN(two)) return 999;
  return Math.abs(one - two) / 86_400_000;
}

async function auditEvent(
  supabase: any,
  userId: string,
  source: string,
  entry: {
    action: string;
    target: string;
    clientId: string | null;
    offeringId: string | null;
    previous?: unknown;
    next?: unknown;
  },
) {
  await supabase.from("contract_audit_events").insert({
    area: "invoice",
    action: entry.action,
    target: entry.target,
    client_id: entry.clientId,
    offering_id: entry.offeringId,
    actor_id: userId,
    previous_value: entry.previous ?? null,
    new_value: entry.next ?? null,
    source,
  });
}

/** Ties deposits to the wire or ACH payments clients declared in their portal.
 *  A line is only settled when the amount agrees and either the reference the
 *  client gave appears on the deposit or the dates line up. */
export async function matchDeclaredPayments(
  supabase: any,
  userId: string,
  offeringId: string,
  source = "bank statement",
) {
  const [{ data: lines }, { data: invoices }] = await Promise.all([
    supabase
      .from("bank_transactions")
      .select("id, posted_on, amount_cents, name, description")
      .eq("offering_id", offeringId)
      .is("matched_invoice_id", null)
      .is("matched_application_id", null)
      .order("posted_on", { ascending: false })
      .limit(100),
    supabase
      .from("invoices")
      .select(
        "id, number, client_id, total_cents, client_payment_method, client_payment_reference, client_paid_on, client_payment_declared_at",
      )
      .eq("offering_id", offeringId)
      .eq("status", "issued")
      .not("client_payment_declared_at", "is", null),
  ]);

  const open = ((invoices ?? []) as any[]).filter((i) => Number(i.total_cents ?? 0) > 0);
  if (!open.length || !((lines ?? []) as any[]).length) return 0;

  const used = new Set<string>();
  let matched = 0;

  for (const line of (lines ?? []) as any[]) {
    const amount = Number(line.amount_cents ?? 0);
    if (amount <= 0) continue;
    const text = normalise(`${line.name ?? ""} ${line.description ?? ""}`);
    const hit = open.find((inv) => {
      if (used.has(String(inv.id))) return false;
      if (Number(inv.total_cents ?? 0) !== amount) return false;
      const ref = String(inv.client_payment_reference ?? "").trim();
      if (ref.length >= 4 && text.includes(normalise(ref))) return true;
      return (
        Boolean(inv.client_paid_on) &&
        daysApart(String(inv.client_paid_on), String(line.posted_on)) <= 6
      );
    });
    if (!hit) continue;

    const reference =
      String(hit.client_payment_reference ?? "").trim() ||
      `Bank statement ${line.posted_on} — ${line.name || "deposit"}`;
    const now = new Date().toISOString();

    const { error: invoiceError } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_on: line.posted_on, payment_reference: reference })
      .eq("id", hit.id)
      .eq("status", "issued");
    if (invoiceError) continue;

    const { error: lineError } = await supabase
      .from("bank_transactions")
      .update({ matched_invoice_id: hit.id, invoice_matched_by: userId, invoice_matched_at: now })
      .eq("id", line.id)
      .is("matched_invoice_id", null);
    if (lineError) continue;

    used.add(String(hit.id));
    matched += 1;

    await auditEvent(supabase, userId, source, {
      action: "client payment matched automatically",
      target: String(hit.number ?? "invoice"),
      clientId: (hit.client_id ?? null) as string | null,
      offeringId,
      previous: { status: "issued", paid_on: null },
      next: {
        status: "paid",
        paid_on: line.posted_on,
        reference,
        declared_method: hit.client_payment_method ?? null,
        declared_paid_on: hit.client_paid_on ?? null,
        bank_amount_cents: amount,
      },
    });
  }

  return matched;
}
