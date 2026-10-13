import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const S = () => import("@/lib/source-reconciliation.server");
const source = z.enum(["harmonious", "didit", "simplici", "wix", "google_drive", "box"]);
const ref = z.string().min(1).max(200);

export const getSourceReconciliation = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).overview(context.userId));

export const getSourceDecisionHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ source, sourceRef: ref }).parse(d))
  .handler(async ({ context, data }) => (await S()).history(context.userId, data.source, data.sourceRef));

export const recordSourceDecision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    source, sourceRef: ref,
    decision: z.enum(["confirm_match", "reject_match", "mark_unresolved", "flag_duplicate", "link_fund", "request_evidence", "stage_for_import"]),
    reason: z.string().trim().min(3).max(1000),
    personId: z.string().uuid().nullable().optional(),
    registryKey: z.string().max(120).nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => (await S()).decide(context.userId, data));
