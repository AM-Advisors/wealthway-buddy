import { createFileRoute } from "@tanstack/react-router";
import logoNavy from "@/assets/logo-navy.png.asset.json";

/** A signing link with its code cut off (copied or pasted partly). Explains instead of a bare 404. */
export const Route = createFileRoute("/api/public/sign/")({
  server: {
    handlers: {
      GET: async () => new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link incomplete | Harmonious</title>
<style>body{margin:0;font-family:Poppins,system-ui,sans-serif;background:#fff;color:#221F20}main{max-width:560px;margin:0 auto;padding:48px 24px}h1{font-family:Rubik,system-ui,sans-serif;color:#142647;font-size:28px;margin:0 0 12px}p{font-size:18px;line-height:1.5}.brand{display:block;height:36px;width:auto;margin-bottom:28px}</style></head>
<body><main><img class="brand" src="${logoNavy.url}" alt="Harmonious"><h1>This link is incomplete</h1><p>The end of the signing link is missing. Open the newest signing email and press its Sign now button, or ask the fund manager for a new link.</p></main></body></html>`,
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } },
      ),
    },
  },
});
