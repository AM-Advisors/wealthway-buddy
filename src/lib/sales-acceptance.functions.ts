import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const S = () => import("@/lib/sales-acceptance.server");
const token = z.string().min(20).max(2000);
const ip = () => getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
const noStore = () => setResponseHeader("Cache-Control", "no-store, private");

/** Optional signed-in viewer on the public link (used only to refuse staff signing for a client). */
async function optionalUser(): Promise<string | null> {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.getUser(auth.slice(7));
  return data.user?.id ?? null;
}

// Public, token-verified (HMAC link bound to record, version and recipient).
export const viewAcceptance = createServerFn({ method: "POST" }).inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => { noStore(); return (await S()).viewForToken(data.token); });

export const respondToSalesDocument = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, action: z.enum(["reviewed", "changes_requested"]), message: z.string().trim().max(5000) }).refine((d) => d.action !== "changes_requested" || d.message.length > 0, { message: "Describe the requested changes." }).parse(d))
  .handler(async ({ data }) => { noStore(); return (await S()).respondByToken({ ...data, userId: await optionalUser() }); });

export const signAcceptance = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, signerName: z.string().trim().min(2).max(160), signerTitle: z.string().max(160).optional(), agree: z.literal(true), msaAgree: z.boolean().optional(), msaVersionId: z.string().uuid().nullable().optional(), paymentMethod: z.enum(["card", "wire", "ach"]) }).parse(d))
  .handler(async ({ data }) => {
    noStore();
    return (await S()).acceptByToken({ ...data, ip: ip(), ua: getRequestHeader("user-agent") ?? null, userId: await optionalUser() });
  });

export const acceptanceRemittance = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, method: z.enum(["wire", "ach"]), reveal: z.boolean() }).parse(d))
  .handler(async ({ data }) => { noStore(); return (await S()).remittanceByToken({ ...data, ip: ip() }); });

// Signed-in client portal.
export const invoiceRemittance = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid(), method: z.enum(["wire", "ach"]), reveal: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => { noStore(); return (await S()).remittanceForInvoice(context.userId, { ...data, ip: ip() }); });

// Staff.
export const listRemittanceVersions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => { noStore(); return (await S()).listRemittance(context.userId); });
export const prepareRemittanceVersion = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    method: z.enum(["wire", "ach"]), bankName: z.string().trim().min(2).max(200), accountName: z.string().trim().min(2).max(200),
    accountNumber: z.string().trim().min(4).max(40), routingNumber: z.string().trim().min(4).max(40), swiftCode: z.string().max(20).optional(),
    bankAddress: z.string().max(400).optional(), beneficiaryAddress: z.string().max(400).optional(), referenceNote: z.string().max(400).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).prepareRemittance(context.userId, data));
export const decideRemittanceVersion = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => (await S()).decideRemittance(context.userId, data));
export const getQuoteAcceptLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await S()).quoteAcceptLink(context.userId, data.id));
