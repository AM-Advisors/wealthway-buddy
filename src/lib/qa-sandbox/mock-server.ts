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
/** Minimal seroval cross-JSON decoder for plain data (objects, arrays, strings, numbers, booleans, null). */
function decodeCrossJson(node: any): any {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(decodeCrossJson);
  if (typeof node.t !== "number") return node;
  // Constants: seroval encodes null/undefined/etc. as small tagged nodes without payload.
  if (node.t === 0) return null;
  if (node.t === 1) return node.s; // string
  if (node.t === 2) return node.s; // number
  if (node.t === 3) return !!node.s; // boolean
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

export type QaRole = "staff" | "manager";

export type QaState = {
  role: QaRole;
  wire: Record<string, string>;
  createdInvestors: { onboardingId: string; name: string; email: string; amountCents: number }[];
  people: QaPerson[];
  uploads: string[];
  /** Matches from the most recent search, so create can enforce the email blocker. */
  lastMatches: ReturnType<typeof rankMatches> | null;
};

export function createQaState(role: QaRole = "staff"): QaState {
  return { role, wire: {}, createdInvestors: [], people: [...QA_PEOPLE], uploads: [], lastMatches: null };
}

const SERVER_FN_HEADER = "x-tsr-serverfn";

const KNOWN_FNS = [
  "searchInvestorsFn",
  "createInvestorFn",
  "listManagedWireInstructions",
  "saveManagedWireInstructions",
  "prefillWireFromBank",
  "uploadFundFileFn",
] as const;

/** Map a server-function URL to the export name it was built from. Ids are base64 JSON: { file, export }. */
function resolveFnName(url: string): string | null {
  const match = (text: string) => KNOWN_FNS.find((name) => text.includes(name)) ?? null;
  const direct = match(url);
  if (direct) return direct;
  try {
    const segment = url.split("/").pop() ?? "";
    const decoded = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
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
  switch (fnName) {
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
        console.debug("[qa-sandbox]", fnName, JSON.stringify(data)?.slice(0, 400));
      }
    } catch {
      return fail("Could not read the request.");
    }
    try {
      return json(handleQaServerCall(fnName, data, state));
    } catch (e) {
      return fail((e as Error).message, e instanceof QaBlockedError ? 403 : 400);
    }
  };
  return () => {
    window.fetch = original;
  };
}
