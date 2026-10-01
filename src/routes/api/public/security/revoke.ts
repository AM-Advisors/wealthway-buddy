import { createFileRoute } from "@tanstack/react-router";

// "This wasn't me" link from the new sign-in alert email. The opaque token is
// the only credential; it is single use and expires after 7 days.
export const Route = createFileRoute("/api/public/security/revoke")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const page = (msg: string, status = 200) =>
          new Response(
            `<!doctype html><meta name="viewport" content="width=device-width"><title>Harmonious security</title><body style="font-family:Poppins,sans-serif;max-width:520px;margin:64px auto;padding:0 24px;color:#221F20"><h1 style="color:#142647;font-family:Rubik,sans-serif">Account security</h1><p>${msg}</p><p><a href="/auth/forgot">Reset your password</a></p></body>`,
            { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
          );
        if (!/^[a-f0-9]{64}$/.test(token)) return page("This link is not valid.", 400);
        const { sha256, randomToken, recordSecurityEvent } = await import("@/lib/account-security.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256(token);
        const { data: row } = await supabaseAdmin
          .from("security_revoke_tokens")
          .select("user_id, expires_at, used_at")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!row || row.used_at || new Date(row.expires_at) < new Date())
          return page("This link has expired or was already used.", 410);
        const now = new Date().toISOString();
        await supabaseAdmin.from("security_revoke_tokens").update({ used_at: now }).eq("token_hash", hash);
        // Invalidate all current sessions and force a new password.
        await supabaseAdmin
          .from("security_session_revocations")
          .upsert({ user_id: row.user_id, revoked_after: now, reason: "user reported unrecognized sign-in", updated_at: now });
        await supabaseAdmin.auth.admin.updateUserById(row.user_id, { password: randomToken(24) });
        await supabaseAdmin.from("known_devices").update({ revoked_at: now }).eq("user_id", row.user_id);
        await recordSecurityEvent({ userId: row.user_id, eventType: "sign_out", action: "revoked via 'This wasn't me'" });
        return page("Done. Every session has been signed out and your password was cleared. Reset your password to sign in again, and contact Harmonious if you need help.");
      },
    },
  },
});
