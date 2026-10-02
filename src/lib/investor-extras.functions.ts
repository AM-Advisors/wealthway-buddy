import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import type { FeeStatus, FundUpdateRow, InvestorFundLinks, InvestorUpdate, OnboardingUpload } from "@/lib/investor-extras.server";

const x = () => import("@/lib/investor-extras.server");
const uuid = z.string().uuid();
const KIND = z.enum(["identification", "proof_of_address", "accreditation_proof", "entity_formation", "operating_agreement", "ownership_list", "tax_form"]);

export const listOnboardingUploadsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid }).parse)
  .handler(async ({ data, context }): Promise<OnboardingUpload[]> => (await x()).listUploads(context.userId, data.onboardingId));

export const uploadOnboardingDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, kind: KIND, fileName: z.string().min(1).max(255), contentType: z.string().max(120), base64: z.string().min(1).max(21_000_000) }).parse)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => (await x()).uploadDoc(context.userId, data));

export const deleteOnboardingDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, id: uuid }).parse)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => (await x()).deleteDoc(context.userId, data.onboardingId, data.id));

export const feeStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid }).parse)
  .handler(async ({ data, context }): Promise<FeeStatus> => (await x()).feeStatus(context.userId, data.onboardingId));

export const acceptFeesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, termsId: uuid, name: z.string().trim().min(2).max(120) }).parse)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => (await x()).acceptFees(context.userId, data.onboardingId, data.termsId, data.name));

export const myInvestorUpdatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ updates: InvestorUpdate[]; funds: InvestorFundLinks[] }> => (await x()).myUpdates(context.userId));

export const fundUpdatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: uuid }).parse)
  .handler(async ({ data, context }): Promise<FundUpdateRow[]> => (await x()).fundUpdates(context.userId, data.fundId));

export const postFundUpdateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: uuid, title: z.string().trim().min(2).max(200), body: z.string().trim().min(2).max(10000) }).parse)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => (await x()).postUpdate(context.userId, data.fundId, data.title, data.body));

export const removeFundUpdateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: uuid, id: uuid }).parse)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => (await x()).removeUpdate(context.userId, data.fundId, data.id));
