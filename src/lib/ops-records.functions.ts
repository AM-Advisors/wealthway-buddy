/**
 * The calls the four Operations record pages make. Each one is authenticated,
 * validates the identifier it was given, and hands off to the server-only
 * module where the staff capability is checked again before anything is read.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idInput = z.object({ id: z.string().uuid() });
const tabInput = z.object({ id: z.string().uuid(), tab: z.string().min(1).max(40) });
const listInput = z.object({
  type: z.enum(["client", "fund", "investor", "company"]),
  search: z.string().max(80).optional(),
});

const server = () => import("@/lib/ops-records.server");

export const listOpsRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listInput.parse(data))
  .handler(async ({ context, data }) => (await server()).listRecords(context, data));

export const getOpsClientRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }) => (await server()).clientRecord(context, data));

export const getOpsClientTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tabInput.parse(data))
  .handler(async ({ context, data }) => (await server()).clientTab(context, data));

export const getOpsFundRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }) => (await server()).fundRecord(context, data));

export const getOpsFundTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tabInput.parse(data))
  .handler(async ({ context, data }) => (await server()).fundTab(context, data));

export const getOpsInvestorRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }) => (await server()).investorRecord(context, data));

export const getOpsInvestorTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tabInput.parse(data))
  .handler(async ({ context, data }) => (await server()).investorTab(context, data));

export const getOpsCompanyRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }) => (await server()).companyRecord(context, data));

export const getOpsCompanyTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tabInput.parse(data))
  .handler(async ({ context, data }) => (await server()).companyTab(context, data));
