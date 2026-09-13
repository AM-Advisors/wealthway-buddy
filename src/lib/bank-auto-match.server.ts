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

  // The paying accounts staff recorded for these clients: a deposit that carries
  // the client's own account holder name, reference or last four digits is theirs.
  const clientIds = Array.from(
    new Set(open.map((i) => String(i.client_id ?? "")).filter(Boolean)),
  );
  const hintsByClient = new Map<string, string[]>();
  if (clientIds.length) {
    const { data: clientAccounts } = await supabase
      .from("client_bank_accounts")
      .select("client_id, account_holder, reference_hint, account_last4")
      .in("client_id", clientIds)
      .eq("status", "active");
    for (const account of (clientAccounts ?? []) as any[]) {
      const key = String(account.client_id);
      const hints = [account.account_holder, account.reference_hint]
        .map((v) => normalise(String(v ?? "")))
        .filter((v) => v.length >= 5);
      const digits = String(account.account_last4 ?? "").replace(/\D/g, "");
      if (digits.length === 4) hints.push(digits);
      hintsByClient.set(key, [...(hintsByClient.get(key) ?? []), ...hints]);
    }
  }

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
      const hints = hintsByClient.get(String(inv.client_id ?? "")) ?? [];
      if (hints.some((hint) => text.includes(hint))) return true;
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

/** Deposits that settle a wire an investor was expected to send, or a wire the
 *  fund asked to have approved. Both run without anyone matching by hand:
 *  the amount must agree exactly, and the reference the fund gave must appear
 *  on the deposit, or the arrival date must be close to the date expected. */
export async function matchWireArrivals(
  supabase: any,
  userId: string,
  offeringId: string,
  source = "bank statement",
) {
  const { data: lines } = await supabase
    .from("bank_transactions")
    .select("id, posted_on, amount_cents, name, description")
    .eq("offering_id", offeringId)
    .is("matched_invoice_id", null)
    .is("matched_application_id", null)
    .is("matched_wire_request_id", null)
    .order("posted_on", { ascending: false })
    .limit(100);

  const deposits = ((lines ?? []) as any[]).filter((l) => Number(l.amount_cents ?? 0) > 0);
  if (!deposits.length) return { investors: 0, wireRequests: 0 };

  const [{ data: applications }, { data: requests }] = await Promise.all([
    supabase
      .from("investor_applications")
      .select("id, user_id, commitment_cents, funding_status")
      .eq("offering_id", offeringId)
      .neq("funding_status", "settled"),
    supabase
      .from("wire_requests")
      .select("id, application_id, amount_cents, purpose, expected_date, note, status, created_at")
      .eq("offering_id", offeringId)
      .eq("status", "approved")
      .is("settled_at", null),
  ]);

  const apps = (applications ?? []) as any[];
  const appIds = apps.map((a) => String(a.id));
  const { data: payments } = appIds.length
    ? await supabase
        .from("payments")
        .select("id, application_id, amount_cents, reference_code, status")
        .in("application_id", appIds)
    : { data: [] as any[] };

  const paymentByApp = new Map(
    ((payments ?? []) as any[]).map((p) => [String(p.application_id), p]),
  );

  const now = new Date().toISOString();
  const usedApps = new Set<string>();
  const usedRequests = new Set<string>();
  let investors = 0;
  let wireRequests = 0;

  for (const line of deposits) {
    const amount = Number(line.amount_cents ?? 0);
    const text = normalise(`${line.name ?? ""} ${line.description ?? ""}`);

    // 1) An investor's subscription wire.
    const candidates = apps.filter((a) => {
      if (usedApps.has(String(a.id))) return false;
      const payment = paymentByApp.get(String(a.id));
      if (payment && String(payment.status) === "settled") return false;
      const expected = Number(payment?.amount_cents ?? a.commitment_cents ?? 0);
      return expected > 0 && expected === amount;
    });
    const byReference = candidates.find((a) => {
      const ref = String(paymentByApp.get(String(a.id))?.reference_code ?? "").trim();
      return ref.length >= 4 && text.includes(normalise(ref));
    });
    // Without a reference we only settle when exactly one investor owes that amount.
    const investorHit = byReference ?? (candidates.length === 1 ? candidates[0] : null);

    if (investorHit) {
      const { error: lineError } = await supabase
        .from("bank_transactions")
        .update({
          matched_application_id: investorHit.id,
          matched_by: userId,
          matched_at: now,
          auto_matched: true,
        })
        .eq("id", line.id)
        .is("matched_application_id", null);
      if (!lineError) {
        const payment = paymentByApp.get(String(investorHit.id));
        if (payment) {
          await supabase
            .from("payments")
            .update({ status: "settled", confirmed_at: now, failure_reason: null, updated_at: now })
            .eq("id", payment.id);
        }
        await supabase
          .from("investor_applications")
          .update({ funding_status: "settled", status: "funded", updated_at: now })
          .eq("id", investorHit.id);

        usedApps.add(String(investorHit.id));
        investors += 1;

        await auditEvent(supabase, userId, source, {
          action: "investor wire matched automatically",
          target: String(paymentByApp.get(String(investorHit.id))?.reference_code ?? investorHit.id),
          clientId: null,
          offeringId,
          previous: { funding_status: investorHit.funding_status ?? null },
          next: {
            funding_status: "settled",
            posted_on: line.posted_on,
            bank_amount_cents: amount,
            matched_on: byReference ? "reference" : "amount",
          },
        });
      }
      continue;
    }

    // 2) A wire the fund asked to have approved, now visible on the statement.
    const openRequests = ((requests ?? []) as any[]).filter(
      (r) => !usedRequests.has(String(r.id)) && Number(r.amount_cents ?? 0) === amount,
    );
    const requestHit =
      openRequests.find((r) => {
        const note = normalise(String(r.note ?? ""));
        return note.length >= 5 && text.includes(note);
      }) ??
      openRequests.find((r) => {
        const expected = String(r.expected_date ?? "").slice(0, 10);
        return expected ? daysApart(expected, String(line.posted_on)) <= 6 : false;
      }) ??
      (openRequests.length === 1 ? openRequests[0] : null);
    if (!requestHit) continue;

    const { error: wireLineError } = await supabase
      .from("bank_transactions")
      .update({
        matched_wire_request_id: requestHit.id,
        wire_matched_by: userId,
        wire_matched_at: now,
        auto_matched: true,
      })
      .eq("id", line.id)
      .is("matched_wire_request_id", null);
    if (wireLineError) continue;

    await supabase
      .from("wire_requests")
      .update({
        settled_at: now,
        settled_transaction_id: line.id,
        settled_amount_cents: amount,
        updated_at: now,
      })
      .eq("id", requestHit.id)
      .is("settled_at", null);

    usedRequests.add(String(requestHit.id));
    wireRequests += 1;

    await auditEvent(supabase, userId, source, {
      action: "wire request settled automatically",
      target: String(requestHit.purpose ?? "wire request"),
      clientId: null,
      offeringId,
      previous: { settled_at: null },
      next: {
        settled_at: now,
        posted_on: line.posted_on,
        bank_amount_cents: amount,
        expected_date: requestHit.expected_date ?? null,
      },
    });
  }

  return { investors, wireRequests };
}

/** Everything the portal settles on its own for one fund. */
export async function runAutoMatch(
  supabase: any,
  userId: string,
  offeringId: string,
  source = "bank statement",
) {
  const invoices = await matchDeclaredPayments(supabase, userId, offeringId, source);
  const wires = await matchWireArrivals(supabase, userId, offeringId, source);
  return { invoices, ...wires, total: invoices + wires.investors + wires.wireRequests };
}
