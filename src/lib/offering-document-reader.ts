import { appliedVersionFor } from "@/lib/offering-document-model";

export type ReadableDocument = { body: string | null; file_path: string | null; active_version: number | null };
export type ReadableVersion = { id: string; version: number; file_path: string | null; file_name: string | null; target_onboarding_id: string | null; rollout_scope: string | null };

/** Never substitute an unactivated upload or empty generated PDF for the real file. */
export function documentReadSource(doc: ReadableDocument, versions: ReadableVersion[], onboardingId: string | null, pinnedVersionId: string | null) {
  const applied = appliedVersionFor(onboardingId ?? "", doc.active_version, onboardingId ? versions.filter((v) => v.rollout_scope === "single").map((v) => ({ targetOnboardingId: v.target_onboarding_id, version: v.version })) : []);
  const version = pinnedVersionId ? versions.find((v) => v.id === pinnedVersionId) : versions.find((v) => v.version === applied.version);
  if (pinnedVersionId && !version) throw new Error("The document version for this investment could not be found.");
  if (version?.file_path) return { kind: "file" as const, path: version.file_path, filename: version.file_name ?? "document.pdf" };
  if (applied.version != null || pinnedVersionId) throw new Error("The active document file is unavailable. Please contact your fund manager.");
  if (versions.length) throw new Error("Your fund manager needs to activate a version of this document before you can read it.");
  if (doc.file_path) return { kind: "file" as const, path: doc.file_path, filename: doc.file_path.split("/").pop() ?? "document.pdf" };
  if (doc.body?.trim()) return { kind: "text" as const, body: doc.body };
  throw new Error("This document has not been uploaded yet. Please contact your fund manager.");
}