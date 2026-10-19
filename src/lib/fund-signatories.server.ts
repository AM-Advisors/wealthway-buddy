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
const legalOf = (p: any) => [p?.legal_first_name, p?.legal_middle_name, p?.legal_last_name].filter(Boolean).join(" ");
/** Shows the name someone goes by (e.g. a middle name), keeping the legal name visible. */
const nameOf = (p: any) => (p?.preferred_name ? `${p.preferred_name} ${p.legal_last_name ?? ""}`.trim() : [p?.legal_first_name, p?.legal_last_name].filter(Boolean).join(" ")) || "Unnamed person";
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

export type KycState = "verified" | "in_progress" | "none";

/** Identity-check state per Person: an approved investment KYC, an approved account check,
 *  or a Didit session linked by an append-only confirm_match decision. Read-only. */
async function kycFor(personIds: string[]): Promise<Map<string, KycState>> {
  const out = new Map<string, KycState>();
  if (!personIds.length) return out;
  const [{ data: kyc }, { data: links }, { data: people }] = await Promise.all([
    db().from("kyc_verifications").select("person_id, status").in("person_id", personIds),
    db().from("source_reconciliation_decisions").select("proposed_person_id, source_ref").eq("source", "didit").eq("decision", "confirm_match").in("proposed_person_id", personIds),
    db().from("persons").select("id, user_id").in("id", personIds),
  ]);
  const bump = (id: string, s: KycState) => { const c = out.get(id); if (c !== "verified") out.set(id, s === "verified" ? s : c ?? s); };
  for (const k of (kyc ?? []) as any[]) bump(k.person_id, k.status === "approved" ? "verified" : "in_progress");
  const sessions = ((links ?? []) as any[]).map((l) => l.source_ref).filter(Boolean);
  if (sessions.length) {
    const { data: ev } = await db().from("didit_webhook_events").select("session_id, status").in("session_id", sessions);
    const approved = new Set(((ev ?? []) as any[]).filter((e) => String(e.status ?? "").toLowerCase() === "approved").map((e) => e.session_id));
    for (const l of (links ?? []) as any[]) bump(l.proposed_person_id, approved.has(l.source_ref) ? "verified" : "in_progress");
  }
  const uids = ((people ?? []) as any[]).filter((p) => p.user_id);
  if (uids.length) {
    const { data: checks } = await db().from("account_identity_checks").select("user_id, status").in("user_id", uids.map((p) => p.user_id));
    for (const p of uids) {
      const c = ((checks ?? []) as any[]).filter((x) => x.user_id === p.user_id);
      if (c.some((x) => x.status === "approved")) bump(p.id, "verified");
      else if (c.length) bump(p.id, "in_progress");
    }
  }
  return out;
}

/** People already on the Fund's Client or the Fund, with identity-check state, for click-to-choose pickers. */
export async function listFundPeople(userId: string, offeringId: string) {
  await staffFor(userId, offeringId);
  const { data: o } = await db().from("offerings").select("client_id").eq("id", offeringId).maybeSingle();
  const [{ data: contacts }, { data: managers }] = await Promise.all([
    o?.client_id ? db().from("client_contacts").select("id, full_name, email, title, person_id, user_id, invited_at").eq("client_id", o.client_id).eq("status", "active").is("deactivated_at", null).order("full_name") : { data: [] },
    db().from("fund_managers").select("user_id").eq("offering_id", offeringId),
  ]);
  const managerIds = ((managers ?? []) as any[]).map((m) => m.user_id);
  const { data: managerPeople } = managerIds.length ? await db().from("persons").select("id, user_id, legal_first_name, legal_last_name, preferred_name, email").in("user_id", managerIds) : { data: [] };
  const cPersons = ((contacts ?? []) as any[]).map((c) => c.person_id).filter(Boolean);
  const kyc = await kycFor([...new Set([...cPersons, ...((managerPeople ?? []) as any[]).map((p) => p.id)])]);
  const seen = new Set<string>();
  const people: { key: string; personId: string | null; name: string; email: string | null; title: string | null; source: string; kyc: KycState; hasAccount: boolean; invited: boolean }[] = [];
  for (const c of (contacts ?? []) as any[]) {
    if (c.person_id) seen.add(c.person_id);
    people.push({ key: `contact:${c.id}`, personId: c.person_id ?? null, name: c.full_name, email: c.email ?? null, title: c.title ?? null, source: "Client contact", kyc: (c.person_id && kyc.get(c.person_id)) || "none", hasAccount: Boolean(c.user_id), invited: Boolean(c.invited_at) });
  }
  for (const p of (managerPeople ?? []) as any[]) {
    if (seen.has(p.id)) continue;
    people.push({ key: `person:${p.id}`, personId: p.id, name: nameOf(p), email: p.email ?? null, title: null, source: "Fund manager", kyc: kyc.get(p.id) ?? "none", hasAccount: true, invited: true });
  }
  return { hasClient: Boolean(o?.client_id), people };
}

/** Sends the Harmonious sign-in invitation to a Client contact. On first sign-in the platform
 *  requires their own identity check (Didit) before anything else. Staff only; logged. */
async function sendContactInvite(userId: string, contactId: string) {
  const { data: c } = await db().from("client_contacts").select("*").eq("id", contactId).maybeSingle();
  if (!c) throw new Error("Contact not found.");
  if (!c.email) throw new Error("Add an email address before sending the invitation.");
  const { data: client } = await db().from("clients").select("name").eq("id", c.client_id).maybeSingle();
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const day = new Date().toISOString().slice(0, 10);
  await sendTemplateEmail("client-admin-alert", String(c.email).toLowerCase(), {
    templateData: {
      contactName: c.full_name,
      headline: `You're invited to ${client?.name ?? "a Harmonious client"} on Harmonious`,
      intro: `${client?.name ?? "A Harmonious client"} added you on Harmonious. When you sign in you'll complete a short identity check and your onboarding.`,
      actionLabel: "Sign in to Harmonious",
      actionUrl: "https://app.harmonious.co/auth",
      footnote: "Sign in or create an account with this email address.",
    },
    idempotencyKey: `client-contact-invite-${c.id}-${day}`,
  });
  await db().from("client_contacts").update({ invited_at: new Date().toISOString(), invite_count: (c.invite_count ?? 0) + 1, last_invited_by: userId, invite_cancelled_at: null }).eq("id", c.id);
  await db().from("client_contact_events").insert({ contact_id: c.id, client_id: c.client_id, actor_id: userId, event_kind: c.invited_at ? "invite_resent" : "invited", detail: { email: c.email, via: "fund_setup" } });
}

/** Find or add a Client contact by email for this Fund, then send the identity-check + onboarding invitation. */
export async function inviteFundPerson(userId: string, input: { offeringId: string; contactKey?: string | null | undefined; fullName?: string | null | undefined; email?: string | null | undefined }) {
  // Staff or this fund's managers (client self-service). Contacts stay scoped to the fund's own client; identity checks are unchanged.
  await staffFor(userId, input.offeringId);
  const { data: o } = await db().from("offerings").select("client_id").eq("id", input.offeringId).maybeSingle();
  if (!o?.client_id) throw new Error("Link this Fund to a Client before inviting people.");
  let contactId = input.contactKey?.startsWith("contact:") ? input.contactKey.slice(8) : null;
  if (contactId) {
    const { data: c } = await db().from("client_contacts").select("client_id").eq("id", contactId).maybeSingle();
    if (c?.client_id !== o.client_id) throw new Error("That contact is not on this Fund's Client.");
  } else {
    const email = input.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email to send the invitation.");
    const { data: ex } = await db().from("client_contacts").select("id").eq("client_id", o.client_id).ilike("email", email).eq("status", "active").limit(1).maybeSingle();
    if (ex) contactId = ex.id;
    else {
      const { data: c, error } = await db().from("client_contacts").insert({ client_id: o.client_id, full_name: (input.fullName ?? email).trim(), email, status: "active", created_by: userId }).select("id").single();
      if (error || !c) throw new Error(error?.message ?? "Could not add that contact.");
      contactId = c.id;
    }
  }
  await sendContactInvite(userId, contactId!);
  await audit(input.offeringId, userId, "fund_person_invited", "Identity check and onboarding invitation sent", { contactId });
  return { ok: true };
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
    personIds.length ? db().from("persons").select("id, legal_first_name, legal_middle_name, legal_last_name, preferred_name, email").in("id", personIds) : { data: [] },
    managerIds.length ? db().from("persons").select("id, legal_first_name, legal_middle_name, legal_last_name, preferred_name, email").in("user_id", managerIds) : { data: [] },
  ]);
  const pMap = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  const contactPersons = ((contacts ?? []) as any[]).map((c) => c.person_id).filter(Boolean);
  const kyc = await kycFor([...new Set([...personIds, ...contactPersons, ...((managerPeople ?? []) as any[]).map((p) => p.id)])]);
  const taken = new Set(personIds);
  const candidates = [
    ...((contacts ?? []) as any[]).filter((c) => !c.person_id || !taken.has(c.person_id))
      .map((c) => ({ key: `contact:${c.id}`, name: c.full_name as string, detail: [c.title, c.email].filter(Boolean).join(" · ") || "Client contact", source: "Client contact", email: (c.email ?? null) as string | null, kyc: ((c.person_id && kyc.get(c.person_id)) || "none") as KycState, hasAccount: Boolean(c.user_id) })),
    ...((managerPeople ?? []) as any[]).filter((p) => !taken.has(p.id))
      .map((p) => ({ key: `person:${p.id}`, name: nameOf(p), detail: p.email ?? "Fund manager", source: "Fund manager", email: (p.email ?? null) as string | null, kyc: (kyc.get(p.id) ?? "none") as KycState, hasAccount: true })),
  ];
  return {
    canEdit: actor.isStaff,
    hasClient: Boolean(o?.client_id),
    signatories: ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string, personId: r.person_id as string, name: nameOf(pMap.get(r.person_id)), legalName: legalOf(pMap.get(r.person_id)) || null, preferredName: (pMap.get(r.person_id)?.preferred_name ?? null) as string | null, email: (pMap.get(r.person_id)?.email ?? null) as string | null,
      title: r.title as string | null, capacity: r.capacity as string | null, isPrimary: Boolean(r.is_primary), kyc: (kyc.get(r.person_id) ?? "none") as KycState, contactId: (r.client_contact_id ?? null) as string | null,
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
  sendInvite?: boolean | undefined;
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
  let invited = false;
  if (input.sendInvite && contactId) {
    await sendContactInvite(userId, contactId);
    await audit(input.offeringId, userId, "fund_person_invited", "Identity check and onboarding invitation sent", { contactId, personId });
    invited = true;
  }
  return { ok: true, invited };
}

export async function updateFundSignatory(userId: string, input: { offeringId: string; id: string; title?: string | null | undefined; capacity?: string | null | undefined; preferredName?: string | null | undefined; email?: string | null | undefined; makePrimary?: boolean | undefined; remove?: boolean | undefined }) {
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
  if (input.preferredName !== undefined || input.email !== undefined) {
    const { data: person } = await db().from("persons").select("id, user_id, preferred_name, email").eq("id", row.person_id).maybeSingle();
    if (!person) throw new Error("Signatory person not found.");
    const patch: Record<string, unknown> = {};
    if (input.preferredName !== undefined) patch["preferred_name"] = input.preferredName?.trim() || null;
    if (input.email !== undefined) {
      if (person.user_id) throw new Error("This person has their own sign-in; their email can only change from their account.");
      const e = input.email?.trim().toLowerCase() || null;
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("Enter a valid email.");
      patch["email"] = e;
    }
    await db().from("persons").update(patch).eq("id", person.id);
    if (row.client_contact_id && patch["email"] !== undefined) await db().from("client_contacts").update({ email: patch["email"] }).eq("id", row.client_contact_id);
    await audit(input.offeringId, userId, "fund_signatory_person_updated", "Signatory name/email updated", { personId: person.id, before: { preferredName: person.preferred_name, email: person.email }, after: patch });
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
