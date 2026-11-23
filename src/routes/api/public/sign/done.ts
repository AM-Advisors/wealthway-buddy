import { createFileRoute } from "@tanstack/react-router";
import logoNavy from "@/assets/logo-navy.png.asset.json";

/** Where the signing service returns signers from a no-sign-in link. Display only. */
export const Route = createFileRoute("/api/public/sign/done")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Signed | Harmonious</title><style>body{margin:0;font-family:Poppins,system-ui,sans-serif;color:#221F20}main{max-width:560px;margin:0 auto;padding:48px 24px}h1{font-family:Rubik,system-ui,sans-serif;color:#142647}p{font-size:18px;line-height:1.5}</style></head><body><main><img src="${logoNavy.url}" alt="Harmonious" style="display:block;height:36px;width:auto;margin-bottom:28px"><h1>Signed. Thank you.</h1><p>Your signature is being recorded. The fund manager will be notified, and you can close this page.</p></main></body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
        ),
    },
  },
});
