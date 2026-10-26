// Resend Kimberly Girardi's personal investment link for CORPS EREBOR.
// Uses the canonical sendPersonalLink path (staff actor, audited event).
const ALYSSA = "fcf83359-0486-402d-83b4-fd5484fb663d";
const ONBOARDING = "0c437761-5952-4766-8aec-2244a754a580"; // Kimberly Girardi, CORPS EREBOR

const mod = await import("@/lib/investor-onboarding.server");
const result = await mod.sendPersonalLink(ALYSSA, ONBOARDING);
console.log("sendPersonalLink result:", JSON.stringify(result));

// Confirm the invitation's last_sent_at moved.
const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
const { data: inv } = await db
  .from("fund_invitations")
  .select("id, email, status, last_sent_at, expires_at")
  .eq("id", "0165bf98-c51e-4b12-8886-207d9bb887bc")
  .maybeSingle();
console.log("invitation:", JSON.stringify(inv));
