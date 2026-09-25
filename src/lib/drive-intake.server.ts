// Server-only wiring for Drive File Intake. Reads Drive (GET only) and writes
// only to Harmonious storage and records.
import type { DriveEnvironment, DriveRepository } from "@/lib/drive-policy";
import { canUseDriveIntake, repositoriesFor, type FileFacts } from "@/lib/drive-intake";
import type { DriveReadPort, IntakeStore } from "@/lib/drive-intake-core";

export const BUCKET = "drive-imports";

export function intakeEnvironment(): DriveEnvironment {
  return String(process.env["APP_ENV"] ?? "").toLowerCase() === "qa" ? "test" : "production";
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export async function logIntake(userId: string | null, event: string, outcome: string, detail: Record<string, unknown>) {
  const db = await admin();
  const { repository, drive_file_id, document_id, offering_id, investment_profile_id, ...rest } = detail as any;
  await db.from("drive_import_events").insert({
    actor_user_id: userId,
    event,
    outcome,
    repository: repository ?? null,
    drive_file_id: drive_file_id ?? null,
    document_id: document_id ?? null,
    offering_id: offering_id ?? null,
    investment_profile_id: investment_profile_id ?? null,
    // Names/ids only — never document contents.
    detail: rest,
  });
}

/** Server-side gate. Unauthorized attempts are recorded, then refused. */
export async function requireSuperAdmin(context: any, attempted: string): Promise<string> {
  const userId = context.userId as string;
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => String(r.role));
  if (!canUseDriveIntake(roles)) {
    await logIntake(userId, "unauthorized_attempt", "denied", { attempted });
    throw new Error("Forbidden: only Super Administrators can import from Google Drive.");
  }
  return userId;
}

export function allowedRepository(repo: DriveRepository) {
  if (!repositoriesFor(intakeEnvironment()).includes(repo)) throw new Error("That Drive repository is not available in this environment.");
}

const FILE_FIELDS = "id,name,mimeType,trashed,driveId,parents,size,modifiedTime,md5Checksum";

export const gatewayRead: DriveReadPort & {
  ancestors(first: any): Promise<string[]>;
  children(folderId: string): Promise<any[]>;
  search(driveId: string, text: string): Promise<any[]>;
} = {
  async ancestors(first) {
    const { call } = await import("@/lib/drive.server");
    const out: string[] = [];
    let parent: string | undefined = first.parents?.[0];
    for (let i = 0; parent && i < 15; i++) {
      out.push(parent);
      if (parent === first.driveId) break;
      const next = await call(`/drive/v3/files/${encodeURIComponent(parent)}?supportsAllDrives=true&fields=parents`).catch(() => null);
      parent = next?.parents?.[0];
    }
    return out;
  },
  async fileFacts(id) {
    const { call } = await import("@/lib/drive.server");
    const f = await call(`/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${FILE_FIELDS}`).catch((e: any) => {
      if (e?.status === 404) return null;
      throw e;
    });
    if (!f) return null;
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      trashed: f.trashed,
      driveId: f.driveId ?? null,
      ancestors: await this.ancestors(f),
      size: f.size ? Number(f.size) : null,
      modifiedTime: f.modifiedTime ?? null,
      md5Checksum: f.md5Checksum ?? null,
    } satisfies FileFacts;
  },
  async download(facts, exportMime) {
    const { GATEWAY, headers } = await import("@/lib/drive.server");
    const path = exportMime
      ? `/drive/v3/files/${encodeURIComponent(facts.id)}/export?mimeType=${encodeURIComponent(exportMime)}`
      : `/drive/v3/files/${encodeURIComponent(facts.id)}?alt=media&supportsAllDrives=true`;
    const res = await fetch(`${GATEWAY}${path}`, { method: "GET", headers: headers() });
    if (!res.ok) throw new Error(`Google Drive download failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
    return new Uint8Array(await res.arrayBuffer());
  },
  async children(folderId) {
    const { call } = await import("@/lib/drive.server");
    const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`;
    const data = await call(
      `/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=folder,name&pageSize=200&fields=${encodeURIComponent(`files(${FILE_FIELDS})`)}&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    );
    return data.files ?? [];
  },
  async search(driveId, text) {
    const { call } = await import("@/lib/drive.server");
    const q = `name contains '${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and trashed=false and mimeType != 'application/vnd.google-apps.folder'`;
    const data = await call(
      `/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=40&fields=${encodeURIComponent(`files(${FILE_FIELDS})`)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${encodeURIComponent(driveId)}`,
    );
    return data.files ?? [];
  },
};

export async function supabaseIntakeStore(userId: string): Promise<IntakeStore> {
  const db = await admin();
  return {
    async priorImports(env) {
      const { data } = await db
        .from("drive_imported_documents")
        .select("id,drive_file_id,sha256,drive_modified_at,drive_md5,version_number,offering_id,investment_profile_id")
        .eq("environment", env);
      return data ?? [];
    },
    async mappings() {
      const { data } = await db.from("drive_folder_mappings").select("id,folder_id,offering_id,investment_profile_id,entity_kind").not("folder_id", "is", null);
      return data ?? [];
    },
    async investment(offeringId, profileId, onboardingId) {
      let q = db.from("investor_onboardings").select("id").eq("offering_id", offeringId).eq("investment_profile_id", profileId);
      if (onboardingId) q = q.eq("id", onboardingId);
      const { data } = await q.limit(1);
      return data?.[0]?.id ?? null;
    },
    async putFile(path, bytes, mime) {
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw new Error(`Could not store the Harmonious copy: ${error.message}`);
    },
    async insertDocument(row) {
      const { data, error } = await db.from("drive_imported_documents").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      return data;
    },
    async insertAssociation(row) {
      const { error } = await db.from("drive_import_associations").insert(row);
      if (error && /duplicate/i.test(error.message)) return "exists";
      if (error) throw new Error(error.message);
      return "created";
    },
    async hasAssociation(docId, offeringId, profileId) {
      let q = db.from("drive_import_associations").select("id").eq("document_id", docId).eq("offering_id", offeringId);
      q = profileId ? q.eq("investment_profile_id", profileId) : q.is("investment_profile_id", null);
      const { data } = await q.limit(1);
      return Boolean(data?.length);
    },
    log: (event, outcome, detail) => logIntake(userId, event, outcome, detail),
  };
}
