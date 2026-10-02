import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const s = () => import("@/lib/investment-profile-detail.server");
const opt = (n: number) => z.string().trim().max(n).optional();
const id = z.object({ profileId: z.string().uuid() });

export const getProfileDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => id.parse(d))
  .handler(async ({ data, context }) => (await s()).profileDetail(context.userId, data.profileId) as Promise<any>);

export const saveProfileBasicsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => id.extend({
    legal_name: opt(160), phone: opt(40), address_line1: opt(160), address_line2: opt(160), city: opt(80),
    region: opt(80), postal_code: opt(20), country: opt(60), tax_id: opt(20),
    tax_id_type: z.enum(["ssn", "itin", "ein"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await s()).saveBasics(context.userId, data));

export const saveProfileFormationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => id.extend({
    legal_name: z.string().trim().min(2).max(160), entity_type: opt(80), formation_jurisdiction: opt(80),
    formation_date: opt(20), trust_type: opt(80), trust_date: opt(20),
  }).parse(d))
  .handler(async ({ data, context }) => (await s()).saveFormation(context.userId, data));

export const uploadProfileDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => id.extend({
    kind: z.enum(["formation", "accreditation"]), fileName: z.string().min(1).max(200),
    contentType: z.string().max(120), base64: z.string().max(21_000_000),
  }).parse(d))
  .handler(async ({ data, context }) => (await s()).uploadDoc(context.userId, data));

export const removeProfileDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => id.extend({ kind: z.enum(["formation", "accreditation"]), path: z.string().max(400) }).parse(d))
  .handler(async ({ data, context }) => (await s()).removeDoc(context.userId, data));

export const submitProfileAccreditationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => id.extend({ basis: z.string().trim().min(2).max(120), verification_method: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => (await s()).submitAccreditation(context.userId, data));
