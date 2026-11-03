import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

async function assertSuperAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin");
  if (error) throw new Error("Access could not be checked.");
  if (!(data ?? []).length) throw new Error("Only a Super Admin can use the sealed archive.");
  return db;
}

export const listSealedRecordsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertSuperAdmin(context.userId);
    const [r, o] = await Promise.all([
      db.from("sealed_records").select("id, label, reason, sealed_at").order("sealed_at", { ascending: false }),
      db.from("sealed_record_openings").select("sealed_record_id, reason, opened_at, opened_by").order("opened_at", { ascending: false }),
    ]);
    if (r.error || o.error) throw new Error("The sealed archive could not be loaded.");
    return ((r.data ?? []) as any[]).map((x) => ({ ...x, openings: ((o.data ?? []) as any[]).filter((y) => y.sealed_record_id === x.id) }));
  });

export const openSealedRecordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(10).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await assertSuperAdmin(context.userId);
    const { data: rec } = await db.from("sealed_records").select("id, record_table, record_id").eq("id", data.id).maybeSingle();
    if (!rec) throw new Error("Sealed record not found.");
    const { data: row } = await db.from(rec.record_table).select("file_path").eq("id", rec.record_id).maybeSingle();
    if (!row?.file_path) throw new Error("The sealed file is unavailable.");
    const { error: logErr } = await db.from("sealed_record_openings").insert({ sealed_record_id: rec.id, opened_by: context.userId, reason: data.reason });
    if (logErr) throw new Error("The opening could not be recorded, so the file was not opened.");
    const bucket = "offering-files";
    const { data: signed, error } = await db.storage.from(bucket).createSignedUrl(row.file_path, 120);
    if (error || !signed?.signedUrl) throw new Error("The sealed file could not be opened.");
    return { url: signed.signedUrl as string };
  });
