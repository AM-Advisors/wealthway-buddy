const A = "fcf83359-0486-402d-83b4-fd5484fb663d";
const F = "acb8193f-35fc-41cc-9ee5-629bde3e11b2";
const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const roles = await db.from("user_roles").select("role").eq("user_id", A);
const prof = await db.from("profiles").select("legal_name, email").eq("user_id", A).maybeSingle();
const fund = await db.from("offerings").select("id, name, client_id").eq("id", F).maybeSingle();
const inv = await db.from("invoices").select("id, number, status, total_cents, issue_date, paid_on, note").eq("offering_id", F);
console.log(JSON.stringify({ roles: roles.data, prof: prof.data, fund: fund.data, invoices: inv.data }, null, 1));
