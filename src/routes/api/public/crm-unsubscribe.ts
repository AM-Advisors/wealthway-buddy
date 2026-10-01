import { createFileRoute } from "@tanstack/react-router";

// Campaign unsubscribe. The opaque 256-bit token is the only credential.
// GET shows a confirm button (so link scanners don't unsubscribe people);
// POST records the unsubscribe on that one contact.
const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:Poppins,Helvetica,Arial,sans-serif;color:#221F20;background:#fff;display:flex;justify-content:center;padding:64px 16px}main{max-width:460px;border-top:4px solid #5DC6D1;border:1px solid #e6ecf3;padding:32px}button{background:#142647;color:#fff;border:0;padding:10px 18px;font:inherit;cursor:pointer}</style></head><body><main><h1 style="font-size:20px">${title}</h1>${body}</main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const valid = (t: string | null): t is string => !!t && /^[a-f0-9]{64}$/.test(t);

export const Route = createFileRoute("/api/public/crm-unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t");
        if (!valid(t)) return page("Link not recognised", "<p>This unsubscribe link isn't valid.</p>");
        return page("Unsubscribe", `<p>Stop receiving these emails?</p><form method="post"><input type="hidden" name="t" value="${t}"><button type="submit">Unsubscribe</button></form>`);
      },
      POST: async ({ request }) => {
        const form = await request.formData();
        const t = form.get("t");
        if (typeof t !== "string" || !valid(t)) return page("Link not recognised", "<p>This unsubscribe link isn't valid.</p>");
        const { unsubscribeByToken } = await import("@/lib/crm.server");
        const ok = await unsubscribeByToken(t);
        return ok
          ? page("You're unsubscribed", "<p>You won't receive these emails any more.</p>")
          : page("Link not recognised", "<p>This unsubscribe link isn't valid.</p>");
      },
    },
  },
});
