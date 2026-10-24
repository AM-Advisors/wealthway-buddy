const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const r = await db.from("invoices").select("*").eq("id", "82dac874-15e3-4468-94e1-1609349c820a").single();
console.log(Object.keys(r.data).join(", "));
