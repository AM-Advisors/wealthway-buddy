import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

async function authorize(context: any, write = false, accounting = false) {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error("Couldn't verify billing access.");
  const roles = (data ?? []).map((r: any) => String(r.role));
  const allowed = accounting ? roles.includes("admin") : roles.some((r: string) => ((write ? CONTRACT_ROLES : STAFF_ROLES) as readonly string[]).includes(r));
  if (!allowed) throw new Error("You don't have authority for these fee records.");
}
export const listInvoiceFeeAccounting = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ invoiceId: z.string().uuid().optional() }))
  .handler(async ({ context, data }) => {
    await authorize(context, false, !data.invoiceId);
    return (await import("./invoice-fee-accounting.server")).readFeeAccounting(context, data.invoiceId);
  });
export const assignInvoiceFeeTarget = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ lineId: z.string().uuid(), targetId: z.string().uuid(), targetKind: z.enum(["fund", "company"]), reason: z.string().trim().min(3).max(1000) }))
  .handler(async ({ context, data }) => {
    await authorize(context, true);
    return (await import("./invoice-fee-accounting.server")).linkFeeTarget(context, data);
  });

export async function previewInvoiceFeeEntryHandler({ context, data }: { context: any; data: { lineId: string; entryDate: string; category: string } }) {
  await authorize(context, false, true);
  return (await import("./invoice-fee-accounting.server")).previewFeeAccounting(context, data);
}
export const previewInvoiceFeeEntry = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ lineId: z.string().uuid(), entryDate: z.iso.date(), category: z.enum(["legal", "accounting", "audit_tax", "professional", "administration", "bank_fee", "organizational", "operating"]) }))
  .handler(previewInvoiceFeeEntryHandler);