const F = "acb8193f-35fc-41cc-9ee5-629bde3e11b2";
const INV5 = "82dac874-15e3-4468-94e1-1609349c820a";
const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const ex = await db.from("invoice_lines").select("id").eq("invoice_id", INV5);
if (ex.data?.length) throw new Error("lines already exist");
const lines = [
  { label: "Quarterly Financials (2 entities x $7,500)", amountCents: 1500000 },
  { label: "GP Entity Management", amountCents: 250000 },
  { label: "LP Entity Management", amountCents: 150000 },
];
const r = await db.from("invoice_lines").insert(lines.map((l, i) => ({ invoice_id: INV5, offering_id: F, source: "manual", label: l.label, quantity: 1, unit_cents: l.amountCents, amount_cents: l.amountCents, sort_order: i, source_ref: `migration:${INV5}:${i}` })));
if (r.error) throw r.error;
const check = await db.from("invoices").select("id, number, status, total_cents, issue_date, paid_on, note").eq("offering_id", F);
const all = await db.from("invoice_lines").select("invoice_id, label, amount_cents").in("invoice_id", ["48d40e93-4aed-45fc-9b3a-22b9e0debb4b", INV5]);
console.log(JSON.stringify({ invoices: check.data, lines: all.data }, null, 1));
