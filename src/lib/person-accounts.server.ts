// Staff-only: separate login accounts recorded as belonging to one person, for long-term insight
// (lockouts, ID expiry, watchlist alerts). Never merges accounts, shares records or grants access.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "@/lib/investor-onboarding.server";
import { samePersonCandidate } from "@/lib/person-identity-model";

const db = () => supabaseAdmin as any;

async function email(id: string) {
  const { data } = await db().auth.admin.getUserById(id);
  return (data?.user?.email as string | undefined) ?? "Unknown";
}

async function latestCheck(userId: string) {
  const { data } = await db().from("account_identity_checks").select("id, status, review_details, updated_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as any;
}

function summary(c: any) {
  const id = c?.review_details?.idDocument ?? {};
  return {
    status: (c?.status as string | undefined) ?? "not_started",
    idExpires: (id.expires as string | undefined) ?? null,
    idExpired: id.expires ? new Date(id.expires) < new Date() : false,
    watchlistHits: Number(c?.review_details?.aml?.totalHits ?? 0),
  };
}

const fp = (c: any) => ({ dateOfBirth: c?.review_details?.idDocument?.dateOfBirth ?? null, idLast4: c?.review_details?.idDocument?.numberLast4 ?? null, livenessStatus: c?.review_details?.liveness?.status ?? null, faceMatchStatus: c?.review_details?.faceMatch?.status ?? null });

export async function personAccounts(actor: string, userId: string) {
  await assertStaff(actor);
  const { data: me } = await db().from("person_account_group_members").select("group_id").eq("user_id", userId).is("removed_at", null).maybeSingle();
  const members: any[] = me ? ((await db().from("person_account_group_members").select("user_id, added_at, note").eq("group_id", me.group_id).is("removed_at", null)).data ?? []) : [];
  const accounts = await Promise.all(members.map(async (m) => ({ userId: m.user_id, email: await email(m.user_id), addedAt: m.added_at, note: m.note, ...summary(await latestCheck(m.user_id)) })));
  // Suggestions: same date of birth + ID number only, never name.
  const mine = await latestCheck(userId);
  const suggestions: { userId: string; email: string }[] = [];
  if (fp(mine).dateOfBirth && fp(mine).idLast4) {
    const { data } = await db().from("account_identity_checks").select("user_id, review_details").neq("user_id", userId)
      .eq("review_details->idDocument->>dateOfBirth", fp(mine).dateOfBirth).eq("review_details->idDocument->>numberLast4", fp(mine).idLast4).limit(20);
    const grouped = new Set(members.map((m) => m.user_id));
    for (const c of (data ?? []) as any[]) {
      if (grouped.has(c.user_id) || suggestions.some((s) => s.userId === c.user_id) || !samePersonCandidate(fp(mine), fp(c))) continue;
      suggestions.push({ userId: c.user_id, email: await email(c.user_id) });
    }
  }
  return { grouped: !!me, accounts, suggestions };
}

export async function linkPersonAccount(actor: string, userId: string, otherEmail: string, note: string | null) {
  await assertStaff(actor);
  const { data: prof } = await db().from("profiles").select("id").ilike("email", otherEmail.trim()).maybeSingle();
  const otherId = prof?.id as string | undefined;
  if (!otherId) throw new Error("No account found with that email.");
  if (otherId === userId) throw new Error("That's this same account.");
  const active = async (u: string) => (await db().from("person_account_group_members").select("group_id").eq("user_id", u).is("removed_at", null).maybeSingle()).data?.group_id as string | undefined;
  const [g1, g2] = [await active(userId), await active(otherId)];
  if (g1 && g2 && g1 !== g2) throw new Error("Both accounts are already in different groups. Remove one first.");
  const group = g1 ?? g2 ?? crypto.randomUUID();
  const rows = [userId, otherId].filter((u, i) => !(i === 0 ? g1 : g2)).map((u) => ({ group_id: group, user_id: u, added_by: actor, note }));
  if (rows.length) { const { error } = await db().from("person_account_group_members").insert(rows); if (error) throw new Error(error.message); }
  return { ok: true };
}

export async function unlinkPersonAccount(actor: string, userId: string) {
  await assertStaff(actor);
  await db().from("person_account_group_members").update({ removed_at: new Date().toISOString(), removed_by: actor }).eq("user_id", userId).is("removed_at", null);
  return { ok: true };
}
