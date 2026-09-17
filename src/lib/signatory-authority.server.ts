/**
 * Phase 3C — verified professional authority, delegation acceptance and
 * authorized signing.
 *
 * The browser never asserts authority. `resolveSignatoryAuthority` rebuilds the
 * entire chain from authoritative rows on every request:
 *
 *   signed-in human
 *     → live delegation (effective, not expired, not revoked, accepted)
 *     → active seat at the firm
 *     → the firm's verification status
 *     → the individual's credential where the firm type requires one
 *     → authority level authorized_signatory
 *     → explicitly granted sign_specified_documents
 *     → an accepted, unexpired, unrevoked authority document
 *     → that document's scope and covered document types
 *     → the delegation's scope, matched against the re-read resource
 *     → a fresh step-up authentication bound to this exact action
 *
 * No path here can move money, change bank or wire details, approve payments or
 * distributions: transaction authority stays inactive.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordDelegationAudit } from "@/lib/delegated-access.server";
import {
  DELEGATION_TERMS_VERSION,
  DENY_CODES,
  DENY_MESSAGES,
  STEP_UP_MAX_ATTEMPTS,
  STEP_UP_SIGN_ACTION,
  STEP_UP_TTL_MS,
  credentialRequirement,
  isBlockedTransactionAction,
  isSignableDocumentType,
  orgIsVerified,
} from "@/lib/signatory-model";

const db = () => supabaseAdmin as any;

const message = (code: string) => DENY_MESSAGES[code] ?? "Not authorised.";

export interface SignTarget {
  /** The investment profile / entity the signature is made for. */
  profileId?: string | null;
  fundId?: string | null;
  investmentId?: string | null;
  documentType: string;
}

export interface AuthorityDecision {
  allowed: boolean;
  code: string;
  reason: string;
  delegation?: any;
  organization?: any;
  authorityDocument?: any;
  principalUserId?: string;
  profileId?: string | null;
  fundId?: string | null;
  investmentId?: string | null;
}

const deny = (code: string): AuthorityDecision => ({
  allowed: false,
  code,
  reason: message(code),
});

function withinWindow(row: any, now: Date): boolean {
  if (row.effective_at && new Date(row.effective_at) > now) return false;
  if (row.expires_at && new Date(row.expires_at) <= now) return false;
  return true;
}

/** Does the delegation scope cover the exact thing being signed? */
function delegationCoversTarget(
  delegation: any,
  resolved: { profileId: string | null; fundId: string | null; investmentId: string | null },
): boolean {
  switch (delegation.scope_type) {
    case "person":
      return delegation.scope_id === delegation.principal_user_id;
    case "investment_profile":
      return !!resolved.profileId && delegation.scope_id === resolved.profileId;
    case "fund":
      return !!resolved.fundId && delegation.scope_id === resolved.fundId;
    case "investment":
      return !!resolved.investmentId && delegation.scope_id === resolved.investmentId;
    default:
      return false;
  }
}

/** Same question, asked of the authority document's own scope. */
function documentCoversTarget(
  doc: any,
  resolved: { principalUserId: string; profileId: string | null; fundId: string | null; investmentId: string | null },
): boolean {
  switch (doc.scope_type) {
    case "person":
      return doc.scope_id === resolved.principalUserId;
    case "investment_profile":
      return !!resolved.profileId && doc.scope_id === resolved.profileId;
    case "fund":
      return !!resolved.fundId && doc.scope_id === resolved.fundId;
    case "investment":
      return !!resolved.investmentId && doc.scope_id === resolved.investmentId;
    default:
      return false;
  }
}

/**
 * Re-reads the target from the database and proves it belongs to the principal
 * named on the delegation. Nothing is taken on the browser's word.
 */
async function resolveTarget(
  principalUserId: string,
  target: SignTarget,
): Promise<{ profileId: string | null; fundId: string | null; investmentId: string | null } | null> {
  let profileId: string | null = null;
  let fundId: string | null = null;
  let investmentId: string | null = null;

  if (target.investmentId) {
    const { data } = await db()
      .from("investor_applications")
      .select("id, user_id, offering_id")
      .eq("id", target.investmentId)
      .maybeSingle();
    if (!data || data.user_id !== principalUserId) return null;
    investmentId = data.id;
    fundId = data.offering_id;
  }

  if (target.profileId) {
    const { data } = await db()
      .from("investment_profiles")
      .select("id, owner_user_id")
      .eq("id", target.profileId)
      .maybeSingle();
    if (!data || data.owner_user_id !== principalUserId) return null;
    profileId = data.id;
  }

  if (target.fundId) {
    if (fundId && fundId !== target.fundId) return null;
    // The principal must actually have an investment in that fund.
    const { data } = await db()
      .from("investor_applications")
      .select("id")
      .eq("offering_id", target.fundId)
      .eq("user_id", principalUserId)
      .maybeSingle();
    if (!data) return null;
    fundId = target.fundId;
  }

  return { profileId, fundId, investmentId };
}

/** The whole signing authorization decision, rebuilt from stored records. */
export async function resolveSignatoryAuthority(
  actorUserId: string | null | undefined,
  delegationId: string,
  target: SignTarget,
  now = new Date(),
): Promise<AuthorityDecision> {
  if (!actorUserId) return deny(DENY_CODES.notSignedIn);
  if (isBlockedTransactionAction(target.documentType)) return deny(DENY_CODES.blocked);
  if (!isSignableDocumentType(target.documentType)) return deny(DENY_CODES.documentType);

  const { data: delegation } = await db()
    .from("delegations")
    .select("*")
    .eq("id", delegationId)
    .maybeSingle();

  if (!delegation) return deny(DENY_CODES.noDelegation);
  if (delegation.delegate_user_id !== actorUserId) return deny(DENY_CODES.noDelegation);
  if (delegation.status !== "active") return deny(DENY_CODES.noDelegation);
  if (delegation.revoked_at) return deny(DENY_CODES.noDelegation);
  if (!withinWindow(delegation, now)) return deny(DENY_CODES.noDelegation);

  if (delegation.acceptance_state === "renewal_required") return deny(DENY_CODES.renewalRequired);
  if (delegation.acceptance_state !== "accepted") return deny(DENY_CODES.notAccepted);

  // ---- the firm ---------------------------------------------------------
  let organization: any = null;
  if (delegation.organization_id) {
    const { data: seat } = await db()
      .from("professional_memberships")
      .select("id, status")
      .eq("organization_id", delegation.organization_id)
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (!seat || seat.status !== "active") return deny(DENY_CODES.membership);

    const { data: org } = await db()
      .from("professional_organizations")
      .select("*")
      .eq("id", delegation.organization_id)
      .maybeSingle();
    if (!org || !orgIsVerified(org, now)) return deny(DENY_CODES.orgUnverified);
    organization = org;

    // ---- the individual's credential, where the firm type requires one ---
    const required = credentialRequirement(org.org_type);
    if (required.length > 0) {
      const { data: creds } = await db()
        .from("professional_credentials")
        .select("credential_type, status, expires_at")
        .eq("user_id", actorUserId);
      const ok = ((creds ?? []) as any[]).some(
        (c) =>
          required.includes(c.credential_type) &&
          c.status === "verified" &&
          (!c.expires_at || new Date(c.expires_at) > now),
      );
      if (!ok) return deny(DENY_CODES.credential);
    }
  }

  // ---- authority level and explicit capability --------------------------
  if (delegation.authority_level !== "authorized_signatory") {
    return deny(DENY_CODES.authority);
  }
  const { data: permission } = await db()
    .from("delegation_permissions")
    .select("id")
    .eq("delegation_id", delegation.id)
    .eq("capability", "sign_specified_documents")
    .maybeSingle();
  if (!permission) return deny(DENY_CODES.capability);

  // ---- the resource, re-read and matched to the principal ---------------
  const resolved = await resolveTarget(delegation.principal_user_id, target);
  if (!resolved) return deny(DENY_CODES.scope);
  if (!resolved.profileId && !resolved.fundId && !resolved.investmentId) {
    return deny(DENY_CODES.scope);
  }
  if (!delegationCoversTarget(delegation, resolved)) return deny(DENY_CODES.scope);

  // Document type must also be named on the delegation when it lists any.
  const delegationTypes: string[] = delegation.covered_document_types ?? [];
  if (delegationTypes.length > 0 && !delegationTypes.includes(target.documentType)) {
    return deny(DENY_CODES.documentType);
  }

  // ---- documented legal authority ---------------------------------------
  const { data: docs } = await db()
    .from("authority_documents")
    .select("*")
    .eq("delegation_id", delegation.id);

  const usable = ((docs ?? []) as any[]).filter((doc) => {
    if (doc.review_status !== "accepted") return false;
    if (doc.revoked_at) return false;
    if (doc.principal_user_id !== delegation.principal_user_id) return false;
    if (doc.delegate_user_id !== actorUserId) return false;
    if (!withinWindow(doc, now)) return false;
    return true;
  });
  if (usable.length === 0) return deny(DENY_CODES.noAuthorityDocument);

  const scoped = usable.filter((doc) =>
    documentCoversTarget(doc, { principalUserId: delegation.principal_user_id, ...resolved }),
  );
  if (scoped.length === 0) return deny(DENY_CODES.authorityDocumentScope);

  const authorityDocument = scoped.find((doc) => {
    const types: string[] = doc.covered_document_types ?? [];
    return types.includes(target.documentType);
  });
  if (!authorityDocument) return deny(DENY_CODES.documentType);

  return {
    allowed: true,
    code: "authorized",
    reason: "Authorised to sign.",
    delegation,
    organization,
    authorityDocument,
    principalUserId: delegation.principal_user_id,
    profileId: resolved.profileId,
    fundId: resolved.fundId,
    investmentId: resolved.investmentId,
  };
}

// ------------------------------------------------------------- step-up ----

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sixDigitCode(): string {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return String(100000 + ((buf[0] ?? 0) % 900000));
}

/**
 * Opens a short-lived challenge bound to one action on one resource. The code
 * itself is never stored — only its hash.
 */
export async function beginSigningStepUp(
  actorUserId: string | null | undefined,
  input: {
    delegationId: string;
    resourceType: string;
    resourceId: string;
    method?: string;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  if (!actorUserId) throw new Error(`Forbidden: ${message(DENY_CODES.notSignedIn)}`);
  const code = sixDigitCode();
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS).toISOString();

  const { data, error } = await db()
    .from("stepup_authentications")
    .insert({
      user_id: actorUserId,
      method: input.method ?? "otp_email",
      challenge_reference: await sha256(code),
      session_reference: await sha256(`${actorUserId}:${expiresAt}`),
      action: STEP_UP_SIGN_ACTION,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      delegation_id: input.delegationId,
      status: "pending",
      expires_at: expiresAt,
      ip_address: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    })
    .select("id, expires_at")
    .maybeSingle();
  if (error) throw new Error(error.message);

  await db().from("authority_notifications").insert({
    recipient_user_id: actorUserId,
    recipient_kind: "professional",
    kind: "step_up_challenge",
    message: `Your signing confirmation code is ${code}. It expires in five minutes.`,
    delegation_id: input.delegationId,
  });

  return { challengeId: data.id as string, expiresAt: data.expires_at as string };
}

/** Verifies the challenge. A wrong or stale code never becomes usable. */
export async function verifySigningStepUp(
  actorUserId: string | null | undefined,
  challengeId: string,
  code: string,
) {
  if (!actorUserId) throw new Error(`Forbidden: ${message(DENY_CODES.notSignedIn)}`);
  const { data: row } = await db()
    .from("stepup_authentications")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (!row || row.user_id !== actorUserId) throw new Error("Forbidden: challenge not found.");
  if (row.status !== "pending") throw new Error("That confirmation is no longer valid.");
  if (new Date(row.expires_at) <= new Date()) {
    await db().from("stepup_authentications").update({ status: "expired" }).eq("id", challengeId);
    throw new Error("That confirmation expired. Start again.");
  }
  if ((row.attempts ?? 0) >= STEP_UP_MAX_ATTEMPTS) {
    await db().from("stepup_authentications").update({ status: "failed" }).eq("id", challengeId);
    throw new Error("Too many attempts. Start again.");
  }

  const matches = row.challenge_reference === (await sha256(code));
  if (!matches) {
    await db()
      .from("stepup_authentications")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("id", challengeId);
    throw new Error("That code is not correct.");
  }

  await db()
    .from("stepup_authentications")
    .update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("id", challengeId);
  return { verified: true as const };
}

/** A step-up only satisfies the exact action and resource it was opened for. */
async function consumeStepUp(
  actorUserId: string,
  challengeId: string,
  delegationId: string,
  resourceType: string,
  resourceId: string,
  now: Date,
): Promise<any | null> {
  const { data: row } = await db()
    .from("stepup_authentications")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (!row) return null;
  if (row.user_id !== actorUserId) return null;
  if (row.status !== "verified") return null;
  if (row.consumed_at) return null;
  if (row.action !== STEP_UP_SIGN_ACTION) return null;
  if (row.delegation_id !== delegationId) return null;
  if (row.resource_type !== resourceType || row.resource_id !== resourceId) return null;
  if (new Date(row.expires_at) <= now) return null;

  await db()
    .from("stepup_authentications")
    .update({ status: "consumed", consumed_at: now.toISOString() })
    .eq("id", challengeId);
  return row;
}

// --------------------------------------------------------------- signing --

export interface SignInput extends SignTarget {
  delegationId: string;
  stepUpId: string;
  documentReference?: string | null;
  documentName?: string | null;
  documentHash: string;
  signerTitle?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

async function displayName(userId: string): Promise<string> {
  const { data } = await db()
    .from("persons")
    .select("legal_first_name, legal_last_name, preferred_name, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return "Signer";
  return (
    [data.legal_first_name, data.legal_last_name].filter(Boolean).join(" ") ||
    data.preferred_name ||
    data.email ||
    "Signer"
  );
}

/** Performs the signature and writes the immutable agency record. */
export async function signAsAuthorizedSignatory(
  actorUserId: string | null | undefined,
  input: SignInput,
  now = new Date(),
) {
  const decision = await resolveSignatoryAuthority(
    actorUserId,
    input.delegationId,
    {
      profileId: input.profileId ?? null,
      fundId: input.fundId ?? null,
      investmentId: input.investmentId ?? null,
      documentType: input.documentType,
    },
    now,
  );
  if (!decision.allowed) {
    await recordDelegationAudit({
      actorUserId: actorUserId ?? null,
      action: "delegated_signature_refused",
      delegationId: input.delegationId,
      outcome: decision.code,
      detail: decision.reason,
    });
    throw new Error(`Forbidden: ${decision.reason}`);
  }

  const resourceType = input.investmentId
    ? "investment"
    : input.profileId
      ? "investment_profile"
      : "fund";
  const resourceId = input.investmentId ?? input.profileId ?? input.fundId ?? "";

  // A stale login is not enough: the challenge must be fresh, verified,
  // unconsumed and opened for exactly this action and resource.
  const stepUp = await consumeStepUp(
    actorUserId as string,
    input.stepUpId,
    input.delegationId,
    resourceType,
    resourceId,
    now,
  );
  if (!stepUp) {
    await recordDelegationAudit({
      actorUserId: actorUserId ?? null,
      action: "delegated_signature_refused",
      delegationId: input.delegationId,
      outcome: DENY_CODES.stepUp,
      detail: message(DENY_CODES.stepUp),
    });
    throw new Error(`Forbidden: ${message(DENY_CODES.stepUp)}`);
  }

  const delegation = decision.delegation;
  const signerName = await displayName(actorUserId as string);
  const principalName = await displayName(delegation.principal_user_id);

  let profileLabel: string | null = null;
  if (decision.profileId) {
    const { data } = await db()
      .from("investment_profiles")
      .select("display_label")
      .eq("id", decision.profileId)
      .maybeSingle();
    profileLabel = data?.display_label ?? null;
  }

  const orgName = decision.organization?.name ?? null;
  const statement = [
    signerName,
    "Authorized Signatory",
    `acting on behalf of ${profileLabel ?? principalName}`,
    orgName ? `through ${orgName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: signature, error } = await db()
    .from("delegated_signatures")
    .insert({
      signer_user_id: actorUserId,
      signer_name: signerName,
      signer_title: input.signerTitle ?? "Authorized Signatory",
      principal_user_id: delegation.principal_user_id,
      principal_name: principalName,
      profile_id: decision.profileId,
      profile_label: profileLabel,
      organization_id: delegation.organization_id,
      organization_name: orgName,
      delegation_id: delegation.id,
      authority_document_id: decision.authorityDocument.id,
      authority_level: delegation.authority_level,
      fund_id: decision.fundId,
      investment_id: decision.investmentId,
      document_type: input.documentType,
      document_reference: input.documentReference ?? null,
      document_name: input.documentName ?? null,
      document_hash: input.documentHash,
      signature_statement: statement,
      stepup_id: stepUp.id,
      stepup_method: stepUp.method,
      ip_address: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordDelegationAudit({
    actorUserId: actorUserId ?? null,
    action: "delegated_signature_completed",
    organizationId: delegation.organization_id,
    delegationId: delegation.id,
    principalUserId: delegation.principal_user_id,
    delegateUserId: actorUserId ?? null,
    scopeType: delegation.scope_type,
    scopeId: delegation.scope_id,
    authorityLevel: delegation.authority_level,
    capabilities: ["sign_specified_documents"],
    outcome: "signed",
    after: {
      signature_id: signature.id,
      document_type: input.documentType,
      document_hash: input.documentHash,
      authority_document_id: decision.authorityDocument.id,
      stepup_id: stepUp.id,
    },
  });

  await notify(delegation.principal_user_id, "principal", "signature_completed", {
    message: `${signerName}${orgName ? ` of ${orgName}` : ""} signed ${
      input.documentName ?? input.documentType.replace(/_/g, " ")
    } on your behalf.`,
    delegationId: delegation.id,
  });

  return { signatureId: signature.id as string, statement };
}

// --------------------------------------------------------- notifications --

export async function notify(
  recipientUserId: string,
  recipientKind: "principal" | "professional",
  kind: string,
  opts: {
    message: string;
    delegationId?: string | null;
    authorityDocumentId?: string | null;
    organizationId?: string | null;
  },
) {
  await db().from("authority_notifications").insert({
    recipient_user_id: recipientUserId,
    recipient_kind: recipientKind,
    kind,
    message: opts.message,
    delegation_id: opts.delegationId ?? null,
    authority_document_id: opts.authorityDocumentId ?? null,
    organization_id: opts.organizationId ?? null,
  });
}

export async function listAuthorityNotifications(userId: string | null | undefined) {
  if (!userId) return [];
  const { data } = await db()
    .from("authority_notifications")
    .select("*")
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

// ---------------------------------------------------- delegation acceptance

/** Everything waiting for this professional's acceptance. */
export async function listAwaitingAcceptance(actorUserId: string | null | undefined) {
  if (!actorUserId) return [];
  const { data } = await db()
    .from("delegations")
    .select("*")
    .eq("delegate_user_id", actorUserId)
    .in("acceptance_state", ["awaiting_acceptance", "renewal_required"]);

  const out: any[] = [];
  for (const row of (data ?? []) as any[]) {
    const [{ data: perms }, { data: org }] = await Promise.all([
      db().from("delegation_permissions").select("capability").eq("delegation_id", row.id),
      row.organization_id
        ? db().from("professional_organizations").select("name").eq("id", row.organization_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    out.push({
      delegationId: row.id,
      principalName: await displayName(row.principal_user_id),
      organizationName: org?.name ?? null,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      authorityLevel: row.authority_level,
      capabilities: ((perms ?? []) as any[]).map((p) => p.capability),
      coveredDocumentTypes: row.covered_document_types ?? [],
      effectiveAt: row.effective_at,
      expiresAt: row.expires_at,
      grantVersion: row.grant_version,
      acceptanceState: row.acceptance_state,
      termsVersion: DELEGATION_TERMS_VERSION,
    });
  }
  return out;
}

/**
 * The professional accepts exactly what the client granted. Nothing about the
 * scope, permissions, authority or dates can be altered here — acceptance only
 * records agreement to the stored grant.
 */
export async function acceptDelegation(
  actorUserId: string | null | undefined,
  delegationId: string,
  termsVersion: string,
  decision: "accept" | "decline" = "accept",
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  const { data: row } = await db().from("delegations").select("*").eq("id", delegationId).maybeSingle();
  if (!row) throw new Error("That delegation is not available.");
  if (row.delegate_user_id !== actorUserId) throw new Error("Forbidden: this is not yours to accept.");
  if (row.revoked_at || row.status === "revoked") throw new Error("That delegation was revoked.");
  if (!["awaiting_acceptance", "renewal_required"].includes(row.acceptance_state)) {
    throw new Error("That delegation does not need your acceptance.");
  }
  if (termsVersion !== DELEGATION_TERMS_VERSION) {
    throw new Error("Please review the current delegate terms and try again.");
  }

  if (row.organization_id) {
    const { data: seat } = await db()
      .from("professional_memberships")
      .select("status")
      .eq("organization_id", row.organization_id)
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (!seat || seat.status !== "active") throw new Error(`Forbidden: ${message(DENY_CODES.membership)}`);
  }

  const { data: perms } = await db()
    .from("delegation_permissions")
    .select("capability")
    .eq("delegation_id", row.id);
  const capabilities = ((perms ?? []) as any[]).map((p) => p.capability);

  const accepted = decision === "accept";
  await db()
    .from("delegations")
    .update({
      acceptance_state: accepted ? "accepted" : "declined",
      accepted_at: accepted ? new Date().toISOString() : null,
      accepted_by: accepted ? actorUserId : null,
      accepted_terms_version: accepted ? termsVersion : null,
      status: accepted ? "active" : row.status,
    })
    .eq("id", row.id);

  await db().from("delegation_acceptance_events").insert({
    delegation_id: row.id,
    actor_user_id: actorUserId,
    actor_kind: "professional",
    action: accepted ? "accepted" : "declined",
    grant_version: row.grant_version ?? 1,
    principal_user_id: row.principal_user_id,
    delegate_user_id: row.delegate_user_id,
    organization_id: row.organization_id,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    authority_level: row.authority_level,
    capabilities,
    effective_at: row.effective_at,
    expires_at: row.expires_at,
    terms_version: termsVersion,
    snapshot: { ...row, capabilities },
  });

  await recordDelegationAudit({
    actorUserId,
    action: accepted ? "delegation_accepted" : "delegation_declined",
    organizationId: row.organization_id,
    delegationId: row.id,
    principalUserId: row.principal_user_id,
    delegateUserId: actorUserId,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    authorityLevel: row.authority_level,
    capabilities,
    outcome: accepted ? "accepted" : "declined",
  });

  await notify(row.principal_user_id, "principal", "delegation_accepted", {
    message: accepted
      ? `${await displayName(actorUserId)} accepted the access you granted.`
      : `${await displayName(actorUserId)} declined the access you granted.`,
    delegationId: row.id,
  });

  return { acceptanceState: accepted ? "accepted" : "declined" };
}

/**
 * A material change re-opens acceptance and, for signing delegations, stands
 * the authority down until the professional accepts again.
 */
export async function requireRenewedAcceptance(delegationId: string, reason: string) {
  const { data: row } = await db().from("delegations").select("*").eq("id", delegationId).maybeSingle();
  if (!row) return;
  if (row.acceptance_state === "not_required") return;

  await db()
    .from("delegations")
    .update({
      acceptance_state: "renewal_required",
      grant_version: (row.grant_version ?? 1) + 1,
      material_change_at: new Date().toISOString(),
    })
    .eq("id", delegationId);

  await db().from("delegation_acceptance_events").insert({
    delegation_id: row.id,
    actor_user_id: row.principal_user_id,
    actor_kind: "client",
    action: "material_change",
    grant_version: (row.grant_version ?? 1) + 1,
    principal_user_id: row.principal_user_id,
    delegate_user_id: row.delegate_user_id,
    organization_id: row.organization_id,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    authority_level: row.authority_level,
    snapshot: { reason },
  });

  await notify(row.delegate_user_id, "professional", "acceptance_required", {
    message: "An authorisation you hold changed and must be accepted again before you can act.",
    delegationId: row.id,
  });
}

// ------------------------------------------------------ authority documents

export async function submitAuthorityDocument(
  actorUserId: string | null | undefined,
  input: {
    delegationId: string;
    documentType: string;
    fileName: string;
    storagePath: string;
    documentHash?: string | null;
    coveredDocumentTypes: string[];
    coveredActions?: string[];
    effectiveAt?: string | null;
    expiresAt?: string | null;
  },
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  const { data: row } = await db()
    .from("delegations")
    .select("*")
    .eq("id", input.delegationId)
    .maybeSingle();
  if (!row) throw new Error("That delegation is not available.");
  if (row.principal_user_id !== actorUserId && row.delegate_user_id !== actorUserId) {
    throw new Error("Forbidden: you are not a party to that delegation.");
  }
  for (const type of input.coveredDocumentTypes) {
    if (!isSignableDocumentType(type)) throw new Error("That document type cannot be delegated.");
  }
  for (const action of input.coveredActions ?? []) {
    if (isBlockedTransactionAction(action)) {
      throw new Error(`Forbidden: ${message(DENY_CODES.blocked)}`);
    }
  }

  const { data: existing } = await db()
    .from("authority_documents")
    .select("id")
    .eq("delegation_id", row.id);
  const version = ((existing ?? []) as any[]).length + 1;

  const { data: doc, error } = await db()
    .from("authority_documents")
    .insert({
      delegation_id: row.id,
      principal_user_id: row.principal_user_id,
      delegate_user_id: row.delegate_user_id,
      organization_id: row.organization_id,
      document_type: input.documentType,
      file_name: input.fileName,
      storage_path: input.storagePath,
      document_hash: input.documentHash ?? null,
      version,
      scope_type: row.scope_type,
      scope_id: row.scope_id,
      covered_actions: input.coveredActions ?? ["sign_specified_documents"],
      covered_document_types: input.coveredDocumentTypes,
      effective_at: input.effectiveAt ?? new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
      // Uploading proves nothing: it must still be reviewed and accepted.
      review_status: "uploaded",
      submitted_by: actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  // A replacement stands the previous authority down.
  for (const prior of (existing ?? []) as any[]) {
    await db()
      .from("authority_documents")
      .update({ review_status: "superseded", superseded_by: doc.id })
      .eq("id", prior.id)
      .eq("review_status", "accepted");
  }

  await recordDelegationAudit({
    actorUserId,
    action: "authority_document_submitted",
    organizationId: row.organization_id,
    delegationId: row.id,
    principalUserId: row.principal_user_id,
    delegateUserId: row.delegate_user_id,
    outcome: "uploaded",
    after: { id: doc.id, document_type: input.documentType, version },
  });

  await notify(row.principal_user_id, "principal", "authority_document_submitted", {
    message: "An authority document was submitted for your delegated access.",
    delegationId: row.id,
    authorityDocumentId: doc.id,
  });

  return { id: doc.id as string, version };
}

async function isStaffUser(userId: string): Promise<boolean> {
  const { data } = await db().from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).some((r) =>
    ["admin", "super_admin", "operations", "compliance", "legal"].includes(r.role),
  );
}

/** Only Harmonious staff accept legal authority. The professional never can. */
export async function reviewAuthorityDocument(
  actorUserId: string | null | undefined,
  documentId: string,
  decision: "accept" | "reject" | "revoke" | "in_review",
  note?: string | null,
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  if (!(await isStaffUser(actorUserId))) {
    throw new Error("Forbidden: only Harmonious staff can review legal authority.");
  }
  const { data: doc } = await db()
    .from("authority_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new Error("That authority document is not available.");
  if (doc.delegate_user_id === actorUserId) {
    throw new Error("Forbidden: you cannot review your own authority.");
  }

  const status =
    decision === "accept"
      ? "accepted"
      : decision === "reject"
        ? "rejected"
        : decision === "revoke"
          ? "revoked"
          : "in_review";

  await db()
    .from("authority_documents")
    .update({
      review_status: status,
      reviewed_by: actorUserId,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? null,
      revoked_at: status === "revoked" ? new Date().toISOString() : null,
      revoked_by: status === "revoked" ? actorUserId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  await recordDelegationAudit({
    actorUserId,
    action: `authority_document_${status}`,
    organizationId: doc.organization_id,
    delegationId: doc.delegation_id,
    principalUserId: doc.principal_user_id,
    delegateUserId: doc.delegate_user_id,
    outcome: status,
    before: { review_status: doc.review_status },
    after: { review_status: status },
    detail: note ?? null,
  });

  const wording =
    status === "accepted"
      ? "Signing authority is now active for your delegated access."
      : status === "revoked"
        ? "An authority document was revoked; signing authority has stopped."
        : `An authority document is now ${status.replace(/_/g, " ")}.`;
  await notify(doc.principal_user_id, "principal", `authority_${status}`, {
    message: wording,
    delegationId: doc.delegation_id,
    authorityDocumentId: doc.id,
  });
  await notify(doc.delegate_user_id, "professional", `authority_${status}`, {
    message: wording,
    delegationId: doc.delegation_id,
    authorityDocumentId: doc.id,
  });

  return { status };
}

export async function listAuthorityDocuments(
  actorUserId: string | null | undefined,
  filter: { asPrincipal?: boolean } = {},
) {
  if (!actorUserId) return [];
  const column = filter.asPrincipal ? "principal_user_id" : "delegate_user_id";
  const { data } = await db()
    .from("authority_documents")
    .select("*")
    .eq(column, actorUserId)
    .order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

/** Who may sign for the signed-in client, and under what authority. */
export async function listSignatoryAuthorityForPrincipal(userId: string | null | undefined) {
  if (!userId) return [];
  const { data: rows } = await db()
    .from("delegations")
    .select("*")
    .eq("principal_user_id", userId)
    .eq("authority_level", "authorized_signatory");

  const out: any[] = [];
  for (const row of (rows ?? []) as any[]) {
    const [{ data: docs }, { data: org }, { data: signatures }] = await Promise.all([
      db().from("authority_documents").select("*").eq("delegation_id", row.id),
      row.organization_id
        ? db().from("professional_organizations").select("name, verification_status").eq("id", row.organization_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db()
        .from("delegated_signatures")
        .select("id, document_type, document_name, signed_at")
        .eq("delegation_id", row.id)
        .order("signed_at", { ascending: false })
        .limit(5),
    ]);
    out.push({
      delegationId: row.id,
      professionalName: await displayName(row.delegate_user_id),
      organizationName: org?.name ?? null,
      organizationVerification: org?.verification_status ?? null,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      coveredDocumentTypes: row.covered_document_types ?? [],
      acceptanceState: row.acceptance_state,
      status: row.status,
      effectiveAt: row.effective_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      authorityDocuments: ((docs ?? []) as any[]).map((d) => ({
        id: d.id,
        type: d.document_type,
        fileName: d.file_name,
        reviewStatus: d.review_status,
        effectiveAt: d.effective_at,
        expiresAt: d.expires_at,
        coveredDocumentTypes: d.covered_document_types ?? [],
      })),
      recentSignatures: signatures ?? [],
    });
  }
  return out;
}

/** Signature history. Revocation never removes a lawfully completed signature. */
export async function listSignatureActivity(
  userId: string | null | undefined,
  as: "principal" | "signer" = "principal",
) {
  if (!userId) return [];
  const column = as === "principal" ? "principal_user_id" : "signer_user_id";
  const { data } = await db()
    .from("delegated_signatures")
    .select("*")
    .eq(column, userId)
    .order("signed_at", { ascending: false })
    .limit(200);
  return (data ?? []) as any[];
}

/**
 * Immediate stand-down. Existing signatures are untouched; only future
 * authority is withdrawn.
 */
export async function revokeSignatoryAuthority(
  actorUserId: string | null | undefined,
  delegationId: string,
  reason?: string | null,
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  const { data: row } = await db().from("delegations").select("*").eq("id", delegationId).maybeSingle();
  if (!row) throw new Error("That delegation is not available.");
  if (row.principal_user_id !== actorUserId && !(await isStaffUser(actorUserId))) {
    throw new Error("Forbidden: only the client or staff can revoke this.");
  }

  const stamp = new Date().toISOString();
  await db()
    .from("delegations")
    .update({ status: "revoked", revoked_at: stamp, revoked_by: actorUserId, revoke_reason: reason ?? null })
    .eq("id", delegationId);
  await db()
    .from("authority_documents")
    .update({ review_status: "revoked", revoked_at: stamp, revoked_by: actorUserId })
    .eq("delegation_id", delegationId)
    .eq("review_status", "accepted");

  await recordDelegationAudit({
    actorUserId,
    action: "signatory_authority_revoked",
    organizationId: row.organization_id,
    delegationId,
    principalUserId: row.principal_user_id,
    delegateUserId: row.delegate_user_id,
    authorityLevel: row.authority_level,
    outcome: "revoked",
    detail: reason ?? null,
  });
  await notify(row.delegate_user_id, "professional", "authority_revoked", {
    message: "Signing authority for one of your clients has been withdrawn.",
    delegationId,
  });
  return { ok: true as const };
}

// -------------------------------------------------- organization & creds --

export async function saveOrganizationVerification(
  actorUserId: string | null | undefined,
  organizationId: string,
  patch: Record<string, unknown>,
  submit: boolean,
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  const { data: seat } = await db()
    .from("professional_memberships")
    .select("status, seat_role")
    .eq("organization_id", organizationId)
    .eq("user_id", actorUserId)
    .maybeSingle();
  const staff = await isStaffUser(actorUserId);
  if (!staff && (!seat || seat.status !== "active")) {
    throw new Error("Forbidden: you do not hold an active seat at that firm.");
  }

  // A firm can never mark itself verified.
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  delete update["verification_status"];
  delete update["verified_at"];
  delete update["verified_by"];
  if (submit) {
    update["verification_status"] = "submitted";
    update["verification_submitted_at"] = new Date().toISOString();
  }

  await db().from("professional_organizations").update(update).eq("id", organizationId);
  await recordDelegationAudit({
    actorUserId,
    action: submit ? "organization_verification_submitted" : "organization_profile_saved",
    organizationId,
    outcome: submit ? "submitted" : "saved",
    after: update,
  });
  return { ok: true as const };
}

export async function reviewOrganizationVerification(
  actorUserId: string | null | undefined,
  organizationId: string,
  status: string,
  note?: string | null,
  reverificationDueAt?: string | null,
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  if (!(await isStaffUser(actorUserId))) {
    throw new Error("Forbidden: only Harmonious staff can verify a firm.");
  }
  await db()
    .from("professional_organizations")
    .update({
      verification_status: status,
      verification_note: note ?? null,
      verified_at: status === "verified" ? new Date().toISOString() : null,
      verified_by: status === "verified" ? actorUserId : null,
      reverification_due_at: reverificationDueAt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);
  await recordDelegationAudit({
    actorUserId,
    action: "organization_verification_reviewed",
    organizationId,
    outcome: status,
    detail: note ?? null,
  });
  return { status };
}

export async function saveCredential(
  actorUserId: string | null | undefined,
  input: {
    id?: string | null;
    organizationId?: string | null;
    credentialType: string;
    jurisdiction?: string | null;
    credentialNumber?: string | null;
    firmIdentifier?: string | null;
    fiduciaryCapacity?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
  },
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  const values = {
    user_id: actorUserId,
    organization_id: input.organizationId ?? null,
    credential_type: input.credentialType,
    jurisdiction: input.jurisdiction ?? null,
    credential_number: input.credentialNumber ?? null,
    firm_identifier: input.firmIdentifier ?? null,
    fiduciary_capacity: input.fiduciaryCapacity ?? null,
    issued_at: input.issuedAt ?? null,
    expires_at: input.expiresAt ?? null,
    // Claiming a credential never verifies it.
    status: "submitted",
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data: existing } = await db()
      .from("professional_credentials")
      .select("user_id")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing || existing.user_id !== actorUserId) throw new Error("Forbidden: not your credential.");
    await db().from("professional_credentials").update(values).eq("id", input.id);
    return { id: input.id };
  }

  const { data, error } = await db()
    .from("professional_credentials")
    .insert(values)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function reviewCredential(
  actorUserId: string | null | undefined,
  credentialId: string,
  status: string,
  note?: string | null,
) {
  if (!actorUserId) throw new Error("Forbidden: not signed in.");
  if (!(await isStaffUser(actorUserId))) {
    throw new Error("Forbidden: only Harmonious staff can verify a credential.");
  }
  await db()
    .from("professional_credentials")
    .update({
      status,
      review_note: note ?? null,
      verified_at: status === "verified" ? new Date().toISOString() : null,
      verified_by: status === "verified" ? actorUserId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", credentialId);
  return { status };
}

export async function listMyCredentials(userId: string | null | undefined) {
  if (!userId) return [];
  const { data } = await db()
    .from("professional_credentials")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

/** Authority that lapses soon, for the workspace's "Expiring authority" list. */
export async function listExpiringAuthority(userId: string | null | undefined, days = 60) {
  if (!userId) return { delegations: [], documents: [], credentials: [] };
  const cutoff = new Date(Date.now() + days * 86_400_000);

  const [{ data: dels }, { data: docs }, { data: creds }] = await Promise.all([
    db().from("delegations").select("*").eq("delegate_user_id", userId),
    db().from("authority_documents").select("*").eq("delegate_user_id", userId),
    db().from("professional_credentials").select("*").eq("user_id", userId),
  ]);

  const soon = (value: string | null | undefined) =>
    !!value && new Date(value) <= cutoff;

  return {
    delegations: ((dels ?? []) as any[]).filter((d) => soon(d.expires_at)),
    documents: ((docs ?? []) as any[]).filter((d) => soon(d.expires_at)),
    credentials: ((creds ?? []) as any[]).filter((c) => soon(c.expires_at)),
  };
}
