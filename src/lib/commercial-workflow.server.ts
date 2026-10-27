import { commercialAreas } from "./commercial-workflow-model";
import { canSee } from "./crm-model";

async function access(context: any) {
  const result = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (result.error) throw new Error("Couldn't verify team access.");
  const roles = (result.data ?? []).map((r: any) => String(r.role));
  const areas = commercialAreas(roles);
  if (!areas.sales && !areas.marketing && !areas.accountManagement && !areas.finance) throw new Error("This workspace is for authorized Harmonious teams.");
  return { roles, areas };
}
export async function loadCommercialWorkflow(context: any) {
  const { areas } = await access(context);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let inquiries: any[] = [], team: any[] = [], canQualify = false;
  if (areas.sales) {
    const { salesActor, salesTeam } = await import("./sales-hub.server");
    const actor = await salesActor(context.userId);
    canQualify = actor.scope === "all" || actor.scope === "team";
    if (canQualify) {
      team = await salesTeam(actor);
      // Intake identities are leadership-only until explicitly accepted into an owner-scoped CRM record.
      const [leads, links] = await Promise.all([
        db.from("marketing_leads").select("id,name,work_email,company,intent,created_at,utm_campaign").order("created_at", { ascending: false }).limit(100),
        db.from("commercial_intake_links").select("lead_id"),
      ]);
      if (leads.error || links.error) throw new Error("Couldn't load incoming inquiries.");
      const linked = new Set((links.data ?? []).map(r => r.lead_id));
      inquiries = (leads.data ?? []).filter(r => !linked.has(r.id));
    }
  }
  const finance = areas.finance ? await (await import("./staff-directory.server")).financeOverview(context.userId) : null;
  const accountManagement = areas.accountManagement ? await (await import("./account-management.server")).amDashboard(context.userId) : null;
  let commissions: any = null;
  if (areas.sales) commissions = await (await import("./commissions.server")).commissionReport(context.userId, "1900-01-01", "2999-12-31");
  return { areas, inquiries, team, canQualify, finance, accountManagement, commissions, asOf: new Date().toISOString() };
}
export async function qualifyInquiry(context: any, input: { leadId: string; contactId?: string; ownerId: string }) {
  await access(context);
  const { salesActor, salesTeam, reassignDeal } = await import("./sales-hub.server");
  const actor = await salesActor(context.userId);
  if (actor.scope !== "all" && actor.scope !== "team") throw new Error("Sales leadership must qualify and assign incoming inquiries.");
  const team = await salesTeam(actor);
  if (!team.some(t => t.id === input.ownerId)) throw new Error("Choose an eligible Sales owner.");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const existing = await db.from("commercial_intake_links").select("contact_id,deal_id").eq("lead_id", input.leadId).maybeSingle();
  if (existing.error) throw new Error("Couldn't verify inquiry linkage.");
  if (existing.data) return existing.data;
  const leadResult = await db.from("marketing_leads").select("id,name,work_email,company,intent").eq("id", input.leadId).maybeSingle();
  if (leadResult.error || !leadResult.data) throw new Error("Inquiry not found.");
  const lead = leadResult.data;
  const { crmActor, saveContact, saveDeal } = await import("./crm.server");
  const crm = await crmActor(context.userId);
  let contactId = input.contactId;
  if (contactId) {
    const result = await db.from("crm_contacts").select("id,scope,offering_id,owner_user_id,email").eq("id", contactId).maybeSingle();
    if (result.error || !result.data || !canSee(crm, result.data as any) || result.data.scope !== "harmonious" || result.data.email?.toLowerCase() !== lead.work_email.toLowerCase()) throw new Error("That contact isn't available for this inquiry.");
  } else {
    const matches = await db.from("crm_contacts").select("id").eq("scope", "harmonious").ilike("email", lead.work_email.replace(/[\\%_]/g, "\\$&")).is("archived_at", null).limit(2);
    if (matches.error) throw new Error("Couldn't check existing contacts.");
    if (matches.data?.length) throw new Error("An existing contact may match. Review and link it from CRM rather than creating a duplicate.");
    contactId = (await saveContact(context.userId, { full_name: lead.name, email: lead.work_email, organization: lead.company, source: "Website inquiry", scope: "harmonious", offering_id: null })).id;
  }
  if (!contactId) throw new Error("Contact could not be linked.");
  const deal = await saveDeal(context.userId, { contactId, title: `${lead.company}: ${lead.intent.replace(/_/g, " ")}`, stage: "lead" });
  await reassignDeal(context.userId, { dealId: deal.id, ownerId: input.ownerId });
  const link = await db.from("commercial_intake_links").insert({ lead_id: lead.id, contact_id: contactId, deal_id: deal.id, actor_id: context.userId });
  if (link.error) throw new Error("The prospect was saved but its inquiry link needs review. Do not create another prospect.");
  return { contact_id: contactId, deal_id: deal.id };
}