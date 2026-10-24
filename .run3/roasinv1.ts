const A = "fcf83359-0486-402d-83b4-fd5484fb663d";
const F = "acb8193f-35fc-41cc-9ee5-629bde3e11b2";
const { recordInvoice } = await import("@/lib/migrated-billing.server");
const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const ex = await db.from("invoices").select("id").eq("offering_id", F);
if (ex.data?.length) throw new Error("invoices already recorded: " + JSON.stringify(ex.data));
const inv4 = await recordInvoice(A, {
  fundId: F,
  lines: [{ label: "Fund Setup", amountCents: 750000 }],
  issueDate: "2026-08-20",
  paidOn: "2026-08-24",
  reference: "ACH via Mercury",
  note: "Original invoice INV-4 (Mercury), billed to James King. Paid in full by ACH.",
});
const inv5 = await recordInvoice(A, {
  fundId: F,
  lines: [
    { label: "Quarterly Financials (2 entities x $7,500)", amountCents: 1500000 },
    { label: "GP Entity Management", amountCents: 250000 },
    { label: "LP Entity Management", amountCents: 150000 },
  ],
  issueDate: "2026-08-21",
  note: "Original invoice INV-5 (Mercury), billed to James King. Partial payment received: $11,500 by card on 2026-09-21; $7,500 still outstanding.",
});
console.log(JSON.stringify({ inv4, inv5 }));
