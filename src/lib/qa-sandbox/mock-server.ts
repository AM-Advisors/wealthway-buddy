/**
 * Client-side mock for the fictional QA sandbox (/qa-sandbox).
 *
 * The sandbox renders real product components (investor form, wire sender)
 * but must never touch the real backend. installQaFetchMock() wraps
 * window.fetch so every server-function call is answered from fictional
 * in-memory state, and any server function the sandbox does not explicitly
 * model is blocked with an error instead of reaching the network.
 *
 * Isolation rules:
 * - Only requests carrying the TanStack server-function header are handled.
 * - Unknown server functions are rejected, never forwarded.
 * - State lives in memory for the page session only; nothing is persisted.
 */
import {
  QA_BANK_PREFILL,
  QA_FUND_ID,
  QA_FUND_NAME,
  QA_PEOPLE,
  QA_WIRE_REQUIRED_FIELDS,
  type QaPerson,
} from "./fictional-data";
/** Seroval escapes control and HTML-sensitive characters inside strings (\\n, \\x3C, \\u2028…). */
function unescapeSeroval(text: string): string {
  return text.replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|(.))/g, (_m, hex: string | undefined, uni: string | undefined, ch: string | undefined) => {
    if (hex) return String.fromCharCode(parseInt(hex, 16));
    if (uni) return String.fromCharCode(parseInt(uni, 16));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" } as Record<string, string>)[ch ?? ""] ?? ch ?? "";
  });
}
/** Minimal seroval cross-JSON decoder for plain data (objects, arrays, strings, numbers, booleans, null). */
function decodeCrossJson(node: any): any {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(decodeCrossJson);
  if (typeof node.t !== "number") return node;
  if (node.t === 9 && Array.isArray(node.a)) return node.a.map(decodeCrossJson); // array
  if (node.t === 0) return node.s; // number
  if (node.t === 1) return unescapeSeroval(String(node.s)); // string
  if (node.t === 2) return [null, undefined, true, false, -0, Infinity, -Infinity, NaN][node.s as number]; // constant
  if (node.p && Array.isArray(node.p.k) && Array.isArray(node.p.v)) {
    const out: Record<string, unknown> = {};
    node.p.k.forEach((key: string, i: number) => {
      out[key] = decodeCrossJson(node.p.v[i]);
    });
    return out;
  }
  if (node.p && Array.isArray(node.p.v)) return node.p.v.map(decodeCrossJson);
  return null;
}
import { rankMatches, validateQuickAdd, createNewBlocker } from "@/lib/investor-record-model";
import { previewInvoiceFee } from "@/lib/invoice-fee-preview";
import { fictionalFeeFacts, QA_FEE_ID } from "./fee-fixture";
import { generatedDocumentReviewError } from "@/lib/fund-document-generation-policy";
import { IRS_FORM_REVISIONS } from "@/lib/onboarding-compliance-model";
import { taxReviewDetails } from "@/lib/investor-step-prefill";
import { amlFields, evaluateAml } from "@/lib/onboarding-intake-model";
import { createQaPortfolio, handleQaPortfolioCall, QA_PORTFOLIO_FNS, type QaPortfolio } from "./portfolio-fixture";
import { createQaJourney, handleQaJourneyCall, QA_JOURNEY_FNS, type QaJourney } from "./investor-journey-fixture";
import { createQaFoundation, handleQaFoundationCall, QA_FOUNDATION_FNS, type QaFoundation } from "./foundation-fixture";

export type QaRole = "staff" | "manager";

export type QaState = {
  role: QaRole;
  wire: Record<string, string>;
  createdInvestors: { onboardingId: string; name: string; email: string; amountCents: number }[];
  people: QaPerson[];
  uploads: string[];
  /** Matches from the most recent search, so create can enforce the email blocker. */
  lastMatches: ReturnType<typeof rankMatches> | null;
  documentDraft: { created_by: string; version: number; self_serve_review_state: string; generation_issues: string[]; active: boolean } | null;
  investorCopies?: { id: string; fileName: string; kind: string; status: string; note: string | null; canReview: boolean }[];
  routineMinimum?: number;
  taxSigned?: boolean;
  financialAnswers?: Record<string, string>;
  financialReview?: string;
  portfolio?: QaPortfolio;
  journey?: QaJourney;
  foundation?: QaFoundation;
};

export function createQaState(role: QaRole = "staff"): QaState {
  return { role, wire: {}, createdInvestors: [], people: [...QA_PEOPLE], uploads: [], lastMatches: null, documentDraft: null };
}

const SERVER_FN_HEADER = "x-tsr-serverfn";

const KNOWN_FNS = [
  "searchInvestorsFn",
  "createInvestorFn",
  "listManagedWireInstructions",
  "saveManagedWireInstructions",
  "prefillWireFromBank",
  "uploadFundFileFn",
  "previewInvoiceFeeEntry",
  "fundDocumentGenerationAccessFn", "fundTypeTemplatesFn", "generateFundTypeDocumentsFn", "listFundTemplateDocumentsFn", "templateDocSendStatusFn", "reviewGeneratedDocumentFn", "activateDocumentVersionFn",
  "getFundLinkFn",
  "uploadOnboardingDocForFn", "managerUploadReviewsFn", "managerReviewUploadFn", "managerUploadUrlFn",
  "getFundSetupOverview", "saveFundSetupFieldsFn",
  "investorComplianceFn", "previewTaxFormFn", "certifyTaxFormFn", "myTaxDocumentUrlFn", "submitAmlFn",
  ...QA_PORTFOLIO_FNS,
  ...QA_JOURNEY_FNS,
  ...QA_FOUNDATION_FNS,
] as const;

/** Map a server-function URL to the export name it was built from. Ids are base64 JSON: { file, export }. */
function resolveFnName(url: string): string | null {
  const match = (text: string) => KNOWN_FNS.find((name) => text.includes(name)) ?? null;
  const direct = match(url);
  if (direct) return direct;
  try {
    const segment = (url.split("?")[0] ?? "").split("/").pop() ?? "";
    const decoded = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    // Ids are either JSON { file, export } or "file#export".
    if (decoded.includes("#")) return KNOWN_FNS.find((name) => decoded.split("#").pop() === name || decoded.endsWith(`#${name}`)) ?? match(decoded.split("#").pop() ?? "");
    const parsed = JSON.parse(decoded);
    if (typeof parsed?.export === "string") return match(parsed.export);
  } catch {
    /* not a decodable function id */
  }
  return null;
}

export class QaBlockedError extends Error {}

/** Pure handler for one mocked server-function call. Throws Error with a user-facing message on failure. */
export function handleQaServerCall(fnName: string, data: any, state: QaState): unknown {
  if ((QA_PORTFOLIO_FNS as readonly string[]).includes(fnName)) return handleQaPortfolioCall(fnName, data, (state.portfolio ??= createQaPortfolio()));
  if ((QA_JOURNEY_FNS as readonly string[]).includes(fnName)) return handleQaJourneyCall(fnName, data, (state.journey ??= createQaJourney()));
  if ((QA_FOUNDATION_FNS as readonly string[]).includes(fnName)) return handleQaFoundationCall(fnName, data, (state.foundation ??= createQaFoundation()));
  switch (fnName) {
    case "investorComplianceFn": {
      if (data?.onboardingId === "qa-financial-investment") return {
        aml: { state: state.financialReview === "review_required" ? "review_required" : state.financialReview ? "valid" : "missing", answers: state.financialAnswers ?? { occupation: "Engineer" }, fields: amlFields({}, { profileType: "individual", commitmentCents: 25000000, known: { citizenship: "US", residence: "US" }, answers: state.financialAnswers as any }) },
      };
      if (data?.onboardingId !== "qa-tax-investment") throw new QaBlockedError("Only the fictional tax investment is available.");
      return { profileName: "John Smith", profileType: "individual", taxIntake: { answers: { usPerson: "yes" }, questions: [], state: "valid" }, tax: { state: state.taxSigned ? "valid" : "missing", form: IRS_FORM_REVISIONS.w9, needsTin: true, tinKind: "ssn", uploadedCopy: null, reviewDetails: taxReviewDetails({ address_line1: "10 Fictional St", city: "Denver" }, { profile_type: "individual", legal_name: "John Smith" }), current: state.taxSigned ? { formType: "w9", revision: IRS_FORM_REVISIONS.w9.revision, tinMasked: "•••-••-6789" } : null } };
    }
    case "submitAmlFn": {
      if (data?.onboardingId !== "qa-financial-investment" || data?.certifiedName !== "John Smith") throw new QaBlockedError("Only the fictional financial questionnaire is available.");
      const result = evaluateAml({}, { profileType: "individual", commitmentCents: 25000000, known: { citizenship: "US", residence: "US" }, answers: data.answers });
      if (!result.complete) throw new Error("Please answer every question shown.");
      state.financialAnswers = { ...data.answers };
      state.financialReview = result.reviewStatus;
      return { ok: true, reviewStatus: result.reviewStatus };
    }
    case "previewTaxFormFn": {
      if (data?.onboardingId !== "qa-tax-investment") throw new QaBlockedError("Only the fictional tax investment is available.");
      const pdf = "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
      return { pdfBase64: btoa(pdf), revision: IRS_FORM_REVISIONS.w9.revision };
    }
    case "certifyTaxFormFn": {
      if (data?.onboardingId !== "qa-tax-investment" || data?.certifiedName !== "John Smith") throw new QaBlockedError("Only the fictional signer is available.");
      state.taxSigned = true;
      return { ok: true };
    }
    case "myTaxDocumentUrlFn": return { url: "about:blank" };
    case "getFundSetupOverview": return { canEdit: false, routineOnly: true, isStaff: false, offering: { displayName: QA_FUND_NAME, minInvestmentCents: state.routineMinimum ?? 10000000 }, economics: { canEdit: true, canApprove: true, status: "draft", terms: {}, classes: [] } };
    case "saveFundSetupFieldsFn": {
      if (data.offeringId !== QA_FUND_ID || Object.keys(data.fields ?? {}).some(k => k !== "minInvestmentCents")) throw new QaBlockedError("Protected or outside-fund edit blocked.");
      state.routineMinimum = data.fields.minInvestmentCents;
      return { ok: true };
    }
    case "managerUploadReviewsFn": return state.investorCopies ?? [];
    case "uploadOnboardingDocForFn": {
      const copies = state.investorCopies ??= [];
      copies.push({ id: `fictional-copy-${copies.length}`, fileName: data.fileName, kind: data.kind, status: "new", note: null, canReview: ["entity_formation", "operating_agreement", "ownership_list", "tax_form"].includes(data.kind) });
      return { ok: true };
    }
    case "managerReviewUploadFn": {
      const row = state.investorCopies?.find(r => r.id === data.id);
      if (!row?.canReview || row.status !== "new") throw new Error("This copy cannot be reviewed.");
      row.status = data.status; row.note = data.note; row.canReview = false;
      return { ok: true };
    }
    case "managerUploadUrlFn": return { url: "about:blank" };
    case "getFundLinkFn": return { fundName: QA_FUND_NAME, url: "https://example.test/join/fictional-only", status: "active", createdAt: "2026-10-27T08:00:00Z", regeneratedAt: null, lastUsedAt: null, starts: 0, canManage: false };
    case "fundDocumentGenerationAccessFn": return { templates: true, starter: false, staff: state.role === "staff" };
    case "fundTypeTemplatesFn": return { fundType: "SPV", templates: [{ id: "qa-template", title: "Fablewood Operating Agreement", approvedVersion: 1, generated: Boolean(state.documentDraft) }] };
    case "generateFundTypeDocumentsFn": {
      state.documentDraft = { created_by: state.role, version: 1, self_serve_review_state: "pending", generation_issues: [], active: false };
      return { made: [{ title: "Fablewood Operating Agreement", documentId: "qa-document", open: [] }] };
    }
    case "templateDocSendStatusFn": return {};
    case "listFundTemplateDocumentsFn": {
      const draft = state.documentDraft;
      return draft ? [{ id: "qa-document", title: "Fablewood Operating Agreement", usedAt: "2026-10-27T08:00:00Z", version: 1, versionId: "qa-version", fileName: "fablewood.docx", isActive: draft.active, signers: [], signingStatus: "confirmed", canDelete: false, reviewState: draft.self_serve_review_state, canReview: draft.created_by !== state.role && draft.self_serve_review_state === "pending", generationIssues: [], approvedAt: draft.self_serve_review_state === "approved" ? "2026-10-27T08:05:00Z" : null }] : [];
    }
    case "reviewGeneratedDocumentFn": {
      if (!state.documentDraft) throw new QaBlockedError("Generate a fictional draft first.");
      const issue = generatedDocumentReviewError(state.documentDraft, state.role, 1);
      if (issue) throw new Error(issue);
      if (data?.decision === "return" && !data?.note?.trim()) throw new Error("Give a reason.");
      state.documentDraft.self_serve_review_state = data?.decision === "approve" ? "approved" : "returned";
      return { ok: true };
    }
    case "activateDocumentVersionFn": {
      if (state.documentDraft?.self_serve_review_state !== "approved") throw new Error("Approve this version first.");
      state.documentDraft.active = true;
      return { ok: true, resign: 0 };
    }
    case "searchInvestorsFn": {
      const matches = rankMatches(
        { email: data?.email ?? null, name: data?.name ?? null, entityName: data?.entityName ?? null },
        state.people,
      );
      state.lastMatches = matches;
      return { matches };
    }
    case "createInvestorFn": {
      if (!data?.confirmedNew && state.lastMatches) {
        const blocker = createNewBlocker(state.lastMatches, false);
        if (blocker && !data?.personId) throw new Error(blocker);
      }
      if (!data?.personId) {
        const amountCents = Number(data?.investment?.amountCents ?? 0);
        const errs = validateQuickAdd({
          firstName: data?.person?.firstName,
          lastName: data?.person?.lastName,
          email: data?.person?.email ?? data?.contact?.email ?? "",
          profileType: data?.profile?.type,
          amountCents,
        });
        if (errs.length) throw new Error(errs[0]);
      }
      const first = String(data?.person?.firstName ?? "").trim();
      const last = String(data?.person?.lastName ?? "").trim();
      const email = String(data?.person?.email ?? data?.contact?.email ?? "").trim();
      const onboardingId = `qa-onboarding-${String(state.createdInvestors.length + 1).padStart(4, "0")}`;
      state.createdInvestors.push({
        onboardingId,
        name: `${first} ${last}`.trim() || "Existing investor",
        email,
        amountCents: Number(data?.investment?.amountCents ?? 0),
      });
      if (email && !data?.personId) {
        state.people.push({
          personId: `qa-person-new-${state.people.length + 1}`,
          email,
          firstName: first || null,
          lastName: last || null,
          inFund: true,
          profiles: [{ id: `qa-profile-new-${state.people.length + 1}`, type: data?.profile?.type ?? "individual", legalName: data?.profile?.legalName ?? null }],
        });
      }
      return { onboardingId, emailSent: true };
    }
    case "listManagedWireInstructions": {
      return {
        isAdmin: state.role === "staff",
        funds: [{ id: QA_FUND_ID, name: QA_FUND_NAME, wire_instructions: { ...state.wire } }],
      };
    }
    case "prefillWireFromBank": {
      return { ...QA_BANK_PREFILL };
    }
    case "saveManagedWireInstructions": {
      if (state.role !== "staff") throw new Error("Bank details are verified and saved by Harmonious.");
      for (const key of QA_WIRE_REQUIRED_FIELDS) {
        if (!String(data?.[key] ?? "").trim()) throw new Error(`Enter the ${key.replace(/_/g, " ")}.`);
      }
      if (!/^\d{9}$/.test(String(data?.routing_number ?? ""))) throw new Error("Wire routing (ABA) must be 9 digits.");
      state.wire = Object.fromEntries(
        Object.entries(data ?? {}).filter(([k, v]) => k !== "offering_id" && typeof v === "string" && v.trim()),
      ) as Record<string, string>;
      return { ok: true };
    }
    case "uploadFundFileFn": {
      const name = String(data?.fileName ?? "wire-instructions");
      state.uploads.push(name);
      return { ok: true, fileId: `qa-file-${state.uploads.length}` };
    }
    case "previewInvoiceFeeEntry": {
      if (state.role !== "staff") throw new Error("You don't have authority for these fee records.");
      if (data?.lineId !== QA_FEE_ID) throw new QaBlockedError("Only the fictional invoice fee can be previewed here.");
      return previewInvoiceFee(fictionalFeeFacts(), { entryDate: String(data?.entryDate ?? ""), category: String(data?.category ?? "") });
    }
    default:
      throw new QaBlockedError(`Blocked in the fictional QA sandbox: ${fnName}`);
  }
}

/**
 * Wrap window.fetch so server-function calls are answered by the fictional
 * handler. Returns a restore function. Any server function not explicitly
 * modeled is rejected; ordinary asset/data requests pass through untouched.
 */
export function installQaFetchMock(state: QaState): () => void {
  if (typeof window === "undefined") return () => {};
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    const isServerFn = headers.get(SERVER_FN_HEADER) === "true" || /\/_?serverFn\//.test(url) || url.includes("serverFn");
    if (!isServerFn) return original(input as any, init);
    const fnName = resolveFnName(url);
    // The client middleware executor unwraps { result, error, context }.
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify({ result: payload, error: null, context: {} }), { status, headers: { "content-type": "application/json" } });
    const fail = (message: string, status = 400) =>
      new Response(message, { status, headers: { "content-type": "text/plain" } });
    if (!fnName) return fail(`Blocked in the fictional QA sandbox: this action is not modeled here.`, 403);
    let data: any = null;
    try {
      const body = init?.body;
      if (typeof body === "string") {
        const parsed = JSON.parse(body);
        // Server-function payloads are seroval cross-JSON; plain JSON is accepted too.
        data = (parsed && typeof parsed === "object" && "t" in parsed ? decodeCrossJson(parsed.t) : parsed)?.data ?? null;
      }
    } catch {
      return fail("Could not read the request.");
    }
    try {
      return json(handleQaServerCall(fnName, data, state));
    } catch (e) {
      return fail((e as Error).message, e instanceof QaBlockedError || (e as Error).name === "QaBlockedError" ? 403 : 400);
    }
  };
  return () => {
    window.fetch = original;
  };
}
