import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DRIVE_CLASSIFICATIONS, DRIVE_ID_PATTERN, REPOSITORY_LABELS } from "@/lib/drive-policy";

const repoSchema = z.enum(["fund", "investor", "test"]);
const idSchema = z.string().regex(DRIVE_ID_PATTERN);

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Whether the caller may see the Import from Google Drive action. */
export const getDriveIntakeAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { canUseDriveIntake, repositoriesFor } = await import("@/lib/drive-intake");
    const { data } = await (context as any).supabase.from("user_roles").select("role").eq("user_id", (context as any).userId);
    const allowed = canUseDriveIntake((data ?? []).map((r: any) => String(r.role)));
    if (!allowed) return { allowed: false as const, repositories: [] };
    const { intakeEnvironment } = await import("@/lib/drive-intake.server");
    const { repositoryConfig } = await import("@/lib/drive.server");
    const env = intakeEnvironment();
    const c = repositoryConfig();
    return {
      allowed: true as const,
      environment: env,
      repositories: repositoriesFor(env).map((r) => ({ key: r, label: REPOSITORY_LABELS[r], configured: Boolean(c[r]) })),
    };
  });

/** Browse or search inside one approved repository. Folders outside the root are never listed. */
export const browseDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ repository: repoSchema, folderId: idSchema.optional(), search: z.string().trim().max(100).optional(), offeringId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    const userId = await s.requireSuperAdmin(context, "browse");
    s.allowedRepository(data.repository);
    const { repositoryConfig } = await import("@/lib/drive.server");
    const { prefillFromHierarchy, sourceProblem } = await import("@/lib/drive-intake");
    const root = repositoryConfig()[data.repository];
    if (!root) throw new Error("That Drive repository is not configured yet.");
    const client = await db();
    const { data: mappings } = await client.from("drive_folder_mappings").select("id,folder_id,offering_id,investment_profile_id,entity_kind,folder_name").not("folder_id", "is", null);

    // Starting folder: explicit, else the Fund's own mapped folder in this repository, else the root.
    let folderId = data.folderId ?? null;
    if (!folderId && data.offeringId && !data.search) {
      const kind = data.repository === "fund" ? "fund" : "investor_fund";
      folderId = (mappings ?? []).find((m: any) => m.offering_id === data.offeringId && m.entity_kind === kind)?.folder_id ?? null;
    }
    folderId = folderId ?? root.rootId;

    let trail: { id: string; name: string }[] = [];
    if (folderId !== root.rootId) {
      const facts = await s.gatewayRead.fileFacts(folderId).catch(() => null);
      if (!facts || facts.mimeType !== "application/vnd.google-apps.folder" || facts.driveId !== root.driveId || !facts.ancestors.includes(root.rootId)) {
        await s.logIntake(userId, "browse", "denied", { repository: data.repository, reason: "outside_root" });
        throw new Error("That folder is outside the approved repository.");
      }
      const chain = facts.ancestors.slice(0, facts.ancestors.indexOf(root.rootId)).reverse();
      const names = await Promise.all(chain.map((id) => s.gatewayRead.fileFacts(id).then((f) => ({ id, name: f?.name ?? "Folder" })).catch(() => ({ id, name: "Folder" }))));
      trail = [...names, { id: facts.id, name: facts.name }];
    }

    const { data: prior } = await client.from("drive_imported_documents").select("id,drive_file_id").eq("environment", s.intakeEnvironment());
    const imported = new Set((prior ?? []).map((p: any) => p.drive_file_id));
    let files: any[];
    if (data.search) {
      const hits = await s.gatewayRead.search(root.driveId, data.search);
      const checked = await Promise.all(
        hits.slice(0, 40).map(async (h) => {
          const ancestors = await s.gatewayRead.ancestors(h);
          return sourceProblem({ ...h, ancestors }, data.repository, s.intakeEnvironment(), repositoryConfig()) ? null : { ...h, ancestors };
        }),
      );
      files = checked.filter(Boolean) as any[];
    } else {
      const kids = await s.gatewayRead.children(folderId);
      const ancestorsHere = [folderId, ...(trail.length ? trail.slice(0, -1).reverse().map((t) => t.id) : []), root.rootId];
      files = kids.map((k) => ({ ...k, ancestors: ancestorsHere }));
    }
    const offeringIds = [...new Set((mappings ?? []).map((m: any) => m.offering_id))];
    const { data: offerings } = offeringIds.length ? await client.from("offerings").select("id,name").in("id", offeringIds) : { data: [] };
    await s.logIntake(userId, data.search ? "search" : "browse", "ok", { repository: data.repository, results: files.length });
    return {
      trail,
      items: files.map((f) => {
        const pre = prefillFromHierarchy(f.ancestors, mappings ?? []);
        return {
          ref: f.id as string,
          name: f.name as string,
          folder: f.mimeType === "application/vnd.google-apps.folder",
          mimeType: f.mimeType as string,
          modifiedTime: (f.modifiedTime as string) ?? null,
          size: f.size ? Number(f.size) : null,
          alreadyImported: imported.has(f.id),
          prefill: { offeringId: pre.offeringId, profileId: pre.profileId, fundName: (offerings ?? []).find((o: any) => o.id === pre.offeringId)?.name ?? null },
        };
      }),
    };
  });

/** Funds and each fund's invested profiles, for the association table. */
export const getAssociationOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ investorUserId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    await s.requireSuperAdmin(context, "association_options");
    const client = await db();
    let q = client.from("investor_onboardings").select("id,offering_id,investment_profile_id,investor_user_id").not("investment_profile_id", "is", null);
    if (data.investorUserId) q = q.eq("investor_user_id", data.investorUserId);
    const [{ data: offerings }, { data: obs }] = await Promise.all([client.from("offerings").select("id,name").order("name"), q.limit(2000)]);
    const pIds = [...new Set((obs ?? []).map((o: any) => o.investment_profile_id))];
    const { data: profiles } = pIds.length ? await client.from("investment_profiles").select("id,display_label,legal_name,profile_type").in("id", pIds) : { data: [] };
    return {
      funds: (offerings ?? []).map((o: any) => ({ id: o.id, name: o.name })),
      investments: (obs ?? []).map((o: any) => {
        const p = (profiles ?? []).find((x: any) => x.id === o.investment_profile_id);
        return { onboardingId: o.id, offeringId: o.offering_id, profileId: o.investment_profile_id, label: `${p?.display_label ?? p?.legal_name ?? "Profile"} (${String(p?.profile_type ?? "").replace(/_/g, " ")})` };
      }),
    };
  });

const rowSchema = z.object({
  driveFileId: idSchema,
  repository: repoSchema,
  offeringId: z.string().uuid().nullable(),
  profileId: z.string().uuid().nullable().optional(),
  onboardingId: z.string().uuid().nullable().optional(),
  category: z.enum(["fund", "investor"]).nullable(),
  documentType: z.string().max(60).nullable(),
  classification: z.enum(DRIVE_CLASSIFICATIONS).nullable(),
  documentDate: z.string().max(10).nullable().optional(),
  recordStatus: z.enum(["historical", "active"]).nullable(),
  historicalExecuted: z.boolean().optional(),
  description: z.string().max(500).nullable().optional(),
  acknowledgeBroadSource: z.boolean().optional(),
  importAsNewVersion: z.boolean().optional(),
  addAssociationToExisting: z.boolean().optional(),
});

/** Import confirmed rows. Each row is validated and imported independently. */
export const importDriveFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rows: z.array(rowSchema).min(1).max(25) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    const userId = await s.requireSuperAdmin(context, "import");
    const { repositoryConfig } = await import("@/lib/drive.server");
    const { importOne } = await import("@/lib/drive-intake-core");
    const store = await s.supabaseIntakeStore(userId);
    await s.logIntake(userId, "files_selected", "ok", { count: data.rows.length });
    const results = [];
    for (const row of data.rows) {
      results.push(await importOne(row as any, { env: s.intakeEnvironment(), config: repositoryConfig(), userId, drive: s.gatewayRead, store }));
    }
    return { results };
  });

/** Provenance list for Super Administrators (Fund 360, Investor 360, Operations). */
export const listDriveImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid().optional(), investorUserId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: roles } = await (context as any).supabase.from("user_roles").select("role").eq("user_id", (context as any).userId);
    const { canUseDriveIntake } = await import("@/lib/drive-intake");
    if (!canUseDriveIntake((roles ?? []).map((r: any) => String(r.role)))) return { rows: [] };
    const client = await db();
    let q = client.from("drive_imported_documents").select("*").order("imported_at", { ascending: false }).limit(200);
    if (data.offeringId) q = q.eq("offering_id", data.offeringId);
    if (data.investorUserId) {
      const { data: obs } = await client.from("investor_onboardings").select("investment_profile_id").eq("investor_user_id", data.investorUserId);
      const ids = [...new Set((obs ?? []).map((o: any) => o.investment_profile_id).filter(Boolean))];
      if (!ids.length) return { rows: [] };
      q = q.in("investment_profile_id", ids);
    }
    const { data: docs } = await q;
    const users = [...new Set((docs ?? []).map((d: any) => d.imported_by))];
    const oIds = [...new Set((docs ?? []).map((d: any) => d.offering_id))];
    const pIds = [...new Set((docs ?? []).map((d: any) => d.investment_profile_id).filter(Boolean))];
    const [{ data: people }, { data: offerings }, { data: profiles }] = await Promise.all([
      users.length ? client.from("profiles").select("user_id,email,legal_name").in("user_id", users) : { data: [] },
      oIds.length ? client.from("offerings").select("id,name").in("id", oIds) : { data: [] },
      pIds.length ? client.from("investment_profiles").select("id,display_label,legal_name").in("id", pIds) : { data: [] },
    ]);
    return {
      rows: (docs ?? []).map((d: any) => {
        const who = (people ?? []).find((p: any) => p.user_id === d.imported_by);
        const p = (profiles ?? []).find((x: any) => x.id === d.investment_profile_id);
        return {
          id: d.id,
          fileName: d.original_filename,
          fundName: (offerings ?? []).find((o: any) => o.id === d.offering_id)?.name ?? "Fund",
          profileLabel: p ? p.display_label ?? p.legal_name : null,
          category: d.category,
          documentType: d.document_type,
          classification: d.classification,
          recordStatus: d.record_status,
          executionEvidence: d.execution_evidence,
          reviewState: d.review_state,
          version: d.version_number,
          repository: d.source_repository,
          importedAt: d.imported_at,
          importedBy: who?.legal_name ?? who?.email ?? "Super Administrator",
          driveModifiedAt: d.drive_modified_at,
        };
      }),
    };
  });

/** Open the Harmonious copy (or the Drive original if still inside an approved root). */
export const openDriveImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), source: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    const userId = await s.requireSuperAdmin(context, "open");
    const client = await db();
    const { data: doc } = await client.from("drive_imported_documents").select("*").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Document not found.");
    if (data.source) {
      const { repositoryConfig } = await import("@/lib/drive.server");
      const { sourceProblem } = await import("@/lib/drive-intake");
      const facts = await s.gatewayRead.fileFacts(doc.drive_file_id).catch(() => null);
      const problem = sourceProblem(facts, doc.source_repository, s.intakeEnvironment(), repositoryConfig());
      await s.logIntake(userId, "open_source", problem ? "unavailable" : "ok", { document_id: doc.id, repository: doc.source_repository, drive_file_id: doc.drive_file_id });
      if (problem) return { url: null, message: "The original is no longer available in Drive. The Harmonious copy is unaffected." };
      return { url: `https://drive.google.com/file/d/${doc.drive_file_id}/view`, message: null };
    }
    const { data: signed, error } = await client.storage.from(s.BUCKET).createSignedUrl(doc.storage_path, 120);
    if (error) throw new Error(error.message);
    await s.logIntake(userId, "preview", "ok", { document_id: doc.id, offering_id: doc.offering_id });
    return { url: signed.signedUrl as string, message: null };
  });
