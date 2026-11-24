/**
 * Fund Setup AI reader (server). Reads one fund document in memory with AI, returns
 * normalized suggestions, and applies a person's explicit decision through the existing
 * setup savers only. Staff or that fund's own setup editors; every decision is logged.
 */
import { generateResponse, GatewayError, PaymentRequiredError, RateLimitError } from "@lovable.dev/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DOC_READ_MAX_BYTES, DOC_READ_TYPES } from "@/lib/investor-doc-extract-model";
import { FUND_EXTRACT_INSTRUCTIONS, FUND_EXTRACT_SCHEMA, fundField, normalizeFieldValue, normalizeFundReading, type FundDocReading, type FundFieldKey } from "@/lib/fund-doc-extract-model";

const MODEL = "openai/gpt-6.1-sol";
const db = () => supabaseAdmin as any;

async function assertFundAccess(userId: string, offeringId: string) {
  const { setupActor } = await import("@/lib/fund-setup.server");
  const actor = await setupActor(userId);
  const { fundAccessAllows, fundAccessDb } = await import("@/lib/fund-access.server");
  if (!(await fundAccessAllows(await fundAccessDb(), userId, offeringId, "manager"))) await (await import("./fund-routine-access.server")).assertRoutineFund(db(), userId, offeringId);
  return actor;
}

export async function readFundSetupDocument(userId: string, input: { offeringId: string; fileName: string; contentType: string; base64: string }): Promise<FundDocReading> {
  await assertFundAccess(userId, input.offeringId);
  return readFundDocumentInMemory(input);
}

/** Reads one fund document in memory; callers authorize first. Nothing is stored. */
export async function readFundDocumentInMemory(input: { fileName: string; contentType: string; base64: string }): Promise<FundDocReading> {
  const type = (DOC_READ_TYPES as readonly string[]).includes(input.contentType) ? input.contentType : null;
  if (!type) throw new Error("Upload a PDF or a photo (PNG, JPG or WEBP).");
  if (Math.floor((input.base64.length * 3) / 4) > DOC_READ_MAX_BYTES) throw new Error("That file is over 10 MB. Upload a smaller copy.");
  const file = type === "application/pdf"
    ? { type: "input_file" as const, filename: "document.pdf", file_data: `data:application/pdf;base64,${input.base64}` }
    : { type: "input_image" as const, image_url: `data:${type};base64,${input.base64}`, detail: "high" as const };
  try {
    const res = await generateResponse({
      model: MODEL,
      reasoning: { effort: "low" },
      instructions: FUND_EXTRACT_INSTRUCTIONS,
      input: [{ role: "user", content: [file, { type: "input_text", text: `File name: ${input.fileName.slice(0, 120)}. Return the fund setup details as JSON.` }] }],
      text: { format: { type: "json_schema", name: "fund_setup_details", strict: true, schema: FUND_EXTRACT_SCHEMA as unknown as Record<string, unknown> } },
    });
    if (res?.status === "failed" || res?.status === "incomplete") throw new Error("The document couldn't be read. Try a clearer copy.");
    let text = "";
    for (const item of res?.output ?? []) {
      if (item?.type !== "message") continue;
      for (const c of item.content ?? []) {
        if (c?.type === "refusal") throw new Error("This document couldn't be read automatically. Enter the details by hand.");
        if (c?.type === "output_text") text += c.text ?? "";
      }
    }
    if (!text.trim()) throw new Error("The document couldn't be read. Try a clearer copy.");
    return normalizeFundReading(JSON.parse(text));
  } catch (e) {
    if (e instanceof PaymentRequiredError) throw new Error("Document reading is paused because AI credits have run out.");
    if (e instanceof RateLimitError) throw new Error("Document reading is busy. Wait a minute and try this file again.");
    if (e instanceof GatewayError) {
      console.error("[fund-doc-extract]", e.code, e.httpStatus, e.ids);
      throw new Error(`The document couldn't be read right now [${e.httpStatus ?? e.code}].`);
    }
    if (e instanceof SyntaxError) throw new Error("The document couldn't be read. Try a clearer copy.");
    throw e;
  }
}

const OFFERING_COL: Partial<Record<FundFieldKey, string>> = {
  legalName: "legal_entity_name", gpName: "gp_entity_name", signatoryTitle: "signatory_title", entityType: "entity_type", jurisdiction: "state_formed",
  formationDate: "date_formed", registeredAgent: "registered_agent", principalAddress: "principal_address", arbitrationCity: "arbitration_city",
  arbitrationState: "arbitration_state", targetRaiseCents: "target_raise_cents", maxOfferingCents: "max_offering_cents", minInvestmentCents: "min_investment_cents",
};
const SETUP_COL: Partial<Record<FundFieldKey, string>> = { fiscalYearEnd: "fiscal_year_end", fundTermMonths: "fund_term_months", investmentPeriodMonths: "investment_period_months" };

async function currentEconomics(setupId: string | null) {
  if (!setupId) return { terms: null as any, classes: [] as any[] };
  const { data } = await db().from("fund_economics_versions").select("status, terms, classes, version").eq("setup_id", setupId).order("version", { ascending: false });
  const rows = (data ?? []) as any[];
  const cur = rows.find((v) => v.status === "draft") ?? rows.find((v) => v.status === "approved") ?? null;
  return { terms: cur?.terms ?? null, classes: (cur?.classes ?? []) as any[] };
}

/** Current stored values in the same normalized form the reader produces. */
export async function fundSetupAiCurrentValues(userId: string, offeringId: string) {
  await assertFundAccess(userId, offeringId);
  const [{ data: o }, { data: s }] = await Promise.all([
    db().from("offerings").select("*").eq("id", offeringId).maybeSingle(),
    db().from("fund_setups").select("id, fiscal_year_end, fund_term_months, investment_period_months").eq("offering_id", offeringId).maybeSingle(),
  ]);
  if (!o) throw new Error("Fund not found.");
  const { terms } = await currentEconomics(s?.id ?? null);
  const out: Partial<Record<FundFieldKey, string | null>> = {};
  const str = (v: unknown) => (v == null || v === "" ? null : String(v));
  for (const [k, col] of Object.entries(OFFERING_COL)) out[k as FundFieldKey] = str(o[col!]);
  for (const [k, col] of Object.entries(SETUP_COL)) out[k as FundFieldKey] = str(s?.[col!]);
  out.managementFeePercent = str(terms?.managementFee?.ratePercent);
  out.carryPercent = str(terms?.carry?.ratePercent);
  out.preferredReturnPercent = str(terms?.preferredReturnPercent);
  out.distributionFrequency = str(terms?.distributionFrequency);
  out.orgExpenseTreatment = str(terms?.orgExpenseTreatment);
  return { values: out, hasMultipleClasses: !!o.has_multiple_classes };
}

async function logDecision(userId: string, offeringId: string, detail: Record<string, unknown>) {
  const { data: s } = await db().from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle();
  if (!s?.id) return;
  await db().from("fund_setup_events").insert({ setup_id: s.id, subject_table: "offerings", subject_id: offeringId, event: "ai_document_suggestion_decided", actor_user_id: userId, detail });
}

/**
 * Applies (approve/update) or records (deny) one AI suggestion. Refuses when the stored value
 * changed since the reader compared it. Saves only through the existing canonical savers, so
 * their own authorization, routine-access and approval rules still apply; fees stay a draft.
 */
export async function applyFundSetupSuggestion(userId: string, input: {
  offeringId: string; field: string; action: "approve" | "update" | "deny"; value: string | null; expectedCurrent: string | null; sources: Array<{ fileName: string; page: number | null }>;
}) {
  const f = fundField(input.field);
  if (!f) throw new Error("Unknown setup detail.");
  if (f.target === "reference" && input.action !== "deny") throw new Error(`${f.label} is shown for reference. Enter it on its own setup step.`);
  const sources = input.sources.slice(0, 10).map((s) => ({ fileName: String(s.fileName).slice(0, 200), page: s.page ?? null }));
  if (input.action === "deny") {
    await assertFundAccess(userId, input.offeringId);
    await logDecision(userId, input.offeringId, { field: f.key, action: "deny", sources });
    return { ok: true };
  }
  const value = normalizeFieldValue(f.kind, input.value);
  if (value == null) throw new Error(`Enter a valid ${f.label.toLowerCase()}.`);
  const { values } = await fundSetupAiCurrentValues(userId, input.offeringId);
  const now = values[f.key as FundFieldKey] ?? null;
  if ((now ?? null) !== (input.expectedCurrent ?? null)) throw new Error(`${f.label} was changed by someone else. Read the documents again to compare.`);

  const engine = await import("@/lib/fund-setup-canonical.server");
  if (f.target === "legal_name") {
    await engine.changeLegalName(userId, { offeringId: input.offeringId, legalName: value, reason: `From fund documents: ${sources.map((s) => s.fileName).join(", ")}`.slice(0, 500) });
  } else if (f.target === "offering") {
    const map: Record<string, string> = { gpName: "gpName", signatoryTitle: "signatoryTitle", entityType: "entityType", jurisdiction: "jurisdiction", formationDate: "formationDate", registeredAgent: "registeredAgent", principalAddress: "principalAddress", arbitrationCity: "arbitrationCity", arbitrationState: "arbitrationState", targetRaiseCents: "targetRaiseCents", maxOfferingCents: "maxOfferingCents", minInvestmentCents: "minInvestmentCents" };
    const v = f.kind === "cents" ? Number(value) : value;
    await engine.saveFundSetupFields(userId, { offeringId: input.offeringId, fields: { [map[f.key] as string]: v } });
  } else if (f.target === "setup") {
    const v = f.kind === "months" ? Number(value) : value;
    await engine.saveFundSetupFields(userId, { offeringId: input.offeringId, fields: {}, setupFields: { [f.key]: v } as any });
  } else if (f.target === "economics") {
    const { data: s } = await db().from("fund_setups").select("id").eq("offering_id", input.offeringId).maybeSingle();
    const { terms, classes } = await currentEconomics(s?.id ?? null);
    const t: any = { managementFee: null, carry: null, ...(terms ?? {}) };
    const na = (k: string) => (t.notApplicable ?? []).filter((x: string) => x !== k);
    if (f.key === "managementFeePercent") { t.managementFee = { basis: null, frequency: null, ...(t.managementFee ?? {}), ratePercent: Number(value) }; t.notApplicable = na("managementFee"); }
    if (f.key === "carryPercent") { t.carry = { ...(t.carry ?? {}), ratePercent: Number(value) }; t.notApplicable = na("carry"); }
    if (f.key === "preferredReturnPercent") { t.preferredReturnPercent = Number(value); t.notApplicable = na("preferredReturn"); }
    if (f.key === "distributionFrequency") { t.distributionFrequency = value.slice(0, 100); t.notApplicable = na("distributionFrequency"); }
    if (f.key === "orgExpenseTreatment") { t.orgExpenseTreatment = value.slice(0, 500); t.notApplicable = na("orgExpense"); }
    await engine.saveFundEconomics(userId, { offeringId: input.offeringId, terms: t, classes, changeReason: `${f.label} from fund documents (AI reading, confirmed by a person)` });
  }
  await logDecision(userId, input.offeringId, { field: f.key, action: input.action, previous: now, value, sources });
  try { await (await import("@/lib/fund-setup-extras.server")).autoCompleteAfterSave({ offeringId: input.offeringId }); } catch { /* best effort */ }
  return { ok: true, value };
}
