/**
 * Fund Signatories: one or more canonical Persons authorized to sign for a
 * Fund, chosen from people already on the Client account (contacts) or the
 * Fund's managers, or added as a new Client contact. New people go through
 * Person Resolution; possible matches stop for review, never silent reuse.
 * The primary signatory is mirrored to offerings.fund_signatory_person_id,
 * which document signing already reads. Staff only; rows are soft-removed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import { resolvePersonServer, withPersonCreationLock } from "@/lib/person-resolution.server";
import { planContactSave } from "@/lib/client-contacts-model";

const db = () => supabaseAdmin as any;
const nameOf = (p: any) => [p?.legal_first_name, p?.legal_last_name].filter(Boolean).join(" ") || "Unnamed person";
const split = (n: string) => {
  const t = n.trim().replace(/\s+/g, " ");
  const i = t.indexOf(" ");
  return i < 0 ? { first: t, last: "" } : { first: t.slice(0, i), last: t.slice(i + 1) };
};

async function staffFor(userId: string, offeringId: string) {
  const actor = await setupActor(userId);
  if (!actor.isStaff && !actor.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return actor;
}

async function audit(offeringId: string, userId: string, event: string, summary: string, changes: unknown) {
  await db().from("offering_audit_events").insert({ offering_id: offeringId, event_type: event, summary, changes, actor_id: userId }).then(() => null, () => null);
}

async function syncPrimary(offeringId: string) {
  const { data: p } = await db().from("fund_signatories").select("person_id, title, capacity")
    .eq("offering_id", offeringId).eq("status", "active").eq("is_primary", true).maybeSingle();
  await db().from("offerings").update({
    fund_signatory_person_id: p?.person_id ?? null, signatory_title: p?.title ?? null, signatory_capacity: p?.capacity ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", offeringId);
}

export async function listFundSignatories(userId: string, offeringId: string) {
  const actor = await staffFor(userId, offeringId);
  const { data: o } = await db().from("offerings").select("client_id").eq("id", offeringId).maybeSingle();
  const [{ data: rows }, { data: contacts }, { data: managers }] = await Promise.all([
    db().from("fund_signatories").select("*").eq("offering_id", offeringId).eq("status", "active").order("added_at"),
    o?.client_id
      ? db().from("client_contacts").select("id, full_name, email, title, person_id, user_id").eq("client_id", o.client_id).eq("status", "active").is("deactivated_at", null).order("full_name")
      : { data: [] },
    db().from("fund_managers").select("user_id").eq("offering_id", offeringId),
  ]);
  const personIds = [...new Set(((rows ?? []) as any[]).map((r) => r.person_id))];
  const managerIds = ((managers ?? []) as any[]).map((m) => m.user_id);
  const [{ data: people }, { data: managerPeople }] = await Promise.all([
    personIds.length ? db().from("persons").select("id, legal_first_name, legal_last_name, email").in("id", personIds) : { data: [] },
    managerIds.length ? db().from("persons").select("id, legal_first_name, legal_last_name, email").in("user_id", managerIds) : { data: [] },
  ]);
  const pMap = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  const taken = new Set(personIds);
  const candidates = [
    ...((contacts ?? []) as any[]).filter((c) => !c.person_id || !taken.has(c.person_id))
      .map((c) => ({ key: `contact:${c.id}`, name: c.full_name as string, detail: [c.title, c.email].filter(Boolean).join(" · ") || "Client contact", source: "Client contact" })),
    ...((managerPeople ?? []) as any[]).filter((p) => !taken.has(p.id))
      .map((p) => ({ key: `person:${p.id}`, name: nameOf(p), detail: p.email ?? "Fund manager", source: "Fund manager" })),
  ];
  return {
    canEdit: actor.isStaff,
    hasClient: Boolean(o?.client_id),
    signatories: ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string, personId: r.person_id as string, name: nameOf(pMap.get(r.person_id)), email: (pMap.get(r.person_id)?.email ?? null) as string | null,
      title: r.title as string | null, capacity: r.capacity as string | null, isPrimary: Boolean(r.is_primary),
    })),
    candidates,
  };
}

/** Person for a Client contact: linked Person, the contact's own account, or a resolved/new unclaimed Person. */
async function personForContact(userId: string, c: any, confirmSeparate: boolean): Promise<string> {
  if (c.person_id) return c.person_id;
  if (c.user_id) {
    const { data: p } = await db().from("persons").select("id").eq("user_id", c.user_id).maybeSingle();
    if (p) { await db().from("client_contacts").update({ person_id: p.id }).eq("id", c.id); return p.id; }
  }
  const n = split(c.full_name);
  const signals = { email: c.email ?? null, firstName: n.first, lastName: n.last };
  return withPersonCreationLock(signals, async () => {
    const r = await resolvePersonServer(signals);
    let personId: string | null = null;
    if (r.outcome === "exact_match" && r.personId) personId = r.personId;
    else if (r.outcome !== "no_match" && !confirmSeparate) {
      throw new Error(`Person Review Required: "${c.full_name}" may already exist in Harmonious. Confirm this is a separate person, or ask Operations to review.`);
    }
    if (!personId) {
      const { data: p, error } = await db().from("persons").insert({
        user_id: null, legal_first_name: n.first, legal_last_name: n.last || null, email: c.email ? String(c.email).trim().toLowerCase() : null,
        entry_source: "fund_signatory", created_by: userId, onboarding_state: "account_created",
      }).select("id").single();
      if (error || !p) throw new Error(error?.message ?? "Could not save that person.");
      personId = p.id as string;
    }
    await db().from("client_contacts").update({ person_id: personId }).eq("id", c.id);
    return personId as string;
  });
}

export type AddSignatoryInput = {
  offeringId: string;
  candidateKey?: string | null | undefined;
  newPerson?: { fullName: string; email?: string | null | undefined; title?: string | null | undefined } | null | undefined;
  title?: string | null | undefined;
  capacity?: string | null | undefined;
  makePrimary?: boolean | undefined;
  confirmSeparate?: boolean | undefined;
};

export async function addFundSignatory(userId: string, input: AddSignatoryInput) {
  const actor = await staffFor(userId, input.offeringId);
  if (!actor.isStaff) forbid("only Harmonious can change Fund signatories.");
  const { data: o } = await db().from("offerings").select("client_id").eq("id", input.offeringId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  let personId: string | null = null;
  let contactId: string | null = null;

  if (input.newPerson) {
    if (!o.client_id) throw new Error("Link this Fund to a Client before adding a new person.");
    const { data: existing } = await db().from("client_contacts").select("id, full_name, email, designations").eq("client_id", o.client_id).eq("status", "active").is("deactivated_at", null);
    const row = { full_name: input.newPerson.fullName.trim(), email: input.newPerson.email?.trim() || null, title: input.newPerson.title?.trim() || null, designations: ["Signatory"] };
    const plan = planContactSave(existing ?? [], [...((existing ?? []) as any[]).map((e) => ({ ...e })), row], input.confirmSeparate ? [(existing ?? []).length] : []);
    if (plan.error) throw new Error(plan.error);
    const matched = plan.rows[plan.rows.length - 1]!;
    if (matched.id) {
      contactId = matched.id;
      await db().from("client_contacts").update({ designations: matched.designations, updated_at: new Date().toISOString() }).eq("id", contactId);
    } else {
      const { data: c, error } = await db().from("client_contacts").insert({
        client_id: o.client_id, full_name: row.full_name, email: row.email, title: row.title, designations: row.designations, status: "active", created_by: userId,
      }).select("id").single();
      if (error || !c) throw new Error(error?.message ?? "Could not add that contact.");
      contactId = c.id;
    }
  } else if (input.candidateKey?.startsWith("contact:")) {
    contactId = input.candidateKey.slice(8);
  } else if (input.candidateKey?.startsWith("person:")) {
    personId = input.candidateKey.slice(7);
    const { data: mgrs } = await db().from("fund_managers").select("user_id").eq("offering_id", input.offeringId);
    const { data: p } = await db().from("persons").select("id, user_id").eq("id", personId).maybeSingle();
    if (!p || !((mgrs ?? []) as any[]).some((m) => m.user_id === p.user_id)) throw new Error("That person is not listed on this Fund.");
  } else {
    throw new Error("Choose a person or add a new one.");
  }

  if (contactId) {
    const { data: c } = await db().from("client_contacts").select("*").eq("id", contactId).maybeSingle();
    if (!c || c.client_id !== o.client_id) throw new Error("That contact is not on this Fund's Client.");
    personId = await personForContact(userId, c, Boolean(input.confirmSeparate));
    const d = new Set<string>(c.designations ?? []); d.add("Signatory");
    await db().from("client_contacts").update({ designations: [...d] }).eq("id", contactId);
  }

  const { count } = await db().from("fund_signatories").select("id", { count: "exact", head: true }).eq("offering_id", input.offeringId).eq("status", "active");
  const primary = Boolean(input.makePrimary) || !count;
  if (primary) await db().from("fund_signatories").update({ is_primary: false }).eq("offering_id", input.offeringId).eq("status", "active");
  const { error } = await db().from("fund_signatories").insert({
    offering_id: input.offeringId, person_id: personId, client_contact_id: contactId, title: input.title?.trim() || null,
    capacity: input.capacity?.trim() || null, is_primary: primary, added_by: userId,
  });
  if (error) throw new Error(error.code === "23505" ? "That person is already a signatory for this Fund." : error.message);
  if (primary) await syncPrimary(input.offeringId);
  await audit(input.offeringId, userId, "fund_signatory_added", "Fund signatory added", { personId, contactId, primary });
  return { ok: true };
}

export async function updateFundSignatory(userId: string, input: { offeringId: string; id: string; title?: string | null | undefined; capacity?: string | null | undefined; makePrimary?: boolean | undefined; remove?: boolean | undefined }) {
  const actor = await staffFor(userId, input.offeringId);
  if (!actor.isStaff) forbid("only Harmonious can change Fund signatories.");
  const { data: row } = await db().from("fund_signatories").select("*").eq("id", input.id).eq("offering_id", input.offeringId).eq("status", "active").maybeSingle();
  if (!row) throw new Error("Signatory not found.");
  if (input.remove) {
    await db().from("fund_signatories").update({ status: "removed", is_primary: false, removed_by: userId, removed_at: new Date().toISOString() }).eq("id", row.id);
    if (row.is_primary) {
      const { data: next } = await db().from("fund_signatories").select("id").eq("offering_id", input.offeringId).eq("status", "active").order("added_at").limit(1).maybeSingle();
      if (next) await db().from("fund_signatories").update({ is_primary: true }).eq("id", next.id);
      await syncPrimary(input.offeringId);
    }
    await audit(input.offeringId, userId, "fund_signatory_removed", "Fund signatory removed", { personId: row.person_id });
    return { ok: true };
  }
  if (input.makePrimary && !row.is_primary) {
    await db().from("fund_signatories").update({ is_primary: false }).eq("offering_id", input.offeringId).eq("status", "active");
  }
  await db().from("fund_signatories").update({
    ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity?.trim() || null } : {}),
    ...(input.makePrimary ? { is_primary: true } : {}),
  }).eq("id", row.id);
  if (row.is_primary || input.makePrimary) await syncPrimary(input.offeringId);
  await audit(input.offeringId, userId, "fund_signatory_updated", "Fund signatory updated", { personId: row.person_id, makePrimary: !!input.makePrimary });
  return { ok: true };
}
