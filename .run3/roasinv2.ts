const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const ids = ["48d40e93-4aed-45fc-9b3a-22b9e0debb4b", "82dac874-15e3-4468-94e1-1609349c820a"];
const r = await db.from("invoice_lines").select("invoice_id, label, amount_cents, source_ref").in("invoice_id", ids);
console.log(JSON.stringify(r.data));
