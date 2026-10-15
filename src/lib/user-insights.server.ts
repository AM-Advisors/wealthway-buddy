import { emailOutcome, parseEmailAttempt, setupGaps } from "@/lib/user-insights-model";

const TABLES = ["staff_invitations", "client_invitations", "fund_invitations", "client_contacts"] as const;
const PERSON_FIELDS = "id,user_id,email,legal_first_name,legal_last_name,phone,address_line1,city,region,postal_code,kyc_status,aml_status,onboarding_state";
export async function invitationSummaries(db: any, emails?: string[]) {
  const results = await Promise.all(TABLES.map(async table => {
    let q = db.from(table).select("*").order("created_at", { ascending: false });
    if (emails) q = q.in("email", emails);
    const { data, error } = await q.limit(10000);
    if (error) throw new Error("Could not load invitation history.");
    return (data ?? []).map((r: any) => ({ ...r, table }));
  }));
  const rows = results.flat();
  const ids = rows.map((r: any) => r.id);
  const { data: audits, error } = ids.length ? await db.from("user_access_events").select("id,subject_id,action,reason,actor_id,created_at").in("subject_id", ids).in("action", ["email_sent", "email_failed"]).order("created_at", { ascending: false }).limit(20000) : { data: [], error: null };
  if (error) throw new Error("Could not load invitation send history.");
  const actorIds = [...new Set(rows.map((r: any) => r.invited_by ?? r.last_invited_by).concat((audits ?? []).map((r: any) => r.actor_id)).filter(Boolean))];
  const { data: actors } = actorIds.length ? await db.from("profiles").select("user_id,legal_name,email").in("user_id", actorIds) : { data: [] };
  const names = new Map((actors ?? []).map((r: any) => [r.user_id, r.legal_name || r.email]));
  return rows.map((r: any) => {
    const attempts = (audits ?? []).filter((a: any) => a.subject_id === r.id).map(parseEmailAttempt).filter(Boolean);
    const sent = attempts.filter((a: any) => a.status === "sent");
    const last = attempts[0] ?? null;
    // Legacy timestamps are reported separately, never treated as proven sends.
    return { id: r.id, table: r.table, email: String(r.email ?? "").toLowerCase(), name: r.invited_name ?? r.full_name ?? "", status: r.status, role: r.invite_role ?? r.client_role ?? r.role ?? "Client contact", createdAt: r.created_at, expiresAt: r.expires_at ?? null, acceptedAt: r.accepted_at ?? null, reportedSentAt: r.last_sent_at ?? r.invite_sent_at ?? r.invited_at ?? null, firstSent: sent.at(-1)?.at ?? null, lastSent: sent[0]?.at ?? null, attempts, invitedBy: names.get(r.invited_by ?? r.last_invited_by) ?? "—", lastSender: last ? names.get(last.actorId) ?? "—" : null, outcome: emailOutcome(last, [], true), isTestDemo: !!r.is_test_demo };
  });
}

export async function directoryInsights(db: any, people: any[]) {
  const [invitations, { data: persons, error }, { data: onboardings, error: onboardingError }] = await Promise.all([
    invitationSummaries(db),
    db.from("persons").select(PERSON_FIELDS).limit(20000),
    db.from("investor_onboardings").select("person_id,investor_user_id,questionnaire_submitted_at,stage,funding_status").is("removed_at", null).limit(20000),
  ]);
  if (error || onboardingError) throw new Error("Could not load setup progress.");
  return { invitations, people: people.map(p => {
    const linked = (persons ?? []).filter((x: any) => x.user_id === p.id);
    const gaps = [...new Set(linked.length ? linked.flatMap((x: any) => setupGaps(x, p.types.includes("Employee"))) : setupGaps(null, p.types.includes("Employee")))];
    if (!p.types.includes("Employee") && (onboardings ?? []).some((o: any) => (o.investor_user_id === p.id || linked.some((x: any) => x.id === o.person_id)) && !o.questionnaire_submitted_at)) gaps.push("Questionnaire");
    const mine = invitations.filter((i: any) => i.email === String(p.email).toLowerCase());
    const latest = [...mine].sort((a: any, b: any) => String(b.attempts[0]?.at ?? b.createdAt).localeCompare(String(a.attempts[0]?.at ?? a.createdAt)))[0];
    return { ...p, gaps, latestInvite: latest ?? null };
  }) };
}

export async function personInsights(viewer: string, email: string) {
  const { requireAccessViewer } = await import("@/lib/user-access.server");
  const db = await requireAccessViewer(viewer);
  const invitations = await invitationSummaries(db, [email.toLowerCase()]);
  const { data: profiles, error } = await db.from("profiles").select("user_id,legal_name,email").ilike("email", email);
  if (error) throw new Error("Could not load account details.");
  const accounts = await Promise.all((profiles ?? []).map(async (p: any) => {
    const { data, error } = await db.auth.admin.getUserById(p.user_id);
    if (error) throw new Error("Could not load login status.");
    return { id: p.user_id, name: p.legal_name, createdAt: data?.user?.created_at ?? null, confirmedAt: data?.user?.email_confirmed_at ?? null, lastSignIn: data?.user?.last_sign_in_at ?? null };
  }));
  let providerEvents: any[] = [], providerError: string | null = null;
  const apiKey = process.env["LOVABLE_API_KEY"], key = process.env["BREVO_API_KEY"];
  if (invitations.some((i: any) => i.attempts.some((a: any) => a.messageId))) {
    if (!apiKey || !key) providerError = "Email confirmation is unavailable.";
    else try {
      const url = new URL("https://connector-gateway.lovable.dev/brevo/smtp/statistics/events");
      url.searchParams.set("email", email); url.searchParams.set("limit", "100");
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": key } });
      if (!res.ok) { console.error("Invitation delivery lookup failed", res.status); providerError = `Email service lookup failed (${res.status}).`; }
      else providerEvents = ((await res.json()) as { events?: any[] }).events ?? [];
    } catch { providerError = "Email confirmation could not be loaded."; }
  }
  const { data: persons, error: personError } = accounts.length ? await db.from("persons").select(PERSON_FIELDS).in("user_id", accounts.map(a => a.id)) : { data: [], error: null };
  if (personError) throw new Error("Could not load setup details.");
  const ids = (persons ?? []).map((p: any) => p.id);
  const { data: onboarding, error: onboardingError } = ids.length ? await db.from("investor_onboardings").select("id,offering_id,stage,funding_status,questionnaire_submitted_at").in("person_id", ids).is("removed_at", null) : { data: [], error: null };
  if (onboardingError) throw new Error("Could not load onboarding progress.");
  const { data: roles } = accounts.length ? await db.from("user_roles").select("role").in("user_id", accounts.map(a => a.id)) : { data: [] };
  const staff = (roles ?? []).some((r: any) => ["admin", "super_admin", "operations", "executive", "finance", "tax", "leadership", "account_manager", "client_success"].includes(r.role));
  return { accounts, providerError, invitations: invitations.map((i: any) => ({ ...i, outcome: emailOutcome(i.attempts[0] ?? null, providerEvents, !!providerError), attempts: i.attempts.map((a: any) => ({ ...a, outcome: emailOutcome(a, providerEvents, !!providerError) })) })), setup: (persons ?? []).map((p: any) => ({ id: p.id, name: [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" "), kyc: p.kyc_status, aml: p.aml_status, state: p.onboarding_state, gaps: setupGaps(p, staff) })), onboarding: onboarding ?? [] };
}