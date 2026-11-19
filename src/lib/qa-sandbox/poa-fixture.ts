/**
 * Fictional power of attorney state for /qa-sandbox.
 *
 * Answers the real PowerOfAttorneyCard with invented people and invented
 * documents, and mirrors the live rules in power-of-attorney.server.ts: a
 * reviewer who is not the uploader, a reason before revoking, an exact email
 * match before anything is linked, and nothing open until the named person
 * accepts. The listed powers are turned into permissions with the same pure
 * module production uses, so the sandbox shows what production would show.
 */
import { poaInputBlocker, type PoaStatus } from "@/lib/power-of-attorney-model";
import { poaAuthorityView, poaCapabilities, poaCoveredTypesBlocker, poaPlainPowers } from "@/lib/poa-authority";

export const QA_POA_FNS = [
  "listPowersOfAttorneyFn", "reviewPowerOfAttorneyFn", "revokePowerOfAttorneyFn", "powerOfAttorneyFileFn",
  "linkPowerOfAttorneyAgentFn", "startPoaUploadFn", "submitPowerOfAttorneyFn",
] as const;

/** The fictional investing profile these documents attach to. */
export const QA_POA_PROFILE = "qa000000-0000-4000-8000-0000000000a1";
/** The fictional investor who owns that profile. */
const PRINCIPAL = "qa000000-0000-4000-8000-0000000000a2";
/** The sandbox staff reviewer. */
const STAFF = "qa000000-0000-4000-8000-0000000000a3";
/** The fictional fund manager who uploaded two of the documents. */
const MANAGER = "qa000000-0000-4000-8000-0000000000a4";

/** Fictional sign-in accounts, so an email match can only succeed against one. */
const DANA = { userId: "qa000000-0000-4000-8000-0000000000a5", email: "dana.rowe@fablewood.example", name: "Dana Rowe" };
const NINA = { userId: "qa000000-0000-4000-8000-0000000000a6", email: "nina.patel@fablewood.example", name: "Nina Patel" };
const SAM = { userId: "qa000000-0000-4000-8000-0000000000a7", email: "sam.okafor@fablewood.example", name: "Sam Okafor" };
const ACCOUNTS: { userId: string; email: string; name: string }[] = [DANA, NINA, SAM];

type Delegation = { status: string; revoked_at: string | null; effective_at: string | null; expires_at: string | null; acceptance_state: string };
type Record = {
  id: string; agentName: string; agentEmail: string | null; agentRelationship: string | null;
  poaKind: "general" | "limited"; durable: boolean; coveredPowers: string[]; limitsNote: string | null;
  coveredDocumentTypes: string[]; effectiveOn: string; expiresOn: string | null; fileName: string;
  status: PoaStatus; submittedBy: string; createdAt: string; reviewedBy: string | null; reviewedAt: string | null;
  reviewNote: string | null; revokedAt: string | null; revokeReason: string | null;
  agentUserId: string | null; delegation: Delegation | null;
  history: { event: string; by: string | null; note: string | null; at: string }[];
};

export type QaPowerOfAttorney = { records: Record[]; me: string };

const at = (d: string) => `2026-11-${d}T15:00:00Z`;

function delegation(over: Partial<Delegation> = {}): Delegation {
  return { status: "active", revoked_at: null, effective_at: "2026-01-01T00:00:00Z", expires_at: null, acceptance_state: "awaiting_acceptance", ...over };
}

export function createQaPowerOfAttorney(): QaPowerOfAttorney {
  const base = {
    poaKind: "general" as const, durable: false, limitsNote: null, coveredDocumentTypes: [] as string[],
    expiresOn: null as string | null, reviewedBy: null as string | null, reviewedAt: null as string | null,
    reviewNote: null as string | null, revokedAt: null as string | null, revokeReason: null as string | null,
    agentUserId: null as string | null, delegation: null as Delegation | null,
  };
  return {
    me: STAFF,
    records: [
      {
        ...base, id: "qa-poa-0001", agentName: "Dana Rowe", agentEmail: "dana.rowe@fablewood.example", agentRelationship: "Attorney",
        coveredPowers: ["provide_information", "tax_matters"], coveredDocumentTypes: [],
        effectiveOn: "2026-01-01", fileName: "rowe-power-of-attorney.pdf", status: "accepted",
        submittedBy: MANAGER, createdAt: at("02"),
        // Linked and accepted by Harmonious, but Dana has not said yes yet.
        agentUserId: DANA.userId, delegation: delegation(),
        history: [{ event: "submitted", by: MANAGER, note: null, at: at("02") }, { event: "accepted", by: STAFF, note: null, at: at("03") }],
      },
      {
        ...base, id: "qa-poa-0002", agentName: "Nina Patel", agentEmail: "nina.patel@fablewood.example", agentRelationship: "Spouse",
        coveredPowers: ["provide_information", "investment_decisions", "banking_matters"], coveredDocumentTypes: [],
        effectiveOn: "2026-02-01", expiresOn: "2027-02-01", fileName: "patel-power-of-attorney.pdf", status: "accepted",
        submittedBy: MANAGER, createdAt: at("04"),
        // Nina accepted the grant, so her listed powers are open now.
        agentUserId: NINA.userId, delegation: delegation({ acceptance_state: "accepted", expires_at: "2027-02-01T23:59:59Z" }),
        history: [{ event: "submitted", by: MANAGER, note: null, at: at("04") }, { event: "accepted", by: STAFF, note: null, at: at("05") }],
      },
      {
        ...base, id: "qa-poa-0003", agentName: "Sam Okafor", agentEmail: "sam.okafor@fablewood.example", agentRelationship: "Son",
        coveredPowers: ["sign_documents"], coveredDocumentTypes: ["subscription_agreement", "tax_form"],
        effectiveOn: "2026-03-01", fileName: "okafor-power-of-attorney.pdf", status: "accepted",
        submittedBy: STAFF, createdAt: at("06"), reviewedBy: MANAGER, reviewedAt: at("06"),
        // Accepted, but no account matches Sam's email, so nothing is open.
        agentUserId: null, delegation: null,
        history: [{ event: "submitted", by: STAFF, note: null, at: at("06") }],
      },
      {
        ...base, id: "qa-poa-0004", agentName: "Robin McAllister", agentEmail: "r.mcallister@example.com", agentRelationship: null,
        coveredPowers: ["provide_information"], coveredDocumentTypes: [],
        effectiveOn: "2026-05-01", fileName: "mcallister-power-of-attorney.pdf", status: "pending_review",
        submittedBy: MANAGER, createdAt: at("08"),
        agentUserId: null, delegation: null,
        history: [{ event: "submitted", by: MANAGER, note: null, at: at("08") }],
      },
    ],
  };
}

const accountName = (userId: string | null) => ACCOUNTS.find((a) => a.userId === userId)?.name ?? null;

/** The same payload shape the real list function returns, built from fictional rows. */
function shape(s: QaPowerOfAttorney) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    label: "John Smith (fictional)",
    can: { add: true, revoke: true, review: true, link: true },
    me: s.me,
    records: s.records.map((r) => {
      const view = poaAuthorityView(
        { status: r.status, effective_on: r.effectiveOn, expires_on: r.expiresOn, agent_user_id: r.agentUserId },
        r.delegation,
      );
      const displayStatus = r.status !== "accepted" ? r.status : r.expiresOn && r.expiresOn < today ? "expired" : r.effectiveOn > today ? "not_yet_effective" : "accepted";
      return {
        id: r.id, agentName: r.agentName, agentEmail: r.agentEmail, agentRelationship: r.agentRelationship,
        poaKind: r.poaKind, durable: r.durable, coveredPowers: r.coveredPowers, limitsNote: r.limitsNote,
        coveredDocumentTypes: r.coveredDocumentTypes, effectiveOn: r.effectiveOn, expiresOn: r.expiresOn,
        fileName: r.fileName, status: r.status, displayStatus,
        submittedBy: r.submittedBy, submittedByName: r.submittedBy === MANAGER ? "Jordan Vale" : "Harmonious", createdAt: r.createdAt,
        reviewedByName: r.reviewedBy ? (r.reviewedBy === MANAGER ? "Jordan Vale" : "Harmonious") : null,
        reviewedAt: r.reviewedAt, reviewNote: r.reviewNote, revokedAt: r.revokedAt, revokeReason: r.revokeReason,
        replacesId: null, agentUserId: r.agentUserId, agentName2: accountName(r.agentUserId),
        mayDo: poaPlainPowers(r.coveredPowers, r.limitsNote),
        authority: { state: view.state, label: view.label, detail: view.detail },
        history: r.history,
      };
    }),
  };
}

export function handleQaPowerOfAttorneyCall(fnName: string, data: any, s: QaPowerOfAttorney): unknown {
  const find = (id: string) => s.records.find((r) => r.id === id);
  switch (fnName) {
    case "listPowersOfAttorneyFn":
      if (data?.subject?.id !== QA_POA_PROFILE) throw new Error("Forbidden: you can't see powers of attorney for this account.");
      return shape(s);

    case "reviewPowerOfAttorneyFn": {
      const r = find(String(data?.id));
      if (!r) throw new Error("That power of attorney was not found.");
      if (r.submittedBy === s.me) throw new Error("Someone other than the person who uploaded it must review it.");
      if (r.status !== "pending_review") throw new Error("This power of attorney has already been reviewed.");
      if (data?.decision === "reject" && !String(data?.note ?? "").trim()) throw new Error("Say why it can't be accepted, so the account can fix it.");
      if (data?.decision === "reject") {
        r.status = "rejected";
        r.reviewedBy = s.me; r.reviewedAt = new Date().toISOString(); r.reviewNote = String(data.note).trim();
        r.history.push({ event: "rejected", by: s.me, note: r.reviewNote, at: r.reviewedAt });
        return { ok: true, why: null };
      }
      r.status = "accepted";
      r.reviewedBy = s.me; r.reviewedAt = new Date().toISOString(); r.reviewNote = data?.note?.trim() || null;
      r.history.push({ event: "accepted", by: s.me, note: r.reviewNote, at: r.reviewedAt });
      if (!r.agentUserId) {
        // Exactly what production says: accepted, but the named person has no account.
        return { ok: true, why: "The person named isn't linked to an account yet, so nothing was opened for them." };
      }
      r.delegation = delegation();
      r.history.push({ event: "authority_granted", by: s.me, note: `Opened: ${poaCapabilities(r.coveredPowers).length} permissions from the listed powers`, at: new Date().toISOString() });
      return { ok: true, why: null };
    }

    case "revokePowerOfAttorneyFn": {
      const r = find(String(data?.id));
      if (!r) throw new Error("That power of attorney was not found.");
      if (!String(data?.reason ?? "").trim()) throw new Error("Say why it is being revoked.");
      if (r.status === "revoked" || r.status === "rejected") throw new Error("This power of attorney is no longer active.");
      if (r.delegation) {
        r.delegation = { ...r.delegation, status: "revoked", revoked_at: new Date().toISOString() };
        r.history.push({ event: "authority_revoked", by: s.me, note: String(data.reason).trim(), at: new Date().toISOString() });
      }
      r.status = "revoked"; r.revokedAt = new Date().toISOString(); r.revokeReason = String(data.reason).trim();
      r.history.push({ event: "revoked", by: s.me, note: r.revokeReason, at: r.revokedAt });
      return { ok: true };
    }

    case "linkPowerOfAttorneyAgentFn": {
      const r = find(String(data?.id));
      if (!r) throw new Error("That power of attorney was not found.");
      if (r.agentUserId) throw new Error("This power of attorney is already linked to an account.");
      const email = String(data?.agentEmail ?? "").trim().toLowerCase();
      const matches = ACCOUNTS.filter((a) => a.email === email);
      const only = matches.length === 1 ? matches[0] : undefined;
      if (!only) throw new Error("No single account matches that email yet. The person needs a sign-in account first.");
      r.agentUserId = only.userId;
      r.history.push({ event: "agent_linked", by: s.me, note: `Matched the account using ${email}`, at: new Date().toISOString() });
      if (r.status === "accepted") {
        r.delegation = delegation();
        r.history.push({ event: "authority_granted", by: s.me, note: "Opened from the listed powers", at: new Date().toISOString() });
      }
      return { ok: true };
    }

    case "powerOfAttorneyFileFn": {
      const r = find(String(data?.id));
      if (!r) throw new Error("That power of attorney was not found.");
      r.history.push({ event: "downloaded", by: s.me, note: null, at: new Date().toISOString() });
      return { url: `data:text/plain,${encodeURIComponent(`Fictional document: ${r.fileName}`)}` };
    }

    case "startPoaUploadFn":
      return { path: `investment_profile/${QA_POA_PROFILE}/qa-upload`, token: "qa-token" };

    case "submitPowerOfAttorneyFn": {
      const input = {
        agentName: String(data?.agentName ?? ""), agentEmail: data?.agentEmail ?? null, poaKind: data?.poaKind,
        coveredPowers: (data?.coveredPowers ?? []) as string[], limitsNote: data?.limitsNote ?? null,
        effectiveOn: String(data?.effectiveOn ?? ""), expiresOn: data?.expiresOn ?? null,
      };
      const blocker = poaInputBlocker(input) ?? poaCoveredTypesBlocker(input.coveredPowers, (data?.coveredDocumentTypes ?? []) as string[]);
      if (blocker) throw new Error(blocker);
      const id = `qa-poa-${1000 + s.records.length}`;
      s.records.unshift({
        ...baseNew(), id, agentName: input.agentName.trim(), agentEmail: input.agentEmail?.trim().toLowerCase() ?? null,
        agentRelationship: data?.agentRelationship ?? null, poaKind: input.poaKind, durable: !!data?.durable,
        coveredPowers: input.coveredPowers, limitsNote: input.limitsNote, coveredDocumentTypes: (data?.coveredDocumentTypes ?? []) as string[],
        effectiveOn: input.effectiveOn, expiresOn: input.expiresOn, fileName: String(data?.fileName ?? "document.pdf"),
        status: "pending_review", submittedBy: s.me, createdAt: new Date().toISOString(),
        history: [{ event: "submitted", by: s.me, note: null, at: new Date().toISOString() }],
      });
      return { id };
    }

    default:
      throw new Error("Not modeled in the sandbox.");
  }
}

const baseNew = () => ({
  reviewedBy: null, reviewedAt: null, reviewNote: null, revokedAt: null, revokeReason: null,
  agentUserId: null, delegation: null,
});
