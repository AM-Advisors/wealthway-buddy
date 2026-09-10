import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
] as const;

async function isStaff(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
}

export type SetupSow = {
  id: string;
  clientId: string;
  title: string;
  sowType: string;
  status: string;
  approvalStatus: string;
  signedBy: string | null;
  signedOn: string | null;
  offeringId: string | null;
  signed: boolean;
  reason: string | null;
};

/**
 * Clients and their statements of work, marked with whether each one is signed
 * and still free to cover a new fund. Used by the fund setup wizard.
 */
export const listFundSetupAgreements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isStaff(context))) {
      throw new Error("Forbidden: this area is for the Harmonious team.");
    }

    const [clientsRes, sowsRes] = await Promise.all([
      context.supabase.from("clients").select("id, legal_name, status").order("legal_name"),
      context.supabase
        .from("client_sows")
        .select(
          "id, client_id, title, sow_type, status, signed_by, signed_on, offering_id, approval_status",
        )
        .order("created_at", { ascending: false }),
    ]);
    if (clientsRes.error) throw new Error(clientsRes.error.message);
    if (sowsRes.error) throw new Error(sowsRes.error.message);

    const sows: SetupSow[] = ((sowsRes.data ?? []) as any[]).map((s) => {
      const isSigned = Boolean(s.signed_on) && Boolean(s.signed_by) && s.status === "active";
      const approval = (s.approval_status as string) ?? "pending";
      const approved = approval === "approved";
      const taken = Boolean(s.offering_id);
      return {
        id: s.id as string,
        clientId: s.client_id as string,
        title: s.title as string,
        sowType: s.sow_type as string,
        status: s.status as string,
        approvalStatus: approval,
        signedBy: (s.signed_by as string) ?? null,
        signedOn: (s.signed_on as string) ?? null,
        offeringId: (s.offering_id as string) ?? null,
        signed: isSigned && approved && !taken,
        reason: !isSigned
          ? s.status !== "active"
            ? "Not active yet"
            : "Not signed yet"
          : !approved
            ? approval === "rejected"
              ? "Rejected in review"
              : "Waiting for approval"
            : taken
              ? "Already used for another fund"
              : null,
      };
    });

    return {
      clients: ((clientsRes.data ?? []) as any[]).map((c) => ({
        id: c.id as string,
        name: c.legal_name as string,
        status: c.status as string,
      })),
      sows,
    };
  });

/** The signed statement of work behind one fund, for the fund page gate. */
export const getFundAgreement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offeringId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: offering, error } = await context.supabase
      .from("offerings")
      .select("id, name, client_id")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!offering) throw new Error("Fund not found.");

    const { data: sowRow } = await context.supabase
      .from("client_sows")
      .select("id, client_id, title, sow_type, status, signed_by, signed_on, approval_status")
      .eq("offering_id", data.offeringId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let clientName: string | null = null;
    const clientId = ((offering as any).client_id as string) ?? (sowRow as any)?.client_id ?? null;
    if (clientId) {
      const { data: client } = await context.supabase
        .from("clients")
        .select("legal_name")
        .eq("id", clientId)
        .maybeSingle();
      clientName = ((client as any)?.legal_name as string) ?? null;
    }

    const sow = sowRow as any;
    const approvalStatus = (sow?.approval_status as string) ?? "pending";
    const signed =
      Boolean(sow) &&
      sow.status === "active" &&
      Boolean(sow.signed_on) &&
      Boolean(sow.signed_by) &&
      approvalStatus === "approved";

    return {
      canSee: await isStaff(context).catch(() => false),
      clientId,
      clientName,
      signed,
      sow: sow
        ? {
            id: sow.id as string,
            title: sow.title as string,
            sowType: sow.sow_type as string,
            status: sow.status as string,
            approvalStatus,
            signedBy: (sow.signed_by as string) ?? null,
            signedOn: (sow.signed_on as string) ?? null,
          }
        : null,
    };
  });
