import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Everyone signing in accepts the current privacy notice, terms of use,
 *  fee schedule and electronic-records consent before using the platform. */

export const POLICY_KINDS = [
  { key: "privacy", label: "Privacy notice" },
  { key: "terms", label: "Platform terms of use" },
  { key: "pricing", label: "Fee schedule" },
  { key: "e_records", label: "Electronic records and signatures consent" },
] as const;

async function isSuperAdmin(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  return ((data ?? []) as any[]).some((r) => ["super_admin", "admin"].includes(String(r.role)));
}

/** Current published version of each policy, plus whatever this person still owes. */
export const getPolicyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: docs } = await context.supabase
      .from("policy_documents")
      .select("id, kind, title, body, version, effective_date")
      .eq("published", true)
      .order("version", { ascending: false });

    const current = new Map<string, any>();
    for (const doc of (docs ?? []) as any[]) {
      if (!current.has(doc.kind)) current.set(doc.kind, doc);
    }

    const { data: accepted } = await context.supabase
      .from("policy_acceptances")
      .select("document_id, kind, version, accepted_at")
      .eq("user_id", context.userId);

    const acceptedIds = new Set(((accepted ?? []) as any[]).map((a) => a.document_id));
    const documents = [...current.values()].sort(
      (a, b) =>
        POLICY_KINDS.findIndex((k) => k.key === a.kind) - POLICY_KINDS.findIndex((k) => k.key === b.kind),
    );

    return {
      outstanding: documents.filter((d) => !acceptedIds.has(d.id)),
      accepted: (accepted ?? []) as any[],
      email: (context.claims?.email as string | undefined) ?? "",
    };
  });

export const acceptPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ documentIds: z.array(z.string().uuid()).min(1), signerName: z.string().min(2).max(200) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: docs } = await context.supabase
      .from("policy_documents")
      .select("id, kind, version")
      .in("id", data.documentIds)
      .eq("published", true);

    const list = (docs ?? []) as any[];
    if (list.length !== data.documentIds.length) {
      throw new Error("Those documents are no longer current. Reload the page and try again.");
    }

    const ip =
      getRequestHeader("cf-connecting-ip") ||
      (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
      null;
    const agent = getRequestHeader("user-agent") ?? null;

    const rows = list.map((doc) => ({
      user_id: context.userId,
      document_id: doc.id,
      kind: doc.kind,
      version: doc.version,
      signer_name: data.signerName.trim(),
      email: (context.claims?.email as string | undefined) ?? null,
      ip_address: ip,
      user_agent: agent,
    }));

    const { error } = await context.supabase
      .from("policy_acceptances")
      .upsert(rows, { onConflict: "user_id,document_id" });
    if (error) throw new Error(error.message);

    return { accepted: rows.length };
  });

/* ------------------------------------------------------------- super admin */

export const listPolicyDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const canManage = await isSuperAdmin(context);
    const { data } = await context.supabase
      .from("policy_documents")
      .select("*")
      .order("kind", { ascending: true })
      .order("version", { ascending: false });
    return { canManage, documents: (data ?? []) as any[] };
  });

export const savePolicyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        kind: z.enum(["privacy", "terms", "pricing", "e_records"]),
        title: z.string().min(2).max(200),
        body: z.string().min(10).max(50000),
        effectiveDate: z.string().min(10),
        newVersion: z.boolean().optional(),
        publish: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isSuperAdmin(context))) {
      throw new Error("Forbidden: policy documents are managed by super admins.");
    }

    if (data.id && !data.newVersion) {
      const { error } = await context.supabase
        .from("policy_documents")
        .update({
          title: data.title,
          body: data.body,
          effective_date: data.effectiveDate,
          published: data.publish ?? true,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, republished: false };
    }

    const { data: latest } = await context.supabase
      .from("policy_documents")
      .select("version")
      .eq("kind", data.kind)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const version = Number((latest as any)?.version ?? 0) + 1;
    const { error } = await context.supabase.from("policy_documents").insert({
      kind: data.kind,
      title: data.title,
      body: data.body,
      version,
      effective_date: data.effectiveDate,
      published: data.publish ?? true,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);

    if (data.publish ?? true) {
      await context.supabase
        .from("policy_documents")
        .update({ published: false })
        .eq("kind", data.kind)
        .neq("version", version);
    }

    return { ok: true, republished: true, version };
  });

export const listPolicyAcceptances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isSuperAdmin(context))) {
      throw new Error("Forbidden: this list is for super admins.");
    }
    const { data } = await context.supabase
      .from("policy_acceptances")
      .select("*")
      .order("accepted_at", { ascending: false })
      .limit(1000);
    return { acceptances: (data ?? []) as any[] };
  });
