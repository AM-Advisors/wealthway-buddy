/**
 * Per-user connector connection key storage. Server-only.
 * Keys are stored encrypted in public.app_user_connections, keyed by the
 * signed-in user's ID and the connector ID. Only service-role server code
 * can read or write this table.
 */
import { encryptConnectionKey, decryptConnectionKey } from "@/lib/connection-key-crypto.server";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
) {
  const db = await admin();
  const { error } = await db.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionKeyForUser(userId: string, connectorId: string): Promise<string | null> {
  const db = await admin();
  const { data, error } = await db
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  return data ? decryptConnectionKey(data.connection_key_ciphertext) : null;
}

export async function deleteConnectionKeyForUser(userId: string, connectorId: string) {
  const db = await admin();
  const { error } = await db
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw error;
}

/** Which connectors a set of users has connected (status only — never the key). */
export async function connectionStatusForUsers(userIds: string[], connectorId: string): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const db = await admin();
  const { data, error } = await db
    .from("app_user_connections")
    .select("user_id")
    .eq("connector_id", connectorId)
    .in("user_id", userIds);
  if (error) throw error;
  return new Set(((data ?? []) as any[]).map((r) => String(r.user_id)));
}
