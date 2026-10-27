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
  let importReviews: any[] = [];
  if (canQualify) {
    const { crmActor } = await import("./crm.server");
    const crm = await crmActor(context.userId);
    let query = db.from("crm_contacts").select("id,full_name,email,scope,offering_id,owner_user_id").eq("scope", "harmonious").is("archived_at", null).limit(10000);
    if (!crm.superUser && !crm.viewAll) query = query.eq("owner_user_id", context.userId);
    const [contacts, reviews, sourceLinks] = await Promise.all([query, db.from("crm_import_match_reviews").select("id,external_source,external_id,email").limit(500), db.from("crm_contact_source_links").select("external_source,external_id")]);
    if (contacts.error || reviews.error || sourceLinks.error) throw new Error("Couldn't load contact match review.");
    const entitled = (contacts.data ?? []).filter(c => canSee(crm, c as any));
    const matches = (email: string) => entitled.filter(c => c.email?.trim().toLowerCase() === email.trim().toLowerCase());
    inquiries = inquiries.map(i => ({ ...i, candidates: matches(i.work_email) }));
    importReviews = (reviews.data ?? []).filter(r => !sourceLinks.data?.some(l => l.external_source === r.external_source && l.external_id === r.external_id)).map(r => ({ ...r, candidates: matches(r.email) })).filter(r => r.candidates.length);
  }
  return { areas, inquiries, team, canQualify, finance, accountManagement, commissions, importReviews, asOf: new Date().toISOString() };
}
export async function linkImportedContact(context: any, input: { reviewId: string; contactId: string }) {
  await access(context);
  const { salesActor } = await import("./sales-hub.server");
  const sales = await salesActor(context.userId);
  if (sales.scope !== "all" && sales.scope !== "team") throw new Error("Sales leadership is required.");
  const { crmActor } = await import("./crm.server");
  const crm = await crmActor(context.userId);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [review, contact] = await Promise.all([db.from("crm_import_match_reviews").select("external_source,external_id,email").eq("id", input.reviewId).single(), db.from("crm_contacts").select("id,email,scope,offering_id,owner_user_id,archived_at").eq("id", input.contactId).single()]);
  if (review.error || contact.error || !canSee(crm, contact.data as any) || contact.data.scope !== "harmonious" || contact.data.archived_at || contact.data.email?.trim().toLowerCase() !== review.data.email.trim().toLowerCase()) throw new Error("This match isn't available.");
  const saved = await db.from("crm_contact_source_links").insert({ contact_id: input.contactId, external_source: review.data.external_source, external_id: review.data.external_id, actor_id: context.userId });
  if (saved.error) throw new Error("Couldn't link this source. Refresh before retrying.");
  return { ok: true };
}
export async function qualifyInquiry(context: any, input: { leadId: string; contactId?: string | undefined; ownerId: string }) {
  await access(context);
  const { salesActor, salesTeam } = await import("./sales-hub.server");
  const actor = await salesActor(context.userId);
  if (actor.scope !== "all" && actor.scope !== "team") throw new Error("Sales leadership must qualify and assign incoming inquiries.");
  const team = await salesTeam(actor);
  if (!team.some(t => t.id === input.ownerId)) throw new Error("Choose an eligible Sales owner.");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const result = await db.rpc("qualify_commercial_inquiry", { _actor: context.userId, _lead: input.leadId, _owner: input.ownerId, ...(input.contactId ? { _contact: input.contactId } : {}) });
  if (result.error) throw new Error("Couldn't qualify this inquiry. Review matching contacts and the selected Sales owner, then retry.");
  return result.data;
}