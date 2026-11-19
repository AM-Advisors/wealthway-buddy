/**
 * Applies planProfileFill to an existing investment (Harmonious staff only). Blank fields are
 * filled and logged in investor_record_changes (source "document"); everything else becomes an
 * investor_record_suggestions row through proposeUpdate; owners and signers are added through
 * addRelatedPerson (possible matches open a review, never a merge). Nothing is sent or signed.
 */
import { planProfileFill, type FillTable } from "@/lib/investor-profile-fill-model";
import type { ExtractedInvestor } from "@/lib/investor-doc-extract-model";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function completeProfileFromReading(userId: string, input: { onboardingId: string; investor: ExtractedInvestor; sourceRef: string }) {
  const { assertOnboardingAccess, forbid, reconcileAfter } = await import("@/lib/investor-onboarding.server");
  const { role, row } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role !== "staff") forbid("only Harmonious can fill in a profile from documents.");
  const ob: any = row;
  if (ob.removed_at) throw new Error("That investment was removed from the fund.");
  const d = await db();
  const [{ data: person }, { data: profile }, { data: rel }] = await Promise.all([
    d.from("persons").select("*").eq("id", ob.person_id).maybeSingle(),
    ob.investment_profile_id ? d.from("investment_profiles").select("id, profile_type, legal_name, details").eq("id", ob.investment_profile_id).maybeSingle() : { data: null },
    ob.investment_profile_id ? d.from("investment_profile_relationships").select("status, persons(legal_first_name, legal_last_name)").eq("profile_id", ob.investment_profile_id).neq("status", "removed") : { data: [] },
  ]);
  if (!person) throw new Error("That investor's record wasn't found.");
  const { investorEditWindow } = await import("@/lib/manager-edit-window.server");
  const plan = planProfileFill({
    person, profile: profile ?? null, investment: ob,
    relatedNames: ((rel ?? []) as any[]).map((r) => ({ firstName: String(r.persons?.legal_first_name ?? ""), lastName: String(r.persons?.legal_last_name ?? "") })),
    claimed: !!person.user_id, editWindowOpen: await investorEditWindow(ob),
  }, input.investor);

  const sourceRef = input.sourceRef.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "documents";
  const ids: Record<FillTable, string | null> = { persons: person.id, investment_profiles: profile?.id ?? null, investor_onboardings: ob.id };
  const filled: string[] = [], suggested: string[] = [], changes: any[] = [];
  for (const table of ["persons", "investment_profiles", "investor_onboardings"] as FillTable[]) {
    const items = plan.fill.filter((x) => x.table === table);
    const id = ids[table];
    if (!items.length || !id) continue;
    const patch = Object.fromEntries(items.map((x) => [x.field, x.value]));
    const { error } = await d.from(table).update(patch).eq("id", id);
    if (error) { console.error("[profile-fill]", table, error.message); continue; }
    for (const x of items) {
      filled.push(x.label);
      changes.push({ offering_id: ob.offering_id, onboarding_id: ob.id, subject_table: table, subject_id: id, field: x.field, old_value: null, new_value: x.value, source: "document", actor_user_id: userId, manager_visible: x.field !== "date_of_birth" });
    }
  }
  if (Object.keys(plan.details).length && profile?.id) {
    const next = { ...(profile.details ?? {}), ...plan.details };
    const { error } = await d.from("investment_profiles").update({ details: next }).eq("id", profile.id);
    if (!error) for (const [k, v] of Object.entries(plan.details)) {
      filled.push(k === "trustType" ? "trust type" : k);
      changes.push({ offering_id: ob.offering_id, onboarding_id: ob.id, subject_table: "investment_profiles", subject_id: profile.id, field: `details.${k}`, old_value: null, new_value: v, source: "document", actor_user_id: userId, manager_visible: true });
    }
  }
  if (changes.length) await d.from("investor_record_changes").insert(changes);

  const { proposeUpdate } = await import("@/lib/investor-record.server");
  for (const x of plan.suggest) {
    if (x.table === "investment_profiles" && !profile?.id) continue;
    try {
      const r = await proposeUpdate(userId, { onboardingId: ob.id, subjectTable: x.table, field: x.field, proposed: x.value, source: "document", sourceRef });
      if (r.created) suggested.push(x.label);
    } catch (e) { console.error("[profile-fill] suggestion", x.field, (e as Error).message); }
  }

  let related = 0, underReview = 0;
  if (plan.related.length && profile?.id) {
    const { addRelatedPerson } = await import("@/lib/related-person.server");
    for (const r of plan.related) {
      try {
        const res = await addRelatedPerson({ profileId: profile.id, offeringId: ob.offering_id, firstName: r.firstName, lastName: r.lastName, email: r.email, role: r.isSigner && r.role === "beneficial_owner" ? "authorized_signer" : r.role, ownershipPercent: r.ownershipPercent ? Number(r.ownershipPercent) : null, isSigner: r.isSigner, actorUserId: userId, entrySource: "document" });
        related++; if (res.underReview) underReview++;
      } catch (e) { console.error("[profile-fill] related", (e as Error).message); }
    }
  }

  await d.from("investor_onboarding_events").insert({ onboarding_id: ob.id, offering_id: ob.offering_id, event: "profile_filled_from_documents", actor_user_id: userId, actor_role: "harmonious", detail: { source: sourceRef, filled: filled.length, suggested: suggested.length, related, related_under_review: underReview } }).then(() => null, () => null);
  if (filled.length || related) await reconcileAfter([ob.id], { actorUserId: userId, trigger: "document_profile_fill" });
  return { filled, suggested, related, underReview };
}
