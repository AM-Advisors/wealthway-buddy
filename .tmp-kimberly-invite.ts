import { supabaseAdmin } from "@/integrations/supabase/client.server";

const USER = "6c6c2981-7ac8-4865-a953-4b0bf0ba005f";
const OFFERING = "fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f";
const INV = "0165bf98-c51e-4b12-8886-207d9bb887bc";
const ONB = "0c437761-5952-4766-8aec-2244a754a580";
const ACTOR = "fcf83359-0486-402d-83b4-fd5484fb663d";
const EMAIL = "pinklady55@comcast.net";
const NAME = "Kimberly Girardi";
const REASON = "Kimberly Girardi's own email per Alyssa Pettitt; resend onboarding invite with remaining steps";

async function main() {
  const admin = supabaseAdmin as any;

  // 1. Account sign-in email change (same behavior as changeAccountEmail in access-admin.functions.ts), audited.
  await admin.from("access_audit_events").insert({
    actor_user_id: ACTOR,
    actor_identity: "lovable-preview-session",
    target_user_id: USER,
    action: "Account email changed",
    outcome: "applied",
    previous_state: { email: "dantegirardi28@gmail.com" },
    new_state: { email: EMAIL },
    reason: REASON,
  });
  const { error: authErr } = await admin.auth.admin.updateUserById(USER, { email: EMAIL, email_confirm: true });
  if (authErr) throw new Error("auth email change failed: " + authErr.message);
  await admin.from("profiles").update({ email: EMAIL }).eq("user_id", USER);

  // 2. Point the invitation at Kimberly's email and her verified name.
  const { data: before } = await admin.from("fund_invitations").select("email, invited_name").eq("id", INV).maybeSingle();
  await admin.from("fund_invitations").update({ email: EMAIL, invited_name: NAME }).eq("id", INV);
  for (const [field, oldValue, newValue] of [
    ["email", before?.email ?? null, EMAIL],
    ["invited_name", before?.invited_name ?? null, NAME],
  ] as const) {
    await admin.from("investor_record_changes").insert({
      offering_id: OFFERING, onboarding_id: ONB, subject_table: "fund_invitations", subject_id: INV,
      field, old_value: oldValue == null ? null : JSON.stringify(oldValue), new_value: JSON.stringify(newValue),
      source: "harmonious", actor_user_id: ACTOR, manager_visible: false,
    });
  }

  // 3. Resend the invite email (template now carries the four onboarding steps).
  const { data: inv } = await admin.from("fund_invitations").select("*").eq("id", INV).maybeSingle();
  const { data: offering } = await admin.from("offerings").select("*").eq("id", OFFERING).maybeSingle();
  const { sendOnboardInvitationEmail } = await import("@/lib/investor-onboarding.server");
  const sent = await sendOnboardInvitationEmail(inv, offering, ACTOR, { onboardingId: ONB });
  console.log("invite email sent:", sent);

  // 4. Verify final state (no secrets printed).
  const { data: u } = await admin.auth.admin.getUserById(USER);
  console.log("account email now:", u?.user?.email);
  const { data: after } = await admin.from("fund_invitations").select("email, invited_name, last_sent_at").eq("id", INV).maybeSingle();
  console.log("invitation now:", JSON.stringify(after));
}

main().catch((e) => { console.error(e); process.exit(1); });
