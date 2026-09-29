/**
 * Server side of the canonical Person Resolution Service. The only place that
 * looks up Person candidates for identity matching; callers keep their own
 * authorization and never receive unmasked candidate details from here.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  normEmail, personCreationLockKey, resolvePerson, splitName,
  type PersonResolution, type PersonSignals, type ResolutionCandidate,
} from "@/lib/person-resolution";

const db = () => supabaseAdmin as any;

export async function findPersonCandidates(s: PersonSignals, opts: { unclaimedOnly?: boolean; limit?: number } = {}): Promise<ResolutionCandidate[]> {
  const limit = opts.limit ?? 10;
  const ids = new Set<string>();
  const email = normEmail(s.email);
  const scope = (q: any) => (opts.unclaimedOnly ? q.is("user_id", null) : q);
  if (email) {
    const { data } = await scope(db().from("persons").select("id").ilike("email", email)).limit(limit);
    (data ?? []).forEach((p: any) => ids.add(p.id));
  }
  const first = (s.firstName ?? splitName(s.fullName).first ?? "").trim();
  const last = (s.lastName ?? splitName(s.fullName).last ?? "").trim();
  if (first && last) {
    const { data } = await scope(db().from("persons").select("id").ilike("legal_first_name", first).ilike("legal_last_name", last)).limit(limit);
    (data ?? []).forEach((p: any) => ids.add(p.id));
  }
  const entity = String(s.entityName ?? "").trim();
  if (entity.length >= 3) {
    const { data } = await db().from("investment_profiles").select("person_id").ilike("legal_name", entity).not("person_id", "is", null).limit(limit);
    (data ?? []).forEach((p: any) => ids.add(p.person_id));
  }
  if (!ids.size) return [];
  const list = [...ids];
  const [{ data: people }, { data: profiles }] = await Promise.all([
    db().from("persons").select("id, user_id, email, legal_first_name, legal_last_name").in("id", list),
    db().from("investment_profiles").select("person_id, legal_name").in("person_id", list),
  ]);
  return ((people ?? []) as any[])
    .filter((p) => !opts.unclaimedOnly || !p.user_id)
    .map((p) => ({
      id: p.id, email: p.email, firstName: p.legal_first_name, lastName: p.legal_last_name, userId: p.user_id,
      profileLegalNames: ((profiles ?? []) as any[]).filter((x) => x.person_id === p.id).map((x) => x.legal_name),
    }));
}

export async function resolvePersonServer(s: PersonSignals, opts: { unclaimedOnly?: boolean } = {}): Promise<PersonResolution> {
  return resolvePerson(s, await findPersonCandidates(s, opts));
}

/**
 * Serializes Person creation for one identity. Inside the lock the caller must
 * re-run resolution, so a request that lost the race sees the Person the other
 * request just created and reuses it or opens review instead of duplicating.
 */
export async function withPersonCreationLock<T>(s: PersonSignals, fn: () => Promise<T>): Promise<T> {
  const key = personCreationLockKey(s);
  if (!key) return fn();
  const token = crypto.randomUUID();
  let got = false;
  for (let i = 0; i < 20 && !got; i++) {
    const { data, error } = await db().rpc("acquire_person_creation_lock", { _key: key, _token: token });
    if (error) throw new Error("Could not check for an existing person. Try again.");
    got = data === true;
    if (!got) await new Promise((r) => setTimeout(r, 150));
  }
  if (!got) throw new Error("Another save for this person is in progress. Refresh and try again.");
  try {
    return await fn();
  } finally {
    await db().rpc("release_person_creation_lock", { _key: key, _token: token });
  }
}
