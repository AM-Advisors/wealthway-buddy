import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import type { HelpArticleView } from "@/lib/help-articles";

const STAFF = ["admin", "super_admin", "operations", "legal", "compliance", "fund_administration", "tax", "finance", "client_success", "executive", "sales", "sales_management", "cro", "account_manager", "account_executive", "bdr", "leadership", "security_compliance_manager", "security_compliance_viewer", "compliance_reviewer", "executive_approver", "marketing_manager", "marketing_specialist", "marketing_contributor"];
const APPROVERS = ["super_admin", "admin", "operations"];

async function rolesOf(context: any): Promise<string[]> {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

async function approvals(context: any): Promise<Map<string, number>> {
  const { data, error } = await context.supabase.from("help_article_reviews").select("slug, version");
  if (error) throw new Error(error.message);
  const m = new Map<string, number>();
  for (const r of (data ?? []) as any[]) m.set(r.slug, Math.max(m.get(r.slug) ?? 0, r.version));
  return m;
}

export const listHelpArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ audience: z.enum(["client", "staff"]), workspaceKind: z.string().max(40).nullable().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ articles: HelpArticleView[]; roles: string[]; canApprove: boolean }> => {
    const { HELP_CATALOG } = await import("@/lib/help-catalog");
    const { articlesFor, clientHelpRolesFor, staffHelpRolesFor } = await import("@/lib/help-articles");
    const roles = await rolesOf(context);
    const approved = await approvals(context);
    if (data.audience === "staff") {
      if (!roles.some((r) => STAFF.includes(r))) throw new Error("Forbidden: the staff help center is for the Harmonious team.");
      return { articles: articlesFor(HELP_CATALOG, { audience: "staff", roles }, approved), roles: staffHelpRolesFor(roles), canApprove: roles.some((r) => APPROVERS.includes(r)) };
    }
    const helpRoles = clientHelpRolesFor(roles, data.workspaceKind ?? null);
    return { articles: articlesFor(HELP_CATALOG, { audience: "client", roles: helpRoles }, approved), roles: helpRoles, canApprove: false };
  });

export const approveHelpArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(120), note: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    if (!roles.some((r) => APPROVERS.includes(r))) throw new Error("Only Super Admins and Operations leads can approve help articles.");
    const { HELP_CATALOG } = await import("@/lib/help-catalog");
    const article = HELP_CATALOG.find((a) => a.slug === data.slug && a.audience === "client");
    if (!article) throw new Error("Only client articles need approval.");
    const { error } = await (context.supabase as any).from("help_article_reviews").insert({ slug: article.slug, version: article.version, approved_by: context.userId, note: data.note });
    if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });
