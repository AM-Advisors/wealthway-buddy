/**
 * Authenticated server-function surface for fund setup (Phase A).
 *
 * Every handler re-resolves authority server-side from the signed-in user.
 * Nothing trusts a role, fund id or staff claim supplied by the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const engine = () => import("@/lib/fund-setup.server");

const idInput = z.object({ setupId: z.string().min(1) });

export const createFundSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: z.string().min(1),
      clientId: z.string().nullish(),
      fundRequestId: z.string().nullish(),
      structure: z.string().min(1),
      structureOther: z.string().nullish(),
      legalFundName: z.string().nullish(),
      displayName: z.string().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).createFundSetup(context.userId, data));

export const updateFundInformationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ setupId: z.string().min(1), patch: z.record(z.string(), z.any()) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).updateFundInformation(context.userId, data.setupId, data.patch),
  );

export const setSetupStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ setupId: z.string().min(1), stage: z.string().min(1) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).setSetupStage(context.userId, data.setupId, data.stage),
  );

export const savePartyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().optional(),
      setupId: z.string().min(1),
      role: z.string().min(1),
      displayName: z.string().min(1),
      organizationId: z.string().nullish(),
      personId: z.string().nullish(),
      entityId: z.string().nullish(),
      partyUserId: z.string().nullish(),
      contactEmail: z.string().nullish(),
      contactPhone: z.string().nullish(),
      isAuthorizedSignatory: z.boolean().optional(),
      notes: z.string().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).saveParty(context.userId, data));

export const updateSetupTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      taskId: z.string().min(1),
      status: z
        .enum(["not_started", "waiting_on_client", "in_progress", "review", "complete", "exception"])
        .optional(),
      assignedUserId: z.string().nullish(),
      clientOwnerUserId: z.string().nullish(),
      dueDate: z.string().nullish(),
      responsibleParty: z.string().optional(),
      notes: z.string().nullish(),
      response: z.record(z.string(), z.any()).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).updateTask(context.userId, data));

export const saveSetupDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      docType: z.string().min(1),
      title: z.string().min(1),
      storagePath: z.string().nullish(),
      externalReference: z.string().nullish(),
      taskId: z.string().nullish(),
      investorFacing: z.boolean().optional(),
      notes: z.string().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).saveSetupDocument(context.userId, data));

export const transitionSetupDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: z.string().min(1), to: z.string().min(1) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).transitionSetupDocument(context.userId, data.documentId, data.to),
  );

export const advanceEntityFormationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      step: z.enum([
        "name_selected",
        "formation_requested",
        "formation_filed",
        "formation_accepted",
        "ein_requested",
        "ein_received",
        "registered_agent_confirmed",
        "entity_active",
      ]),
      jurisdiction: z.string().nullish(),
      registeredAgent: z.string().nullish(),
      entityIdentifiers: z.record(z.string(), z.any()).optional(),
      formationDocumentId: z.string().nullish(),
      certificateDocumentId: z.string().nullish(),
      einLetterDocumentId: z.string().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).advanceEntityFormation(context.userId, data),
  );

export const saveEconomicsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      terms: z.record(z.string(), z.any()),
      classes: z.array(z.any()).optional(),
      investorSpecific: z.array(z.any()).optional(),
      effectiveFrom: z.string().nullish(),
      changeReason: z.string().nullish(),
      versionId: z.string().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).saveEconomics(context.userId, data));

export const approveEconomicsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ versionId: z.string().min(1) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).approveEconomics(context.userId, data.versionId),
  );

export const saveTargetAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({ setupId: z.string().min(1), assetName: z.string().min(1) })
      .catchall(z.any()).parse,
  )
  .handler(async ({ data, context }) => (await engine()).saveTargetAsset(context.userId, data));

export const updateBankingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      status: z
        .enum(["not_started", "application", "pending", "approved", "account_active"])
        .optional(),
      bankName: z.string().nullish(),
      relationshipContact: z.string().nullish(),
      accountReference: z.string().nullish(),
      notes: z.string().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).updateBanking(context.userId, data));

export const releaseBankingInstructionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput.parse)
  .handler(async ({ data, context }) =>
    (await engine()).releaseBankingInstructions(context.userId, data.setupId),
  );

export const saveRegulatoryConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      selections: z.record(z.string(), z.any()),
      amendmentReason: z.string().nullish(),
      configId: z.string().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).saveRegulatoryConfig(context.userId, data),
  );

export const reviewRegulatoryConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ configId: z.string().min(1) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).reviewRegulatoryConfig(context.userId, data.configId),
  );

export const saveEligibilityConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      rules: z.record(z.string(), z.any()),
      configId: z.string().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).saveEligibilityConfig(context.userId, data),
  );

export const approveEligibilityConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ configId: z.string().min(1) }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).approveEligibilityConfig(context.userId, data.configId),
  );

export const setOnboardingRequirementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      investorType: z.string().min(1),
      step: z.string().min(1),
      required: z.boolean(),
      config: z.record(z.string(), z.any()).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) =>
    (await engine()).setOnboardingRequirement(context.userId, data),
  );

export const setLaunchConditionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      conditionKey: z.string().min(1),
      label: z.string().optional(),
      required: z.boolean().optional(),
      satisfied: z.boolean().optional(),
      evidence: z.record(z.string(), z.any()).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).setLaunchCondition(context.userId, data));

export const getReadinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput.parse)
  .handler(async ({ data, context }) =>
    (await engine()).getReadiness(context.userId, data.setupId),
  );

export const decideLaunchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      setupId: z.string().min(1),
      decision: z.enum(["approved", "declined"]),
      reason: z.string().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await engine()).decideLaunch(context.userId, data));

export const launchFundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput.parse)
  .handler(async ({ data, context }) => (await engine()).launchFund(context.userId, data.setupId));

export const fundSetupDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput.parse)
  .handler(async ({ data, context }) =>
    (await engine()).fundSetupDetail(context.userId, data.setupId),
  );

export const fundAdministrationDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await engine()).fundAdministrationDashboard(context.userId));

export const clientFundSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ setupId: z.string().optional() }).parse)
  .handler(async ({ data, context }) =>
    (await engine()).clientFundSetup(context.userId, data.setupId),
  );
