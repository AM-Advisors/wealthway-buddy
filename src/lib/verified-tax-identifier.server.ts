import { fullTaxNumber, verifiedEin, verifiedSsn } from '@/lib/verified-tax-identifier';
import { encryptTin, decryptTin } from '@/lib/irs-forms.server';

const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any;
type Target = { table: 'persons' | 'investment_profiles'; id: string; kind: 'ssn' | 'ein' };

async function linkedPersonSession(d: any, personId: string, session: string) {
  const results = await Promise.all([
    d.from('account_identity_checks').select('id').eq('person_id', personId).eq('session_id', session).eq('status', 'approved').limit(1),
    d.from('person_kyc_requests').select('id').eq('person_id', personId).eq('session_id', session).eq('status', 'completed').limit(1),
    d.from('kyc_verifications').select('id').eq('person_id', personId).eq('session_id', session).eq('status', 'approved').limit(1),
    d.from('investor_onboardings').select('id').eq('person_id', personId).eq('questionnaire_didit_session_id', session).is('removed_at', null).limit(1),
  ]);
  if (results.some((r) => r.error)) throw new Error('Verification-to-person link could not be confirmed.');
  return results.some((r) => r.data?.length > 0);
}

/** Never save tax numbers in suggestions, audit payloads or return values. */
async function flagConflict(d: any, target: Target, session: string, actor: string | null) {
  const key = `verified-tax:${session}:${target.table}:${target.id}`;
  const query = d.from('investor_onboardings').select('id,offering_id').is('removed_at', null);
  const { data: obs, error } = await (target.table === 'persons' ? query.eq('person_id', target.id) : query.eq('investment_profile_id', target.id));
  if (error) throw new Error('Tax-number review could not be recorded.');
  for (const ob of obs ?? []) {
    const { data: existing, error: readError } = await d.from('investor_record_suggestions').select('id').eq('source_ref', key).eq('onboarding_id', ob.id).limit(1);
    if (readError) throw new Error('Tax-number review could not be checked.');
    if (existing?.length) continue;
    const { error: writeError } = await d.from('investor_record_suggestions').insert({
      onboarding_id: ob.id, offering_id: ob.offering_id, subject_table: target.table, subject_id: target.id,
      field: 'tax_id_verification_conflict', current_value: 'Tax number already recorded',
      proposed_value: 'Verification differs. Review the original check and use the protected tax-number correction.',
      source: 'provider', source_ref: key, proposed_by: actor,
    });
    if (writeError) throw new Error('Tax-number review could not be recorded.');
  }
}

async function save(d: any, target: Target, number: string, session: string, actor: string | null) {
  const enc = await encryptTin(number);
  const { data: result, error } = await d.rpc('fill_verified_tax_identifier', {
    _subject: target.table, _id: target.id, _kind: target.kind, _ciphertext: enc.ciphertext,
    _iv: enc.iv, _key_version: enc.keyVersion, _last4: number.slice(-4), _session: session, _actor: actor,
  });
  if (error) throw new Error('Verified tax number could not be stored securely.');
  if (result !== 'occupied') return result === 'filled' ? 'filled' : 'missing';
  const { data: stored, error: readError } = await d.rpc(target.table === 'persons' ? 'read_person_tax_id' : 'read_profile_tax_id', target.table === 'persons' ? { _person: target.id } : { _profile: target.id });
  if (readError) throw new Error('Existing tax number could not be checked securely.');
  const row = Array.isArray(stored) ? stored[0] : stored;
  const { data: current, error: currentError } = await d.from(target.table).select(target.table === 'persons' ? 'tax_id_last4' : 'tax_id_type,tax_id_last4').eq('id', target.id).maybeSingle();
  if (currentError) throw new Error('Existing tax-number type could not be checked.');
  const matches = row?.ciphertext && fullTaxNumber(await decryptTin(row.ciphertext, row.iv)) === number;
  if (!matches || (target.table === 'investment_profiles' && current?.tax_id_type && current.tax_id_type !== target.kind)) {
    await flagConflict(d, target, session, actor);
    return 'conflict';
  }
  return 'unchanged';
}

/** Call only from an authoritative verification completion, never from page reads. */
export async function captureVerifiedTaxIdentifiers(input: {
  decision: Record<string, any>; sessionId: string; personId?: string | null;
  onboardingId?: string | null; actorUserId?: string | null; identityApproved?: boolean;
}) {
  const d = await admin();
  const actor = input.actorUserId ?? null;
  let filled = 0;
  let profileId: string | null = null;
  let investorUserId: string | null = null;
  // Tax evidence uses a recorded session, never a callback email or a guessed person.
  if (input.personId && input.identityApproved) {
    const { data: person, error } = await d.from('persons').select('*').eq('id', input.personId).is('merged_into_person_id', null).maybeSingle();
    if (error) throw new Error('Verified person could not be loaded.');
    if (person) {
      investorUserId = person.user_id ?? null;
      const ssn = verifiedSsn(input.decision, person);
      if (ssn && await linkedPersonSession(d, person.id, input.sessionId)) {
        const personSave = await save(d, { table: 'persons', id: person.id, kind: 'ssn' }, ssn, input.sessionId, actor);
        // A conflicting person number must be resolved before copying it anywhere.
        if (personSave === 'conflict' || personSave === 'missing') return { filled: 0 };
        if (personSave === 'filled') filled++;
        const { data: profiles, error: profileError } = await d.from('investment_profiles').select('id').eq('person_id', person.id).eq('profile_type', 'individual');
        if (profileError) throw new Error('Individual tax profiles could not be loaded.');
        for (const profile of profiles ?? []) if (await save(d, { table: 'investment_profiles', id: profile.id, kind: 'ssn' }, ssn, input.sessionId, actor) === 'filled') filled++;
      }
    }
  }
  if (input.onboardingId && input.decision['session_kind'] === 'business') {
    const { data: ob, error } = await d.from('investor_onboardings').select('investment_profile_id,questionnaire_didit_session_id').eq('id', input.onboardingId).is('removed_at', null).maybeSingle();
    if (error) throw new Error('Verified business investment could not be loaded.');
    if (ob?.questionnaire_didit_session_id === input.sessionId && ob.investment_profile_id) {
      const { data: profile, error: profileError } = await d.from('investment_profiles').select('id,legal_name,profile_type').eq('id', ob.investment_profile_id).maybeSingle();
      if (profileError) throw new Error('Verified business profile could not be loaded.');
      if (profile && !['individual','joint','ira','retirement_plan'].includes(profile.profile_type)) {
        profileId = profile.id;
        const ein = verifiedEin(input.decision, profile);
        if (ein && await save(d, { table: 'investment_profiles', id: profile.id, kind: 'ein' }, ein, input.sessionId, actor) === 'filled') filled++;
      }
    }
  }
  if (filled) {
    const { reconcileReadinessForSubjects } = await import('@/lib/investor-onboarding.server');
    await reconcileReadinessForSubjects({ investmentProfileId: profileId, investorUserId }, 'verified_tax_identifier');
  }
  return { filled };
}