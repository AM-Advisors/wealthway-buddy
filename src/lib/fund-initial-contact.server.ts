/**
 * Read/set a fund's Initial Contact (see fund-initial-contact.ts). Staff only.
 * New people go through planContactSave so an existing Client Contact is reused
 * and possible duplicates stop for review. One current initial contact per fund;
 * changes are logged to offering_audit_events.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "@/lib/fund-setup.server";
import { planContactSave } from "@/lib/client-contacts-model";
import { INITIAL_CONTACT_ROLE, initialContactProblem, type InitialContactDraft } from "@/lib/fund-initial-contact";
import { isHarmoniousStaffEmail } from "@/lib/harmonious-staff";

const db = () => supabaseAdmin as any;

async function fundClient(offeringId: string) {
  const { data: o } = await db().from("offerings").select("client_id").eq("id", offeringId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  return (o.client_id as string | null) ?? null;
}

async function activeContacts(clientId: string) {
  const { data } = await db().from("client_contacts").select("id, full_name, email, phone, title, designations")
    .eq("client_id", clientId).eq("status", "active").is("deactivated_at", null).order("full_name");
  return (data ?? []) as { id: string; full_name: string; email: string | null; phone: string | null; title: string | null; designations: string[] | null }[];
}

export async function getInitialContact(userId: string, offeringId: string) {
  await assertStaff(userId);
  const clientId = await fundClient(offeringId);
  if (!clientId) return { clientLinked: false, current: null, options: [] };
  const [contacts, { data: scope }] = await Promise.all([
    activeContacts(clientId),
    db().from("client_contact_scopes").select("contact_id").eq("offering_id", offeringId).eq("role", INITIAL_CONTACT_ROLE).limit(1).maybeSingle(),
  ]);
  const c = scope ? contacts.find((x) => x.id === scope.contact_id) ?? null : null;
  return {
    clientLinked: true,
    current: c ? { id: c.id, fullName: c.full_name, email: c.email, phone: c.phone, title: c.title } : null,
    options: contacts.filter((x) => !isHarmoniousStaffEmail(x.email)).map((x) => ({ id: x.id, fullName: x.full_name, email: x.email, title: x.title })),
  };
}

export async function setInitialContact(userId: string, input: { offeringId: string; contactId?: string | null | undefined; newPerson?: InitialContactDraft | null | undefined; confirmSeparate?: boolean | undefined }) {
  await assertStaff(userId);
  const clientId = await fundClient(input.offeringId);
  if (!clientId) throw new Error("Link this fund to a client before adding an initial contact.");
  const existing = await activeContacts(clientId);
  let contactId: string;
  if (input.newPerson) {
    const problem = initialContactProblem(input.newPerson);
    if (problem) throw new Error(problem);
    const row = {
      full_name: input.newPerson.fullName.trim(),
      email: input.newPerson.email?.trim().toLowerCase() || null,
      phone: input.newPerson.phone?.trim() || null,
      title: input.newPerson.title?.trim() || null,
      designations: ["initial_contact"],
    };
    const plan = planContactSave(existing as any, [...existing.map((e) => ({ ...e, designations: e.designations ?? [] })), row], input.confirmSeparate ? [existing.length] : []);
    if (plan.error) throw new Error(plan.error);
    const matched = plan.rows[plan.rows.length - 1]!;
    if (matched.id) {
      contactId = matched.id;
      const before = existing.find((e) => e.id === contactId);
      await db().from("client_contacts").update({
        designations: matched.designations, phone: before?.phone || row.phone, title: before?.title || row.title, updated_at: new Date().toISOString(),
      }).eq("id", contactId);
    } else {
      const { data: c, error } = await db().from("client_contacts").insert({ client_id: clientId, ...row, status: "active", created_by: userId, added_for_offering_id: input.offeringId }).select("id").single();
      if (error || !c) throw new Error(error?.message ?? "Could not add that contact.");
      contactId = c.id;
    }
  } else if (input.contactId) {
    const c = existing.find((e) => e.id === input.contactId);
    if (!c) throw new Error("That person isn't an active contact on this fund's client.");
    if (isHarmoniousStaffEmail(c.email)) throw new Error("Harmonious staff can't be a fund's initial contact. Add someone from the client.");
    contactId = c.id;
    const d = new Set(c.designations ?? []); d.add("initial_contact");
    await db().from("client_contacts").update({ designations: [...d], updated_at: new Date().toISOString() }).eq("id", contactId);
  } else {
    throw new Error("Choose a contact or add a new one.");
  }

  const { data: prior } = await db().from("client_contact_scopes").select("id, contact_id").eq("offering_id", input.offeringId).eq("role", INITIAL_CONTACT_ROLE);
  const others = ((prior ?? []) as any[]).filter((p) => p.contact_id !== contactId);
  if (others.length) await db().from("client_contact_scopes").delete().in("id", others.map((p) => p.id));
  if (!((prior ?? []) as any[]).some((p) => p.contact_id === contactId)) {
    const { error } = await db().from("client_contact_scopes").insert({ contact_id: contactId, client_id: clientId, offering_id: input.offeringId, role: INITIAL_CONTACT_ROLE, created_by: userId });
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
  }
  await db().from("offering_audit_events").insert({
    offering_id: input.offeringId, event_type: "initial_contact_set", summary: "Initial contact set",
    changes: { contact_id: contactId, previous_contact_ids: others.map((p) => p.contact_id) }, actor_id: userId,
  }).then(() => null, () => null);
  return { contactId };
}

export async function clearInitialContact(userId: string, offeringId: string) {
  await assertStaff(userId);
  const { data: prior } = await db().from("client_contact_scopes").select("id, contact_id").eq("offering_id", offeringId).eq("role", INITIAL_CONTACT_ROLE);
  const rows = (prior ?? []) as any[];
  if (!rows.length) return { ok: true };
  await db().from("client_contact_scopes").delete().in("id", rows.map((p) => p.id));
  await db().from("offering_audit_events").insert({
    offering_id: offeringId, event_type: "initial_contact_removed", summary: "Initial contact removed",
    changes: { previous_contact_ids: rows.map((p) => p.contact_id) }, actor_id: userId,
  }).then(() => null, () => null);
  return { ok: true };
}
