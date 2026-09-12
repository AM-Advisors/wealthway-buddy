import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The record pack a client contact can see for their own engagement: the
 *  documents they and Harmonious have signed, and the capital account
 *  statements produced for the funds Harmonious administers for them.
 *
 *  Membership is checked as the signed-in person first; the statement read then
 *  runs with elevated rights only for the funds that belong to that client,
 *  because the statement table is otherwise limited to fund staff and the
 *  investor the statement belongs to. */
export const getClientRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const empty = { signedDocuments: [] as any[], statements: [] as any[] } as const;

    const { data: memberships } = await context.supabase
      .from("client_users")
      .select("client_id")
      .eq("user_id", context.userId);
    const clientIds = [...new Set(((memberships ?? []) as any[]).map((m) => String(m.client_id)))];
    if (clientIds.length === 0) return empty;

    const clientId =
      data.clientId && clientIds.includes(data.clientId) ? data.clientId : clientIds[0]!;

    const [{ data: sows }, { data: funds }, { data: acceptances }] = await Promise.all([
      context.supabase
        .from("client_sows")
        .select(
          "id, title, status, approval_status, client_signed_at, client_signed_name, signed_on, effective_date, document_path",
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      context.supabase.from("offerings").select("id, name").eq("client_id", clientId),
      context.supabase
        .from("policy_acceptances")
        .select("id, kind, version, accepted_at, accepted_name")
        .eq("user_id", context.userId)
        .order("accepted_at", { ascending: false }),
    ]);

    const signedDocuments = [
      ...((sows ?? []) as any[])
        .filter((s) => s.client_signed_at || s.signed_on)
        .map((s) => ({
          id: `sow-${s.id}`,
          sowId: s.id as string,
          kind: "agreement" as const,
          title: (s.title as string) ?? "Statement of work",
          signedAt: (s.client_signed_at as string) ?? (s.signed_on as string) ?? null,
          signedBy: (s.client_signed_name as string) ?? null,
          state:
            s.approval_status === "approved"
              ? "Approved by Harmonious"
              : "Awaiting Harmonious approval",
          hasFile: Boolean(s.document_path),
        })),
      ...((acceptances ?? []) as any[]).map((a) => ({
        id: `policy-${a.id}`,
        sowId: null,
        kind: "policy" as const,
        title: `${String(a.kind).replace(/_/g, " ")} (version ${a.version})`,
        signedAt: (a.accepted_at as string) ?? null,
        signedBy: (a.accepted_name as string) ?? null,
        state: "Accepted",
        hasFile: false,
      })),
    ].sort((a, b) => String(b.signedAt ?? "").localeCompare(String(a.signedAt ?? "")));

    const fundIds = ((funds ?? []) as any[]).map((f) => String(f.id));
    if (fundIds.length === 0) return { signedDocuments, statements: [] as any[] };

    const fundName = new Map(((funds ?? []) as any[]).map((f) => [String(f.id), f.name as string]));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("capital_account_statements")
      .select("id, offering_id, statement_date, version, superseded, generated_at, snapshot")
      .in("offering_id", fundIds)
      .eq("superseded", false)
      .order("statement_date", { ascending: false })
      .limit(200);

    const statements = ((rows ?? []) as any[]).map((r) => ({
      ...r,
      fundName: fundName.get(String(r.offering_id)) ?? (r.snapshot as any)?.fundName ?? null,
      investorName: ((r.snapshot as any)?.investorName as string) ?? null,
    }));

    return { signedDocuments, statements };
  });
