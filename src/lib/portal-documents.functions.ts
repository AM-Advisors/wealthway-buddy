import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import type { StepUpProof } from "@/lib/mfa-ease";

const srv = () => import("@/lib/portal-documents.server");
const id = z.string().uuid();
const reason = z.string().trim().min(3, "Add a reason.").max(500);
const noStore = () => setResponseHeader("Cache-Control", "no-store, private");

export const getMyTaxDocuments = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => { noStore(); return (await srv()).investorTaxView(context.userId, context.claims); });

export const startTaxDocumentStepUp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        documentId: id,
        // A remembered-device token or a single-use emailed code can stand in for
        // the fresh authenticator check. The session must still be aal2.
        trustedDeviceToken: z.string().min(10).max(200).optional(),
        emailCode: z.string().trim().regex(/^\d{6}$/).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    noStore();
    const proof: StepUpProof = {};
    if (data.trustedDeviceToken) proof.trustedDeviceToken = data.trustedDeviceToken;
    if (data.emailCode) proof.emailCode = data.emailCode;
    return (await srv()).beginTaxStepUp(context.userId, context.claims, data.documentId, proof);
  });

export const downloadMyTaxDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentId: id, stepUpId: id }).parse(d))
  .handler(async ({ data, context }) => { noStore(); return (await srv()).downloadTaxDocument(context.userId, context.claims, data.documentId, data.stepUpId); });

export const getManagerTaxDelivery = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => { noStore(); return (await srv()).managerTaxDelivery(context.userId); });

export const getPortalLaunchOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => { noStore(); return (await srv()).opsOverview(context.userId); });

export const setDocumentSourceApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: id, approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).approveSource(context.userId, data.sourceId, data.approve));

export const discoverSourceFolders = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: id, folderId: z.string().max(200).nullable() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).discoverFolders(context.userId, data.sourceId, data.folderId));

export const runDocumentSourceSync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: id }).parse(d))
  .handler(async ({ data, context }) => (await srv()).runSync(context.userId, data.sourceId));

export const publishMatchedDocuments = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentIds: z.array(id).min(1).max(500), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).publishMatched(context.userId, data.documentIds, data.reason));

export const resolveDocumentReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reviewId: id, approve: z.boolean(), profileId: id.nullish(), note: reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).resolveReview(context.userId, data));

export const changeDocumentEntitlement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentId: id, principalType: z.enum(["investment_profile", "user"]), principalId: id, action: z.enum(["grant", "revoke"]), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).changeEntitlement(context.userId, data));

export const freezeDocumentAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(["all", "offering", "investment_profile", "user", "document"]), scopeId: id.nullable(), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).setFreeze(context.userId, data));

export const liftDocumentFreeze = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ freezeId: id, reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).liftFreeze(context.userId, data.freezeId, data.reason));
