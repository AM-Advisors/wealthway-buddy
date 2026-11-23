import { createFileRoute } from "@tanstack/react-router";
import logoNavy from "@/assets/logo-navy.png.asset.json";

// "This wasn't me" link from the new sign-in alert email. The opaque token is
// the only credential; it is single use and expires after 7 days.
// Opening the link (GET) only shows a confirmation page: company email
// scanners open every link, and a GET that cleared the password locked people
// out seconds after they set it. Only the button press (POST) signs out.
const page = (msg: string, status = 200, form = "") =>
  new Response(
    `<!doctype html><meta name="viewport" content="width=device-width"><title>Harmonious security</title><body style="font-family:Poppins,sans-serif;max-width:520px;margin:64px auto;padding:0 24px;color:#221F20;font-size:18px;line-height:1.5"><img src="${logoNavy.url}" alt="Harmonious" style="display:block;height:32px;width:auto;margin-bottom:8px"><h1 style="color:#142647;font-family:Rubik,sans-serif">Account security</h1><p>${msg}</p>${form}<p><a href="/auth/forgot">Reset your password</a></p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );

const validToken = (t: string) => /^[a-f0-9]{64}$/.test(t);

export async function showRevokeConfirmation(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!validToken(token)) return page("This link is not valid.", 400);
  const form = `<form method="post" action="/api/public/security/revoke"><input type="hidden" name="token" value="${token}"><button type="submit" style="font-size:18px;padding:14px 22px;border:0;border-radius:8px;background:#142647;color:#ffffff;cursor:pointer">Yes, sign me out everywhere</button></form>`;
  return page(
    "Didn't sign in yourself? Press the button below. Every session will be signed out and your password cleared, so you'll need to reset it. If this sign-in was you, close this page and nothing changes.",
    200,
    form,
  );
}

export async function performRevoke(request: Request): Promise<Response> {
  let token = "";
  try {
    const body = await request.formData();
    token = String(body.get("token") ?? "");
  } catch {
    token = "";
  }
  if (!validToken(token)) return page("This link is not valid.", 400);
  const { sha256, randomToken, recordSecurityEvent } = await import("@/lib/account-security.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await sha256(token);
  const now = new Date().toISOString();
  // Atomic single-use claim: only one request can mark the token used.
  const { data: row } = await supabaseAdmin
    .from("security_revoke_tokens")
    .update({ used_at: now })
    .eq("token_hash", hash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("user_id")
    .maybeSingle();
  if (!row) return page("This link has expired or was already used.", 410);
  await supabaseAdmin
    .from("security_session_revocations")
    .upsert({ user_id: row.user_id, revoked_after: now, reason: "user reported unrecognized sign-in", updated_at: now });
  await supabaseAdmin.auth.admin.updateUserById(row.user_id, { password: randomToken(24) });
  await supabaseAdmin.from("known_devices").update({ revoked_at: now }).eq("user_id", row.user_id);
  await recordSecurityEvent({ userId: row.user_id, eventType: "sign_out", action: "revoked via 'This wasn't me'" });
  return page("Done. Every session has been signed out and your password was cleared. Reset your password to sign in again, and contact Harmonious if you need help.");
}

export const Route = createFileRoute("/api/public/security/revoke")({
  server: {
    handlers: {
      GET: async ({ request }) => showRevokeConfirmation(request),
      POST: async ({ request }) => performRevoke(request),
    },
  },
});
