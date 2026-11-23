import { createFileRoute } from "@tanstack/react-router";

/**
 * Sign without signing in. GET only shows a confirmation page (email scanners
 * consume nothing); POST checks the link, re-runs the signing verification and
 * opens the full signing page. Only the signing service's record counts as a signature.
 */
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | Harmonious</title>
<style>body{margin:0;font-family:Poppins,system-ui,sans-serif;background:#fff;color:#221F20}main{max-width:560px;margin:0 auto;padding:48px 24px}h1{font-family:Rubik,system-ui,sans-serif;color:#142647;font-size:28px;margin:0 0 12px}p{font-size:18px;line-height:1.5}button{margin-top:16px;width:100%;padding:18px;font-size:20px;border:0;border-radius:10px;background:#142647;color:#fff;cursor:pointer}.brand{color:#5DC6D1;font-weight:600;letter-spacing:.04em;margin-bottom:24px}</style></head>
<body><main><div class="brand">HARMONIOUS</div>${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } },
  );
}

async function load(token: string) {
  const { isTokenShape } = await import("@/lib/signing-access-link");
  if (!isTokenShape(token)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { hashToken } = await import("@/lib/signing-access-link.server");
  const { data } = await (supabaseAdmin as any).from("signing_access_links").select("*").eq("token_hash", await hashToken(token)).maybeSingle();
  return data ? { link: data, admin: supabaseAdmin as any } : null;
}

const notFound = () => page("Link not found", "<h1>This link isn't valid</h1><p>Please use the newest signing email you received, or ask the fund manager for a new link.</p>", 404);

export const Route = createFileRoute("/api/public/sign/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const found = await load(String(params.token ?? ""));
        if (!found) return notFound();
        const { linkState, LINK_STATE_MESSAGE } = await import("@/lib/signing-access-link");
        const state = linkState(found.link);
        if (state !== "active") return page("Signing link", `<h1>Signing link</h1><p>${esc(LINK_STATE_MESSAGE[state])}</p>`);
        const [{ data: doc }, { data: fund }] = await Promise.all([
          found.admin.from("offering_documents").select("title").eq("id", found.link.offering_document_id).maybeSingle(),
          found.admin.from("offerings").select("name").eq("id", found.link.offering_id).maybeSingle(),
        ]);
        return page("Review and sign", `<h1>${esc(doc?.title ?? "Your document")}</h1><p>${esc(fund?.name ?? "Your fund")} is ready for your signature. No sign-in is needed.</p>
<form method="post"><button type="submit">Review and sign</button></form><p style="font-size:15px;color:#555">The document opens on a secure signing page. When you finish, your signature is recorded automatically.</p>`);
      },
      POST: async ({ params }) => {
        const found = await load(String(params.token ?? ""));
        if (!found) return notFound();
        const { linkState, LINK_STATE_MESSAGE } = await import("@/lib/signing-access-link");
        const { link, admin } = found;
        const state = linkState(link);
        if (state !== "active") return page("Signing link", `<h1>Signing link</h1><p>${esc(LINK_STATE_MESSAGE[state])}</p>`);
        const { PORTAL_ORIGIN } = await import("@/lib/account-invite.server");
        try {
          const { openSigningSessionForLink } = await import("@/lib/document-signing.server");
          const res = await openSigningSessionForLink(admin, {
            onboardingId: link.onboarding_id, offeringDocumentId: link.offering_document_id,
            signerEmail: link.signer_email, redirectUrl: `${PORTAL_ORIGIN}/api/public/sign/done`,
          });
          const { newTabSigningUrl } = await import("@/lib/sign-window-url");
          const url = newTabSigningUrl(res.signingUrl);
          if (!url) throw new Error("no url");
          await admin.from("signing_access_links").update({ opened_at: new Date().toISOString(), open_count: (link.open_count ?? 0) + 1 }).eq("id", link.id);
          return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (/already signed|already_signed/i.test(msg)) {
            await admin.from("signing_access_links").update({ used_at: new Date().toISOString() }).eq("id", link.id);
            return page("Signed", `<h1>Already signed</h1><p>${esc(LINK_STATE_MESSAGE.used)}</p>`);
          }
          console.error("sign link open failed", msg);
          return page("Not ready yet", `<h1>This document isn't ready to sign yet</h1><p>${esc(msg || "Please try again in a few minutes.")}</p><p>If this keeps happening, reply to the email you received.</p>`, 409);
        }
      },
    },
  },
});
