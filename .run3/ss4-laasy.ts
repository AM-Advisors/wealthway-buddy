// Send Form SS-4 for Corps LaaSy (a series of AM SPV Fund Management) to Thomas Morgan Jr.
// 1. Grant him fund-manager access to the fund (staff action, audited).
// 2. Create the SS-4 signature request, prefilled from the fund record.
// 3. Email him the signing link via the manager-alert template.
const ALYSSA = "fcf83359-0486-402d-83b4-fd5484fb663d";
const FUND = "92252b98-c5d2-444a-8620-fb29436a87cf"; // Corps LaaSy, a series of AM SPV Fund Management
const THOMAS = "a1387cfc-46e5-4dd4-b16b-d63730123794"; // Thomas Morgan Jr

const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;

// --- 1. Fund-manager access (mirrors grantFundAccess, sendEmail: false) ---
const { data: existing } = await db.from("fund_managers").select("id").eq("offering_id", FUND).eq("user_id", THOMAS).maybeSingle();
let access = "already_on_team";
if (!existing) {
  const up = await db.from("fund_managers").upsert({ user_id: THOMAS, offering_id: FUND, granted_by: ALYSSA }, { onConflict: "user_id,offering_id" });
  if (up.error) throw new Error(up.error.message);
  const authz = await import("@/lib/reviewer-authz.server");
  await authz.logAccessChange({ actorId: ALYSSA, offeringId: FUND, targetUserId: THOMAS, role: "fund_manager", action: "granted", detail: "thomas.morgan@corpscappartners.com" });
  const { data: roleRow } = await db.from("user_roles").select("id").eq("user_id", THOMAS).eq("role", "fund_manager").maybeSingle();
  if (!roleRow) {
    const ri = await db.from("user_roles").insert({ user_id: THOMAS, role: "fund_manager" });
    if (ri.error) throw new Error(ri.error.message);
  }
  const now = new Date().toISOString();
  const inv = await db.from("fund_invitations").insert({ offering_id: FUND, email: "thomas.morgan@corpscappartners.com", invited_name: "Thomas Morgan Jr", invite_role: "fund_manager", invited_by: ALYSSA, status: "accepted", accepted_at: now, accepted_by: THOMAS, last_sent_at: null });
  if (inv.error) throw new Error(inv.error.message);
  access = "added";
}

// --- 2. SS-4 request, prefilled from the fund record (mirrors prefill in ss4-request.functions.ts) ---
const form: Record<string, string | boolean> = {
  legal_name: "Corps LaaSy, a series of AM SPV Fund Management",
  trade_name: "",
  care_of: "",
  mailing_street: "1900 W. Kirkwood Blvd.",
  mailing_city_state_zip: "Southlake, TX 76092",
  street_address: "1900 W. Kirkwood Blvd.",
  street_city_state_zip: "Southlake, TX 76092",
  county_state: "Tarrant, Texas",
  responsible_party_name: "Thomas Morgan Jr",
  is_llc: true,
  llc_members: "1",
  llc_us_organized: true,
  entity_kind: "partnership",
  entity_detail: "",
  state_incorporated: "Delaware",
  reason: "started_business",
  reason_detail: "Investment fund",
  date_started: "",
  closing_month: "December",
  employees_agricultural: "0",
  employees_household: "0",
  employees_other: "0",
  first_wages_date: "N/A",
  principal_activity: "finance_insurance",
  principal_activity_other: "",
  principal_line: "Pooled investment fund (private investment vehicle)",
  previous_ein_applied: false,
  previous_ein: "",
  designee_name: "Harmonious LLC",
  designee_phone: "801-433-8005",
  designee_address: "",
  applicant_name_title: "Thomas Morgan Jr, Manager",
  applicant_phone: "+12147286100",
};

// One open request per fund: cancel older open ones, never delete.
await db.from("ss4_signature_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: ALYSSA }).eq("offering_id", FUND).eq("status", "requested");
const note = "Please check the mailing address (lines 4 and 5) and the date the business started (line 11): the fund record did not have them, so the address is prefilled from the AM SPV master. Correct anything before signing, then add the Responsible Party SSN or ITIN on line 7b.";
const ins = await db.from("ss4_signature_requests").insert({ offering_id: FUND, requested_by: ALYSSA, signer_user_id: THOMAS, form_data: form, note }).select("id").single();
if (ins.error) throw new Error(ins.error.message);
const requestId = ins.data.id as string;

// --- 3. Email the signing link ---
const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
const mail = await sendTemplateEmail("manager-alert", "thomas.morgan@corpscappartners.com", {
  idempotencyKey: `ss4-request:${requestId}`,
  templateData: {
    managerName: "Thomas Morgan Jr",
    headline: "Please review and sign your Form SS-4",
    intro: "Harmonious has filled in the IRS Form SS-4 to get your fund's EIN. Please check each line, add the Responsible Party SSN or ITIN, and sign.",
    offeringName: "Corps LaaSy, a series of AM SPV Fund Management",
    details: [{ label: "Form", value: "IRS Form SS-4 (EIN application)" }, { label: "Note from Harmonious", value: note }],
    portalUrl: `https://app.harmonious.co/manager/ss4/${requestId}`,
  },
});

console.log(JSON.stringify({ access, requestId, emailed: Boolean(mail?.sent ?? true), mail }));
