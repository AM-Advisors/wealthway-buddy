// Server-only: bank statement ingestion, asset marks, and books-derived figures for one fund.
// Records history only - never moves money, never files anything.
import { assertFund, db, isStaff } from "@/lib/fund-tabs.server";
import { STATEMENT_CATEGORIES, balanceTie, dedupeKey, ruleCategory, type Entry } from "@/lib/fund-books-model";

const BUCKET = "manager-uploads";
const MODEL = "google/gemini-2.5-flash";

/** Live books entries with the investor each bank line was tagged to. */
export async function bookEntries(fundId: string): Promise<Entry[]> {
  const d = await db();
  const [{ data: entries }, { data: tags }] = await Promise.all([
    d.from("fund_ledger_entries").select("entry_date, category, direction, amount_cents, bank_transaction_id").eq("offering_id", fundId).is("voided_at", null),
    d.from("fund_transaction_tags").select("bank_transaction_id, onboarding_id").eq("offering_id", fundId),
  ]);
  const tag = new Map(((tags ?? []) as any[]).map((t) => [String(t.bank_transaction_id), t.onboarding_id ?? null]));
  return ((entries ?? []) as any[]).map((e) => ({ entry_date: String(e.entry_date), category: String(e.category), direction: e.direction, amount_cents: Number(e.amount_cents), onboarding_id: e.bank_transaction_id ? tag.get(String(e.bank_transaction_id)) ?? null : null }));
}

type Parsed = { bank_name?: string | null; account_mask?: string | null; period_start?: string | null; period_end?: string | null; opening_balance?: number | null; closing_balance?: number | null;
  transactions: { date: string; description: string; amount: number; direction: "in" | "out"; category?: string | null; investor_name?: string | null }[] };

async function readWithAi(fileName: string, contentType: string, base64: string, investors: string[]): Promise<Parsed> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The statement reader isn't available right now.");
  const isText = /csv|text/.test(contentType) || /\.(csv|txt)$/i.test(fileName);
  const doc = isText
    ? { type: "text", text: `Statement file ${fileName}:\n${Buffer.from(base64, "base64").toString("utf8").slice(0, 300_000)}` }
    : { type: "file", file: { filename: fileName, file_data: `data:${contentType || "application/pdf"};base64,${base64}` } };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You read bank statements for an investment fund. Extract every transaction exactly as printed. Amounts are positive dollars; direction 'in' for deposits/credits, 'out' for withdrawals/debits. Dates as YYYY-MM-DD. Suggest a category from the allowed list and, when a deposit looks like an investor wire, the investor's name from the provided list. Never invent transactions." },
        { role: "user", content: [{ type: "text", text: `Allowed categories: ${STATEMENT_CATEGORIES.join("; ")}\nKnown investors: ${investors.join("; ") || "none"}` }, doc] },
      ],
      tools: [{ type: "function", function: { name: "report_statement", description: "Report the statement.", parameters: { type: "object", properties: {
        bank_name: { type: ["string", "null"] }, account_mask: { type: ["string", "null"], description: "last 4 digits only" },
        period_start: { type: ["string", "null"] }, period_end: { type: ["string", "null"] },
        opening_balance: { type: ["number", "null"] }, closing_balance: { type: ["number", "null"] },
        transactions: { type: "array", items: { type: "object", properties: {
          date: { type: "string" }, description: { type: "string" }, amount: { type: "number" }, direction: { type: "string", enum: ["in", "out"] },
          category: { type: ["string", "null"], enum: [...STATEMENT_CATEGORIES, null] }, investor_name: { type: ["string", "null"] },
        }, required: ["date", "description", "amount", "direction"] } },
      }, required: ["transactions"] } } }],
      tool_choice: { type: "function", function: { name: "report_statement" } },
    }),
  });
  if (res.status === 429) throw new Error("The statement reader is busy. Please try again in a minute.");
  if (res.status === 402) throw new Error("The statement reader is out of credits. Please contact Harmonious.");
  if (!res.ok) { console.error("statement read failed", res.status, await res.text().catch(() => "")); throw new Error("Couldn't read that statement. Try a clearer PDF or a CSV export."); }
  const json: any = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const parsed = typeof args === "string" ? JSON.parse(args) : args;
  if (!parsed || !Array.isArray(parsed.transactions)) throw new Error("Couldn't find transactions in that statement.");
  return parsed as Parsed;
}

const cents = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : null);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function uploadStatement(uid: string, fundId: string, f: { fileName: string; contentType: string; base64: string }) {
  await assertFund(uid, fundId);
  const bytes = Buffer.from(f.base64, "base64");
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Statements must be 20 MB or smaller.");
  const d = await db();
  const path = `bank-statements/${fundId}/${crypto.randomUUID()}/${f.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const up = await d.storage.from(BUCKET).upload(path, bytes, { contentType: f.contentType || "application/octet-stream", upsert: false });
  if (up.error) throw new Error("Upload failed. Please try again.");
  const { data: obs } = await d.from("investor_onboardings").select("id, persons(legal_first_name, legal_last_name, preferred_name), investment_profiles(legal_name)").eq("offering_id", fundId).is("removed_at", null);
  const people = ((obs ?? []) as any[]).map((o) => {
    const p = o.persons ?? {}; const names = [o.investment_profiles?.legal_name, p.preferred_name, [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")].filter(Boolean) as string[];
    return { id: String(o.id), names };
  });
  const parsed = await readWithAi(f.fileName, f.contentType, f.base64, people.flatMap((p) => p.names));
  const { data: upload, error } = await d.from("bank_statement_uploads").insert({
    offering_id: fundId, file_name: f.fileName, storage_path: path, status: "parsed",
    bank_name: parsed.bank_name ?? null, account_mask: parsed.account_mask ? String(parsed.account_mask).replace(/\D/g, "").slice(-4) || null : null,
    period_start: isDate(parsed.period_start) ? parsed.period_start : null, period_end: isDate(parsed.period_end) ? parsed.period_end : null,
    opening_balance_cents: cents(parsed.opening_balance), closing_balance_cents: cents(parsed.closing_balance), uploaded_by: uid,
  }).select("id").single();
  if (error) throw new Error("Couldn't save the statement.");
  // Existing bank lines for duplicate detection (Plaid or earlier statements).
  const { data: existing } = await d.from("bank_transactions").select("id, posted_on, amount_cents, direction, name").eq("offering_id", fundId).limit(5000);
  const seen = new Map(((existing ?? []) as any[]).map((t) => {
    const dir = t.direction ?? (Number(t.amount_cents) < 0 ? "in" : "out");
    return [dedupeKey(String(t.posted_on), Math.abs(Number(t.amount_cents)), dir, String(t.name ?? "")), String(t.id)];
  }));
  const seenLoose = new Map(((existing ?? []) as any[]).map((t) => [`${t.posted_on}|${Math.abs(Number(t.amount_cents))}`, String(t.id)]));
  const rows = parsed.transactions.map((t, i) => {
    const amt = Math.abs(cents(t.amount) ?? 0);
    const dir = t.direction === "in" ? "in" : "out";
    if (!isDate(t.date) || amt <= 0) return null;
    const desc = String(t.description ?? "").slice(0, 500) || "Bank transaction";
    const cat = ruleCategory(desc, dir) ?? (t.category && STATEMENT_CATEGORIES.includes(t.category) ? t.category : null);
    const who = t.investor_name ? people.find((p) => p.names.some((n) => n.toLowerCase() === String(t.investor_name).toLowerCase())) : null;
    const dup = seen.get(dedupeKey(t.date, amt, dir, desc)) ?? seenLoose.get(`${t.date}|${amt}`) ?? null;
    return { upload_id: upload.id, offering_id: fundId, line_no: i + 1, posted_on: t.date, description: desc, amount_cents: amt, direction: dir,
      suggested_category: who && dir === "in" ? "Capital contribution" : cat, confirmed_category: null, matched_onboarding_id: who?.id ?? null, duplicate_of: dup, skip: !!dup };
  }).filter(Boolean);
  if (rows.length) { const ins = await d.from("bank_statement_lines").insert(rows as any[]); if (ins.error) throw new Error("Couldn't save the statement lines."); }
  return { id: String(upload.id), lines: rows.length };
}

export async function listStatements(uid: string, fundId: string) {
  await assertFund(uid, fundId);
  const d = await db();
  const { data: ups } = await d.from("bank_statement_uploads").select("*").eq("offering_id", fundId).order("created_at", { ascending: false }).limit(20);
  const ids = ((ups ?? []) as any[]).map((u) => u.id);
  const { data: lines } = ids.length ? await d.from("bank_statement_lines").select("*").in("upload_id", ids).order("line_no") : { data: [] };
  return ((ups ?? []) as any[]).map((u) => {
    const ls = ((lines ?? []) as any[]).filter((l) => l.upload_id === u.id);
    return { ...u, lines: ls, tie: balanceTie(u.opening_balance_cents == null ? null : Number(u.opening_balance_cents), u.closing_balance_cents == null ? null : Number(u.closing_balance_cents), ls.map((l) => ({ amount_cents: Number(l.amount_cents), direction: l.direction }))) };
  });
}

export async function updateLine(uid: string, fundId: string, i: { lineId: string; category: string | null; onboardingId: string | null; skip: boolean }) {
  await assertFund(uid, fundId);
  const d = await db();
  if (i.category && !STATEMENT_CATEGORIES.includes(i.category)) throw new Error("Pick a category from the list.");
  if (i.onboardingId) { const { data } = await d.from("investor_onboardings").select("id").eq("id", i.onboardingId).eq("offering_id", fundId).maybeSingle(); if (!data) throw new Error("That investor is not in this fund."); }
  const { data: l } = await d.from("bank_statement_lines").select("id, applied_tx_id").eq("id", i.lineId).eq("offering_id", fundId).maybeSingle();
  if (!l) throw new Error("Line not found.");
  if ((l as any).applied_tx_id) throw new Error("This line is already applied.");
  await d.from("bank_statement_lines").update({ confirmed_category: i.category, matched_onboarding_id: i.onboardingId, skip: i.skip }).eq("id", i.lineId);
  return { ok: true };
}

/** Apply confirmed lines: bank transaction + investor tag + books entry. Requires the balance tie and a category on every line not skipped. */
export async function applyStatement(uid: string, fundId: string, uploadId: string) {
  await assertFund(uid, fundId);
  const d = await db();
  const { data: u } = await d.from("bank_statement_uploads").select("*").eq("id", uploadId).eq("offering_id", fundId).maybeSingle();
  if (!u) throw new Error("Statement not found.");
  if ((u as any).status === "applied") throw new Error("This statement is already applied.");
  const { data: ls } = await d.from("bank_statement_lines").select("*").eq("upload_id", uploadId).order("line_no");
  const lines = (ls ?? []) as any[];
  const tie = balanceTie((u as any).opening_balance_cents == null ? null : Number((u as any).opening_balance_cents), (u as any).closing_balance_cents == null ? null : Number((u as any).closing_balance_cents), lines.map((l) => ({ amount_cents: Number(l.amount_cents), direction: l.direction })));
  if (!tie.ties) throw new Error(`The statement doesn't balance: it's off by $${(Math.abs(tie.gapCents) / 100).toFixed(2)}. Check the lines before applying.`);
  const todo = lines.filter((l) => !l.skip && !l.applied_tx_id);
  const missing = todo.filter((l) => !(l.confirmed_category ?? l.suggested_category));
  if (missing.length) throw new Error(`${missing.length} line(s) still need a category.`);
  let applied = 0;
  for (const l of todo) {
    const category = l.confirmed_category ?? l.suggested_category;
    const { data: tx, error } = await d.from("bank_transactions").insert({
      offering_id: fundId, plaid_transaction_id: `stmt:${l.id}`, posted_on: l.posted_on, amount_cents: l.direction === "in" ? -Number(l.amount_cents) : Number(l.amount_cents),
      name: l.description, description: `From statement ${(u as any).file_name}`, direction: l.direction, currency: "USD",
      dedupe_key: dedupeKey(l.posted_on, Number(l.amount_cents), l.direction, l.description), reference: `statement:${uploadId}`,
    }).select("id").single();
    if (error) throw new Error("Couldn't record a bank line.");
    if (l.matched_onboarding_id) await d.from("fund_transaction_tags").upsert({ bank_transaction_id: tx.id, offering_id: fundId, onboarding_id: l.matched_onboarding_id, asset_label: null, tagged_by: uid, updated_at: new Date().toISOString() });
    if (category !== "Transfer (not income)") {
      const e = await d.from("fund_ledger_entries").insert({ offering_id: fundId, entry_date: l.posted_on, description: l.description, category, direction: l.direction, amount_cents: Number(l.amount_cents), bank_transaction_id: tx.id, created_by: uid });
      if (e.error) throw new Error("Couldn't record a books entry.");
    }
    await d.from("bank_statement_lines").update({ applied_tx_id: tx.id, confirmed_category: category }).eq("id", l.id);
    applied++;
  }
  await d.from("bank_statement_uploads").update({ status: "applied", applied_by: uid, applied_at: new Date().toISOString() }).eq("id", uploadId);
  return { applied };
}

// ---------------------------------------------------------------- assets and marks

const ASSET_CLASSES = ["private_common", "private_preferred", "safe", "convertible_note", "debt", "fund_interest", "spv_interest", "real_estate", "digital_security", "cash_equivalent", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

async function bookFor(uid: string, fundId: string) {
  const d = await db();
  const { data: b } = await d.from("ledger_books").select("id").eq("offering_id", fundId).eq("domain", "fund_accounting").maybeSingle();
  if (b) return String((b as any).id);
  const { data: off } = await d.from("offerings").select("name, client_id").eq("id", fundId).maybeSingle();
  const { data: nb, error } = await d.from("ledger_books").insert({ name: `${(off as any)?.name ?? "Fund"} - fund accounting`, offering_id: fundId, client_id: (off as any)?.client_id ?? null, domain: "fund_accounting", created_by: uid }).select("id").single();
  if (error) throw new Error("Couldn't open the fund's books.");
  const { seedChartOfAccounts } = await import("@/lib/accounting.server");
  await seedChartOfAccounts(String(nb.id));
  return String(nb.id);
}

export async function addAsset(uid: string, fundId: string, a: { issuerName: string; assetName: string; assetClass: AssetClass; instrument: string | null; acquisitionDate: string | null; costCents: number; statementLineId?: string | null }) {
  await assertFund(uid, fundId);
  const d = await db();
  const book = await bookFor(uid, fundId);
  const { data, error } = await d.from("portfolio_assets").insert({
    book_id: book, offering_id: fundId, issuer_name: a.issuerName, asset_name: a.assetName, asset_class: a.assetClass, instrument: a.instrument,
    acquisition_date: a.acquisitionDate, cost_basis_cents: a.costCents, created_by: uid,
    original_transaction_table: a.statementLineId ? "bank_statement_lines" : null, original_transaction_id: a.statementLineId ?? null,
  }).select("id").single();
  if (error) throw new Error("Couldn't add the asset.");
  return { id: String(data.id) };
}

/** Staff marks are effective at once; a manager's mark waits for a Harmonious person (not the preparer) to approve. */
export async function recordMark(uid: string, fundId: string, m: { assetId: string; valueCents: number; date: string; method: string; note: string | null }) {
  const a = await assertFund(uid, fundId);
  const d = await db();
  const { data: asset } = await d.from("portfolio_assets").select("id, book_id, cost_basis_cents, quantity").eq("id", m.assetId).eq("offering_id", fundId).maybeSingle();
  if (!asset) throw new Error("That asset isn't in this fund.");
  const { data: cur } = await d.from("portfolio_valuations").select("id, value_cents, version").eq("asset_id", m.assetId).order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: eff } = await d.from("portfolio_valuations").select("id, value_cents").eq("asset_id", m.assetId).eq("status", "effective").order("effective_date", { ascending: false }).limit(1).maybeSingle();
  const prior = eff ? Number((eff as any).value_cents) : null;
  const now = new Date().toISOString();
  const status = a.staff ? "effective" : "review";
  const { data: v, error } = await d.from("portfolio_valuations").insert({
    asset_id: m.assetId, book_id: (asset as any).book_id, offering_id: fundId, version: Number((cur as any)?.version ?? 0) + 1, status,
    valuation_date: m.date, effective_date: m.date, value_cents: m.valueCents, quantity: (asset as any).quantity, cost_basis_cents: (asset as any).cost_basis_cents,
    methodology: m.method, source_type: a.staff ? "internal_model" : "manager_mark", prior_valuation_id: (eff as any)?.id ?? null,
    change_cents: prior == null ? 0 : m.valueCents - prior, change_pct: prior ? Math.round(((m.valueCents - prior) / prior) * 10000) / 100 : null,
    prepared_by: uid, prepared_by_role: a.staff ? "harmonious" : "fund_manager", note: m.note,
    ...(a.staff ? { approved_by: uid, approved_at: now, effective_at: now } : {}),
  }).select("id").single();
  if (error) throw new Error("Couldn't save the value.");
  if (a.staff && eff) await d.from("portfolio_valuations").update({ status: "superseded", superseded_by_id: v.id }).eq("id", (eff as any).id);
  return { ok: true, status };
}

export async function decideMark(uid: string, fundId: string, valuationId: string, approve: boolean, note: string | null) {
  if (!(await isStaff(uid))) throw new Error("Only Harmonious can approve values.");
  const d = await db();
  const { data: v } = await d.from("portfolio_valuations").select("id, asset_id, status, prepared_by").eq("id", valuationId).eq("offering_id", fundId).maybeSingle();
  if (!v || (v as any).status !== "review") throw new Error("This value isn't waiting for approval.");
  if ((v as any).prepared_by === uid) throw new Error("A different person must approve a value you entered.");
  const now = new Date().toISOString();
  if (!approve) { await d.from("portfolio_valuations").update({ status: "returned", reviewed_by: uid, reviewed_at: now, decision_reason: note }).eq("id", valuationId); return { ok: true }; }
  const { data: eff } = await d.from("portfolio_valuations").select("id").eq("asset_id", (v as any).asset_id).eq("status", "effective");
  for (const e of (eff ?? []) as any[]) await d.from("portfolio_valuations").update({ status: "superseded", superseded_by_id: valuationId }).eq("id", e.id);
  await d.from("portfolio_valuations").update({ status: "effective", reviewed_by: uid, reviewed_at: now, approved_by: uid, approved_at: now, effective_at: now, decision_reason: note }).eq("id", valuationId);
  return { ok: true };
}

/** Assets with latest effective value (or a pending manager mark, flagged). */
export async function assetsWithMarks(fundId: string) {
  const d = await db();
  const [{ data: assets }, { data: vals }, { data: legacy }] = await Promise.all([
    d.from("portfolio_assets").select("id, issuer_name, asset_name, asset_class, instrument, acquisition_date, cost_basis_cents, status").eq("offering_id", fundId).order("acquisition_date", { ascending: false }),
    d.from("portfolio_valuations").select("id, asset_id, value_cents, valuation_date, status, prepared_by_role, version").eq("offering_id", fundId).in("status", ["effective", "review"]).order("version", { ascending: false }),
    d.from("asset_valuations").select("asset_name, value_cents, valuation_date").eq("offering_id", fundId).eq("status", "approved").order("valuation_date", { ascending: false }),
  ]);
  const eff = new Map<string, any>(); const pend = new Map<string, any>();
  for (const v of (vals ?? []) as any[]) { const m = v.status === "effective" ? eff : pend; if (!m.has(v.asset_id)) m.set(v.asset_id, v); }
  const old = new Map<string, any>(); for (const v of (legacy ?? []) as any[]) if (!old.has(v.asset_name)) old.set(v.asset_name, v);
  return ((assets ?? []) as any[]).map((a) => {
    const e = eff.get(a.id) ?? null; const p = pend.get(a.id) ?? null; const l = old.get(a.asset_name) ?? null;
    return { ...a, latestValueCents: e ? Number(e.value_cents) : l ? Number(l.value_cents) : null, latestValueDate: e?.valuation_date ?? l?.valuation_date ?? null,
      pendingMark: p ? { id: String(p.id), valueCents: Number(p.value_cents), date: String(p.valuation_date) } : null };
  });
}

// ---------------------------------------------------------------- books-derived figures

export async function booksFigures(uid: string, fundId: string, i: { start: string; end: string; taxYear: number }) {
  await assertFund(uid, fundId);
  const { deriveK1Totals, investorBasis, investorDistributions, cashThrough, buildStatements } = await import("@/lib/fund-books-model");
  const entries = await bookEntries(fundId);
  const assets = await assetsWithMarks(fundId);
  const marked = assets.filter((a) => a.status !== "realized").map((a) => ({ costCents: Number(a.cost_basis_cents ?? 0), valueCents: Number(a.latestValueCents ?? a.cost_basis_cents ?? 0) }));
  const period = entries.filter((e) => e.entry_date >= i.start && e.entry_date <= i.end);
  const sumCat = (cats: string[], dir: "in" | "out") => period.filter((e) => cats.includes(e.category)).reduce((t, e) => t + (e.direction === dir ? e.amount_cents : -e.amount_cents), 0);
  const nav = {
    cash: cashThrough(entries, i.end),
    investments_fv: marked.reduce((t, a) => t + a.valueCents, 0),
    investments_cost: marked.reduce((t, a) => t + a.costCents, 0),
    contributions: sumCat(["Capital contribution"], "in"),
    distributions: sumCat(["Distribution"], "out"),
    income: sumCat(["Interest income", "Other income", "Dividend income", "Short-term gain", "Long-term gain", "Section 1231 gain"], "in"),
    management_fee: sumCat(["Management fee"], "out"),
    fund_expenses: sumCat(["Legal fees", "Accounting & tax", "Bank fees", "Formation & filing", "Broker/Dealer fee", "Other expense"], "out"),
  };
  return {
    entryCount: entries.length,
    nav,
    k1: deriveK1Totals(entries, i.taxYear),
    basis: Object.fromEntries(investorBasis(entries, i.taxYear)),
    distributionsByInvestor: Object.fromEntries(investorDistributions(entries, i.taxYear)),
    statements: buildStatements(entries, i.start, i.end, marked),
  };
}

/** Per-investor K-1 readiness: tax form, address, sign-in. Last-four only. */
export async function k1Readiness(uid: string, fundId: string) {
  await assertFund(uid, fundId);
  const d = await db();
  const { data: obs } = await d.from("investor_onboardings").select("id, investor_user_id, investment_profile_id, persons(legal_first_name, legal_last_name, preferred_name)").eq("offering_id", fundId).is("removed_at", null);
  const rows = (obs ?? []) as any[];
  const pids = rows.map((o) => o.investment_profile_id).filter(Boolean);
  const [{ data: profs }, { data: forms }] = await Promise.all([
    pids.length ? d.from("investment_profiles").select("*").in("id", pids) : Promise.resolve({ data: [] }),
    pids.length ? d.from("tax_document_records").select("investment_profile_id, form_type").in("investment_profile_id", pids) : Promise.resolve({ data: [] }),
  ]);
  const pm = new Map(((profs ?? []) as any[]).map((p) => [String(p.id), p]));
  const fm = new Set(((forms ?? []) as any[]).map((f) => String(f.investment_profile_id)));
  return rows.map((o) => {
    const p: any = o.investment_profile_id ? pm.get(String(o.investment_profile_id)) : null;
    const per = o.persons ?? {};
    const addr = p ? [p.address_line1 ?? p.street ?? p.address, p.city, p.state ?? p.region, p.postal_code].filter(Boolean).join(", ") : "";
    const last4 = p?.tax_id_last4 ?? p?.tin_last4 ?? null;
    const missing: string[] = [];
    if (!o.investor_user_id) missing.push("Not signed in yet");
    if (!p) missing.push("No investing entity");
    if (p && !addr) missing.push("No address");
    if (p && !last4) missing.push("No tax ID");
    if (p && !fm.has(String(p.id))) missing.push("No W-9/W-8 on file");
    return { onboardingId: String(o.id), name: per.preferred_name || [per.legal_first_name, per.legal_last_name].filter(Boolean).join(" ") || "Investor",
      entity: p?.legal_name ?? null, address: addr || null, taxIdLast4: last4, missing };
  });
}
