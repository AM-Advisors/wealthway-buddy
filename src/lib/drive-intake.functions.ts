import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
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
    const docIds = (docs ?? []).map((d: any) => d.id);
    const { data: asg } = docIds.length ? await client.from("drive_document_requirement_assignments").select("document_id, requirement_key, created_at").in("document_id", docIds).order("created_at", { ascending: false }) : { data: [] as any[] };
    const reqByDoc = new Map<string, string>();
    for (const a of (asg ?? []) as any[]) if (!reqByDoc.has(a.document_id)) reqByDoc.set(a.document_id, a.requirement_key);
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
          requirement: reqByDoc.get(d.id) && reqByDoc.get(d.id) !== "none" ? reqByDoc.get(d.id)! : null,
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

/** Assign an imported Drive document to a required fund document (append-only; latest wins). */
export const assignDriveRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    documentId: z.string().uuid(),
    requirement: z.enum(["ein_letter","wire_instructions","ppm","operating_agreement","subscription_agreement","formation_certificate","lloa","investor_information","investor_kyc_form","w9","side_letter","other","none"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    const userId = await s.requireSuperAdmin(context, "assign_requirement");
    const client = await db();
    const { data: doc } = await client.from("drive_imported_documents").select("id, offering_id").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Document not found.");
    const { error } = await client.from("drive_document_requirement_assignments").insert({ document_id: doc.id, offering_id: doc.offering_id, requirement_key: data.requirement, assigned_by: userId });
    if (error) throw new Error(error.message);
    await s.logIntake(userId, "assign_requirement", "ok", { document_id: doc.id, offering_id: doc.offering_id, requirement: data.requirement });
    return { ok: true };
  });

/** Fund documents investors receive in the offering packet. Identity, tax and bank files never go there. */
const PACKET_CATEGORY: Record<string, "ppm" | "operating_agreement" | "subscription_agreement" | "other"> = {
  ppm: "ppm",
  operating_agreement: "operating_agreement",
  subscription_agreement: "subscription_agreement",
  side_letter: "other",
  formation_certificate: "other",
};

/**
 * Copies migrated Drive documents into the fund's Offering Documents as new
 * versions awaiting review. Investors only see them after staff approve and
 * activate the version (existing explicit-activation rule). Idempotent per file.
 */
export const linkDriveDocsToPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid(), documentIds: z.array(z.string().uuid()).max(100).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    const userId = await s.requireSuperAdmin(context, "link_to_packet");
    const setup = await import("@/lib/offering-document-setup.server");
    const client = await db();
    let q = client.from("drive_imported_documents").select("id, offering_id, original_filename, storage_path, size_bytes, record_status").eq("offering_id", data.offeringId);
    if (data.documentIds?.length) q = q.in("id", data.documentIds);
    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);
    const ids = ((docs ?? []) as any[]).map((d) => d.id);
    const { data: asg } = ids.length ? await client.from("drive_document_requirement_assignments").select("document_id, requirement_key, created_at").in("document_id", ids).order("created_at", { ascending: false }) : { data: [] };
    const req = new Map<string, string>();
    for (const a of (asg ?? []) as any[]) if (!req.has(a.document_id)) req.set(a.document_id, a.requirement_key);

    const linked: string[] = [];
    const skipped: { fileName: string; reason: string }[] = [];
    for (const d of (docs ?? []) as any[]) {
      const category = PACKET_CATEGORY[req.get(d.id) ?? ""];
      if (!category) { skipped.push({ fileName: d.original_filename, reason: "Not assigned to a packet document (PPM, operating agreement, subscription, side letter, formation)." }); continue; }
      if (d.record_status === "historical") { skipped.push({ fileName: d.original_filename, reason: "Historical record, not a current document." }); continue; }
      const path = `${d.offering_id}/drive/${d.id}-${String(d.original_filename).replace(/[^\w.\-]+/g, "_")}`;
      const { data: already } = await client.from("offering_document_versions").select("id").eq("file_path", path).maybeSingle();
      if (already) { skipped.push({ fileName: d.original_filename, reason: "Already linked." }); continue; }
      const file = await client.storage.from(s.BUCKET).download(d.storage_path);
      if (file.error || !file.data) { skipped.push({ fileName: d.original_filename, reason: "Could not read the Harmonious copy." }); continue; }
      const up = await client.storage.from("offering-files").upload(path, file.data, { upsert: false, contentType: file.data.type || "application/pdf" });
      if (up.error && !/exists/i.test(up.error.message)) { skipped.push({ fileName: d.original_filename, reason: up.error.message }); continue; }
      const title = category === "other" ? String(d.original_filename).replace(/\.[^.]+$/, "") : undefined;
      const { id: documentId } = await setup.createSetupDocument(userId, { offeringId: d.offering_id, category, title });
      await setup.uploadDocumentVersion(userId, { documentId, filePath: path, fileName: d.original_filename, fileSizeBytes: Number(d.size_bytes ?? file.data.size) });
      await client.from("offering_document_versions").update({ note: "From Google Drive migration" }).eq("file_path", path);
      linked.push(d.original_filename);
    }
    await s.logIntake(userId, "link_to_packet", "ok", { offering_id: data.offeringId, linked: linked.length, skipped: skipped.length });
    return { linked, skipped };
  });

const signatureBoxSchema = z.object({
  role: z.enum(["investor", "manager", "harmonious"]),
  label: z.string().trim().min(1).max(80),
  page: z.number().int().min(1).max(500),
  dateField: z.boolean(),
});

/** Investors in a fund (Investment Profiles) a document can be filed to. Super Admin only. */
export const listDriveDocumentInvestors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    await s.requireSuperAdmin(context, "list_document_investors");
    const client = await db();
    const { data: obs } = await client.from("investor_onboardings").select("investment_profile_id").eq("offering_id", data.offeringId);
    const ids = [...new Set((obs ?? []).map((o: any) => o.investment_profile_id).filter(Boolean))];
    if (!ids.length) return { investors: [] as { id: string; label: string }[] };
    const { data: profiles } = await client.from("investment_profiles").select("id,display_label,legal_name").in("id", ids);
    return { investors: (profiles ?? []).map((p: any) => ({ id: p.id as string, label: String(p.display_label ?? p.legal_name ?? "Investor") })) };
  });

/** Record specific document details (append-only; newest row wins). */
export const setDriveDocumentDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    documentId: z.string().uuid(),
    group: z.enum(["fund_document", "tax_deliverable"]),
    kind: z.string().max(40),
    otherName: z.string().trim().max(120).nullable(),
    signatureStatus: z.enum(["signed_by_investor", "signed_all_parties", "no_signature", "template"]).nullable(),
    signatureBoxes: z.array(signatureBoxSchema).max(20),
    sharedProfileId: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    const userId = await s.requireSuperAdmin(context, "set_document_details");
    const { detailsProblems } = await import("@/lib/drive-document-details");
    const problems = detailsProblems(data as any);
    if (problems.length) throw new Error(problems[0]);
    const client = await db();
    const { data: doc } = await client.from("drive_imported_documents").select("id, offering_id, classification").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Document not found.");
    if (data.sharedProfileId) {
      if (doc.classification === "harmonious_restricted") throw new Error("Harmonious Restricted files can't be shared with an investor.");
      const { data: ob } = await client.from("investor_onboardings").select("id").eq("offering_id", doc.offering_id).eq("investment_profile_id", data.sharedProfileId).limit(1);
      if (!ob?.length) throw new Error("That investor is not in this fund.");
    }
    const isSub = data.group === "fund_document" && data.kind === "subscription_agreement";
    const { error } = await client.from("drive_document_details").insert({
      document_id: doc.id, offering_id: doc.offering_id, doc_group: data.group, doc_kind: data.kind,
      other_name: data.kind === "other" ? data.otherName : null,
      signature_status: isSub ? data.signatureStatus : null,
      signature_boxes: isSub && data.signatureStatus === "template" ? data.signatureBoxes : [],
      shared_profile_id: data.sharedProfileId, created_by: userId,
    });
    if (error) throw new Error(error.message);
    await s.logIntake(userId, "set_document_details", "ok", { document_id: doc.id, group: data.group, kind: data.kind, shared_profile_id: data.sharedProfileId });
    return { ok: true };
  });
