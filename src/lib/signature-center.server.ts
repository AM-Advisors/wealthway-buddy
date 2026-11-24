/**
 * Read-only loader for the Signatures view. Projects the existing signing
 * records (fund_file_signatures, document_signatures + document_signature_signers)
 * and subscriptions not opened yet. Never writes; reminders reuse the existing
 * senders (remindFileSignerFn, emailFundSignatoryFn, sendSigningReminder).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { signatureConfirmed } from "@/lib/signature-confirmed";
import { agreementKind, itemView, isViewersTurn, type RawItem, type RawSigner, type SignerRole } from "@/lib/signature-center-model";

const d = () => supabaseAdmin as any;
const LIMIT = 2000;

export type RemindAction =
  | { type: "file"; signatureId: string; key: string }
  | { type: "countersign"; offeringId: string; signatureId: string; key: string }
  | { type: "investor"; offeringId: string; onboardingId: string; key: null };

export type SignLink =
  | { type: "file"; signatureId: string }
  | { type: "countersign"; signerId: string }
  | { type: "investment"; onboardingId: string };

export type CenterItem = RawItem & {
  kind: ReturnType<typeof agreementKind>;
  isTest: boolean;
  managed: boolean;
  yourTurn: boolean;
  signLink: SignLink | null;
  remind: RemindAction | null;
  lastRemindedAt: string | null;
  /** Subscription document the investor still signs (Sign now link). */
  signDocId?: string | null;
};

async function chunked<T>(ids: string[], run: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...(await run(ids.slice(i, i + 100))));
  return out;
}
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
const personName = (p: any) => (p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "") || null;

/** Funds this person may manage: staff see all; managers/client team see their client's funds. */
export async function managedScope(userId: string): Promise<{ staff: boolean; fundIds: string[] | null; directFundIds: string[] }> {
  const { isStaff } = await import("@/lib/fund-tabs.server");
  if (await isStaff(userId)) return { staff: true, fundIds: null, directFundIds: [] };
  const [{ data: fm }, { data: cu }] = await Promise.all([
    d().from("fund_managers").select("offering_id, offerings(client_id)").eq("user_id", userId),
    d().from("client_users").select("client_id").eq("user_id", userId),
  ]);
  const direct = uniq(((fm ?? []) as any[]).map((r) => r.offering_id));
  const clients = uniq([...((fm ?? []) as any[]).map((r) => r.offerings?.client_id), ...((cu ?? []) as any[]).map((r) => r.client_id)]);
  const { data: clientFunds } = clients.length ? await d().from("offerings").select("id").in("client_id", clients) : { data: [] };
  return { staff: false, fundIds: uniq([...direct, ...((clientFunds ?? []) as any[]).map((o) => o.id)]), directFundIds: direct };
}

export async function loadSignatureCenter(viewer: { userId: string; email: string | null }, opts: { offeringId?: string | undefined; everything?: boolean | undefined }) {
  const scope = await managedScope(viewer.userId);
  if (opts.everything && !scope.staff) throw new Error("Only Harmonious staff can see signatures for every fund.");
  if (opts.offeringId && !scope.staff && !scope.fundIds?.includes(opts.offeringId)) {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(viewer.userId, opts.offeringId);
  }
  // Which funds to list in full. Personal items are always added on top.
  const fundFilter: string[] | null = opts.offeringId ? [opts.offeringId] : opts.everything ? null : (scope.fundIds ?? []);
  const manages = (fundId: string) => scope.staff || (scope.fundIds ?? []).includes(fundId) || opts.offeringId === fundId;
  // Subscription and countersign emails are limited to staff or that fund's own managers.
  const managesStrict = (fundId: string) => scope.staff || scope.directFundIds.includes(fundId);
  const email = viewer.email?.trim().toLowerCase() || null;

  // ---- In-app fund file signatures (side letters, operating agreements, other files)
  const ffCols = "id, file_id, offering_id, signer_role, signing_order, signer_name, signer_email, signer_user_id, onboarding_id, status, sent_at, signed_at, created_at, packet_id";
  const ffFund = fundFilter === null
    ? ((await d().from("fund_file_signatures").select(ffCols).neq("status", "cancelled").order("created_at", { ascending: false }).limit(LIMIT)).data ?? [])
    : await chunked(fundFilter, async (p) => (await d().from("fund_file_signatures").select(ffCols).neq("status", "cancelled").in("offering_id", p).limit(LIMIT)).data ?? []);
  const ffMineQ = d().from("fund_file_signatures").select(ffCols).neq("status", "cancelled").limit(500);
  const ffMine = ((await (email ? ffMineQ.or(`signer_user_id.eq.${viewer.userId},signer_email.eq.${email}`) : ffMineQ.eq("signer_user_id", viewer.userId))).data ?? []) as any[];
  const mineFileKeys = new Set(ffMine.map((r) => r.packet_id ?? r.file_id));
  // Pull every peer of a personal row so the whole signing order is shown.
  const extraFiles = uniq(ffMine.map((r) => r.file_id)).filter((id) => !(ffFund as any[]).some((r) => r.file_id === id));
  const ffPeers = await chunked(extraFiles, async (p) => (await d().from("fund_file_signatures").select(ffCols).neq("status", "cancelled").in("file_id", p)).data ?? []);
  const ffRows = new Map<string, any>();
  for (const r of [...(ffFund as any[]), ...ffMine, ...(ffPeers as any[])]) ffRows.set(r.id, r);

  // ---- Subscription signature requests
  const obCols = "id, offering_id, application_id, stage, person_id, investment_profile_id, investor_user_id, is_test_investor, created_at, updated_at";
  const obFund = fundFilter === null
    ? ((await d().from("investor_onboardings").select(obCols).is("removed_at", null).limit(LIMIT)).data ?? [])
    : await chunked(fundFilter, async (p) => (await d().from("investor_onboardings").select(obCols).is("removed_at", null).in("offering_id", p).limit(LIMIT)).data ?? []);
  const obMine = ((await d().from("investor_onboardings").select(obCols).is("removed_at", null).eq("investor_user_id", viewer.userId)).data ?? []) as any[];
  const { data: dssMineRaw } = await d().from("document_signature_signers").select("signature_id").eq("signer_user_id", viewer.userId).limit(500);
  const onboardings = new Map<string, any>();
  for (const o of [...(obFund as any[]), ...obMine]) onboardings.set(o.id, o);
  const mineOb = new Set(obMine.map((o) => o.id));
  const byApp = new Map<string, any>();
  for (const o of onboardings.values()) if (o.application_id) byApp.set(o.application_id, o);

  const dsCols = "id, application_id, offering_document_id, signer_name, signer_email, signed_at, provider, provider_status, provider_sent_at, provider_completed_at, executed_at, cancelled_at, superseded_by";
  let dsRows = await chunked([...byApp.keys()], async (p) => (await d().from("document_signatures").select(dsCols).in("application_id", p).is("cancelled_at", null).is("superseded_by", null)).data ?? []) as any[];
  const mineSigIds = uniq(((dssMineRaw ?? []) as any[]).map((r) => r.signature_id)).filter((id) => !dsRows.some((s) => s.id === id));
  if (mineSigIds.length) {
    const extra = await chunked(mineSigIds, async (p) => (await d().from("document_signatures").select(dsCols).in("id", p).is("cancelled_at", null).is("superseded_by", null)).data ?? []) as any[];
    dsRows = [...dsRows, ...extra];
    const missingApps = uniq(extra.map((s) => s.application_id)).filter((a) => !byApp.has(a));
    const extraOb = await chunked(missingApps, async (p) => (await d().from("investor_onboardings").select(obCols).is("removed_at", null).in("application_id", p)).data ?? []) as any[];
    for (const o of extraOb) { onboardings.set(o.id, o); byApp.set(o.application_id, o); }
  }
  const mineSig = new Set(((dssMineRaw ?? []) as any[]).map((r) => r.signature_id));
  const signerRows = await chunked(dsRows.map((s) => s.id), async (p) => (await d().from("document_signature_signers").select("id, signature_id, offering_id, role_key, signing_order, signer_name, signer_email, signer_user_id, status, sent_at, signed_at, required, created_at, viewed_at, window_opened_at").in("signature_id", p)).data ?? []) as any[];
  const signersBySig = new Map<string, any[]>();
  for (const r of signerRows) signersBySig.set(r.signature_id, [...(signersBySig.get(r.signature_id) ?? []), r]);

  // ---- Lookups
  const fileIds = uniq([...ffRows.values()].map((r) => r.file_id));
  const files = await chunked(fileIds, async (p) => (await d().from("fund_files").select("id, title, template_key, category, created_at, deleted_at").in("id", p)).data ?? []) as any[];
  const fileById = new Map(files.map((f) => [f.id, f]));
  const docIds = uniq(dsRows.map((s) => s.offering_document_id));
  const docs = await chunked(docIds, async (p) => (await d().from("offering_documents").select("id, title, doc_type").in("id", p)).data ?? []) as any[];
  const docById = new Map(docs.map((x) => [x.id, x]));
  const offeringIds = uniq([...[...ffRows.values()].map((r) => r.offering_id), ...[...onboardings.values()].map((o) => o.offering_id)]);
  const offerings = await chunked(offeringIds, async (p) => (await d().from("offerings").select("id, name").in("id", p)).data ?? []) as any[];
  const fundName = new Map(offerings.map((o) => [o.id, o.name as string]));
  const extraObIds = uniq([...ffRows.values()].map((r) => r.onboarding_id)).filter((id) => !onboardings.has(id));
  const extraOb = await chunked(extraObIds, async (p) => (await d().from("investor_onboardings").select(obCols).in("id", p)).data ?? []) as any[];
  for (const o of extraOb) onboardings.set(o.id, o);
  const persons = await chunked(uniq([...onboardings.values()].map((o) => o.person_id)), async (p) => (await d().from("persons").select("id, legal_first_name, legal_last_name, preferred_name, email").in("id", p)).data ?? []) as any[];
  const profiles = await chunked(uniq([...onboardings.values()].map((o) => o.investment_profile_id)), async (p) => (await d().from("investment_profiles").select("id, legal_name").in("id", p)).data ?? []) as any[];
  const personById = new Map(persons.map((p) => [p.id, p]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const investorOf = (o: any) => (o ? profileById.get(o.investment_profile_id)?.legal_name || personName(personById.get(o.person_id)) : null);

  const items: CenterItem[] = [];
  const role = (r: string | null | undefined): SignerRole => (r === "fund_manager" || r === "fund_signatory" ? "fund_signatory" : r === "investor" || !r ? "investor" : "other");

  // Fund files, grouped by packet (or file for single-round sends).
  const groups = new Map<string, any[]>();
  for (const r of ffRows.values()) { const k = r.packet_id ?? r.file_id; groups.set(k, [...(groups.get(k) ?? []), r]); }
  for (const [key, rows] of groups) {
    const file = fileById.get(rows[0].file_id);
    if (!file || file.deleted_at) continue;
    const offeringId = rows[0].offering_id as string;
    const personal = mineFileKeys.has(key);
    if (!personal && fundFilter !== null && !fundFilter.includes(offeringId)) continue;
    const ob = onboardings.get(rows.find((r) => r.onboarding_id)?.onboarding_id);
    const signers: RawSigner[] = rows.map((r) => ({ id: r.id, name: r.signer_name, email: r.signer_email, userId: r.signer_user_id, role: role(r.signer_role), order: r.signing_order ?? 1, status: r.status, sentAt: r.sent_at, signedAt: r.signed_at }));
    items.push(finish({ id: `ff:${key}`, source: "fund_file", offeringId, fundName: fundName.get(offeringId) ?? "Fund", title: file.title, kindHint: file.template_key ?? file.category, investorName: investorOf(ob) ?? rows.find((r) => r.signer_role === "investor")?.signer_name ?? null, onboardingId: ob?.id ?? null, createdAt: rows.map((r) => r.created_at).sort()[0] ?? file.created_at, executedAt: null, signers }, ob));
  }

  // Subscription signature requests (one per document per investment).
  for (const s of dsRows) {
    const ob = byApp.get(s.application_id);
    if (!ob) continue;
    const personal = mineSig.has(s.id) || mineOb.has(ob.id);
    if (!personal && fundFilter !== null && !fundFilter.includes(ob.offering_id)) continue;
    const doc = docById.get(s.offering_document_id);
    const rows = signersBySig.get(s.id) ?? [];
    const signers: RawSigner[] = rows.length
      ? rows.filter((r) => r.required !== false).map((r) => ({ id: r.id, name: r.signer_name, email: r.signer_email, userId: r.signer_user_id, role: role(r.role_key), order: r.signing_order ?? 1, status: r.status, sentAt: r.sent_at, signedAt: r.signed_at, viewedAt: r.viewed_at ?? null, windowOpenedAt: r.window_opened_at ?? null }))
      : [{ id: s.id, name: s.signer_name ?? investorOf(ob), email: s.signer_email, userId: ob.investor_user_id, role: "investor", order: 1, status: signatureConfirmed(s) ? "signed" : "waiting", sentAt: s.provider_sent_at, signedAt: signatureConfirmed(s) ? (s.provider_completed_at ?? s.signed_at) : null }];
    items.push(finish({ id: `ds:${s.id}`, source: "subscription", offeringId: ob.offering_id, fundName: fundName.get(ob.offering_id) ?? "Fund", title: doc?.title ?? "Subscription Agreement", kindHint: doc?.doc_type ?? null, investorName: investorOf(ob), onboardingId: ob.id, createdAt: s.provider_sent_at ?? rows[0]?.created_at ?? null, executedAt: s.executed_at, signers, signDocId: s.offering_document_id } as RawItem, ob, s.id));
  }

  // Investments at the signing step that haven't opened their subscription yet.
  const withSig = new Set(dsRows.map((s) => s.application_id));
  for (const ob of onboardings.values()) {
    if (ob.stage !== "signature" || (ob.application_id && withSig.has(ob.application_id))) continue;
    if (!mineOb.has(ob.id) && fundFilter !== null && !fundFilter.includes(ob.offering_id)) continue;
    const p = personById.get(ob.person_id);
    items.push(finish({ id: `ns:${ob.id}`, source: "subscription_not_started", offeringId: ob.offering_id, fundName: fundName.get(ob.offering_id) ?? "Fund", title: "Subscription Agreement", kindHint: "subscription", investorName: investorOf(ob), onboardingId: ob.id, createdAt: ob.updated_at ?? ob.created_at, executedAt: null, signers: [{ id: ob.id, name: investorOf(ob) ?? personName(p), email: p?.email ?? null, userId: ob.investor_user_id, role: "investor", order: 1, status: "waiting", sentAt: null, signedAt: null }] }, ob));
  }

  function finish(raw: RawItem, ob: any, signatureId?: string): CenterItem {
    const view = itemView(raw);
    const managed = manages(raw.offeringId);
    const yourTurn = isViewersTurn(view, viewer);
    const w = view.waitingOn;
    let signLink: SignLink | null = null;
    if (yourTurn && w) {
      if (raw.source === "fund_file") signLink = { type: "file", signatureId: w.id };
      else if (w.role === "fund_signatory") signLink = { type: "countersign", signerId: w.id };
      else if (raw.onboardingId) signLink = { type: "investment", onboardingId: raw.onboardingId };
    }
    let remind: RemindAction | null = null;
    if (managed && w && view.status === "waiting" && !yourTurn) {
      if (raw.source === "fund_file") remind = { type: "file", signatureId: w.id, key: `file-sign:${w.id}` };
      else if (!managesStrict(raw.offeringId)) remind = null;
      else if (w.role === "fund_signatory" && signatureId) remind = { type: "countersign", offeringId: raw.offeringId, signatureId, key: `fund-signatory:${signatureId}:${w.id}` };
      else if (raw.onboardingId && w.role === "investor") remind = { type: "investor", offeringId: raw.offeringId, onboardingId: raw.onboardingId, key: null };
    }
    // People who only sign see names, never other signers' email addresses.
    const signers = managed ? raw.signers : raw.signers.map((s) => ({ ...s, email: null }));
    return { ...raw, signDocId: (raw as any).signDocId ?? null, signers, kind: agreementKind(raw.title, raw.kindHint), isTest: !!ob?.is_test_investor, managed, yourTurn, signLink, remind, lastRemindedAt: null };
  }

  const keys = uniq(items.map((i) => i.remind?.key));
  if (keys.length) {
    const { lastRemindersByKeys } = await import("@/lib/signing-reminder.server");
    const last = await lastRemindersByKeys(keys);
    for (const i of items) if (i.remind?.key) i.lastRemindedAt = last[i.remind.key] ?? null;
  }

  const funds = uniq(items.filter((i) => i.managed).map((i) => i.offeringId)).map((id) => ({ id, name: fundName.get(id) ?? "Fund" })).sort((a, b) => a.name.localeCompare(b.name));
  return { staff: scope.staff, managesAny: scope.staff || (scope.fundIds?.length ?? 0) > 0, funds, items };
}
