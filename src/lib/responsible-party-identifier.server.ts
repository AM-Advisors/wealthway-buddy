/**
 * SS-4 Responsible Party SSN/ITIN vault. Reuses the canonical tax-ID encryption
 * (encryptTin/decryptTin, TAX_TIN_ENCRYPTION_KEY). The plaintext never returns
 * to a browser, never goes into ss4 JSON, logs, events or filenames.
 */
import { decryptTin, encryptTin } from "@/lib/irs-forms.server";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export type RpIdentifierType = "ssn" | "itin" | "ein" | "unknown";

export function normalizeRpTin(raw: string): string {
  const t = raw.replace(/\D/g, "");
  if (t.length !== 9) throw new Error("The responsible party's SSN, ITIN or EIN must be 9 digits.");
  return t;
}

export function inferRpType(t: string): RpIdentifierType {
  return t.startsWith("9") ? "itin" : "ssn";
}

/** Removes any identifier keys from SS-4 answers before they are stored or returned. */
export function stripRpTin<T extends Record<string, unknown>>(ss4: T): T {
  const { responsible_party_tin: _a, responsible_party_tin_last4: _b, ...rest } = ss4 as any;
  return rest as T;
}

export async function storeRpIdentifier(offeringId: string, raw: string, actorId: string | null, type?: RpIdentifierType) {
  const t = normalizeRpTin(raw);
  const enc = await encryptTin(t);
  const db = await admin();
  const { error } = await db.rpc("store_offering_rp_identifier", {
    _offering: offeringId, _ciphertext: enc.ciphertext, _iv: enc.iv, _key_version: enc.keyVersion,
    _type: type ?? inferRpType(t), _last4: t.slice(-4), _actor: actorId,
  });
  if (error) throw new Error("The identifier couldn't be stored securely.");
  // Verify round-trip before anyone relies on it.
  if ((await readRpIdentifierForAuthorizedOperation(offeringId)) !== t) throw new Error("Secure storage verification failed.");
}

export async function rpIdentifierMeta(offeringId: string): Promise<{ onFile: boolean; type: RpIdentifierType | null; last4: string | null }> {
  const db = await admin();
  const { data } = await db.rpc("offering_rp_identifier_meta", { _offering: offeringId }).maybeSingle();
  return data ? { onFile: true, type: data.identifier_type, last4: data.last4 } : { onFile: false, type: null, last4: null };
}

/** Server-only. Call only inside an already-authorized operation (SS-4 generation). */
export async function readRpIdentifierForAuthorizedOperation(offeringId: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db.rpc("read_offering_rp_identifier", { _offering: offeringId }).maybeSingle();
  if (!data) return null;
  return decryptTin(data.ciphertext, data.iv);
}

/**
 * Controlled move of legacy plaintext: encrypt → verify → reference → remove plaintext.
 * Returns counts only.
 */
export async function migrateLegacyRpPlaintext(): Promise<{ found: number; migrated: number; failed: number }> {
  const db = await admin();
  const { data, error } = await db.rpc("list_legacy_rp_plaintext");
  if (error) throw new Error("Legacy scan failed.");
  let migrated = 0, failed = 0;
  for (const row of (data ?? []) as { offering_id: string; tin: string }[]) {
    try {
      await storeRpIdentifier(row.offering_id, row.tin, null);
      const { data: cleared } = await db.rpc("clear_legacy_rp_plaintext", { _offering: row.offering_id });
      if (cleared !== true) throw new Error("not cleared");
      await db.from("fund_setup_events").insert({
        subject_table: "offerings", subject_id: row.offering_id, event: "rp_identifier_secured",
        detail: { summary: "Responsible party identifier moved to secure storage" }, actor_role: "system",
      });
      migrated++;
    } catch {
      failed++;
    }
  }
  return { found: (data ?? []).length, migrated, failed };
}
