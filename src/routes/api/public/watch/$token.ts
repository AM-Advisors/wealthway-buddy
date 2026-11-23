import { createFileRoute } from "@tanstack/react-router";
import logoNavy from "@/assets/logo-navy.png.asset.json";

/**
 * Watch a shared screen video. GET only shows the name/email form (email scanners
 * count as nothing); POST checks the link, saves who watched, and shows the video.
 */
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200, wide = false) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | Harmonious</title>
<style>body{margin:0;font-family:Poppins,system-ui,sans-serif;background:#fff;color:#221F20}main{max-width:${wide ? "1100px" : "560px"};margin:0 auto;padding:40px 24px}h1{font-family:Rubik,system-ui,sans-serif;color:#142647;font-size:28px;margin:0 0 12px}p{font-size:18px;line-height:1.5}label{display:block;font-size:17px;margin:18px 0 6px;font-weight:600}input{box-sizing:border-box;width:100%;padding:14px;font-size:18px;border:1px solid #c9ced8;border-radius:10px}button{margin-top:22px;width:100%;padding:18px;font-size:20px;border:0;border-radius:10px;background:#142647;color:#fff;cursor:pointer}.brand{display:block;height:36px;width:auto;margin-bottom:28px}.err{color:#142647;background:#e8f6f8;border-left:4px solid #5DC6D1;padding:10px 14px;border-radius:6px}.small{font-size:15px;color:#555}video{width:100%;border-radius:10px;background:#000}.row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}.row>video:first-child{flex:1 1 640px}.cam{flex:0 0 260px}</style></head>
<body><main><img class="brand" src="${logoNavy.url}" alt="Harmonious">${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } },
  );
}

const notFound = () => page("Link not found", "<h1>This link isn't valid</h1><p>Please check the link you were sent, or ask the person who sent it for a new one.</p>", 404);

const form = (name = "", email = "", error = "") => `<h1>Shared video</h1><p>Harmonious shared a screen video with you. Please enter your name and email to watch.</p>
${error ? `<p class="err">${esc(error)}</p>` : ""}
<form method="post"><label for="n">Your full name</label><input id="n" name="name" autocomplete="name" required maxlength="120" value="${esc(name)}">
<label for="e">Your email</label><input id="e" name="email" type="email" autocomplete="email" required maxlength="254" value="${esc(email)}">
<button type="submit">Watch video</button></form>
<p class="small">Your name, email, and the time you watch are saved and shared with Harmonious.</p>`;

async function stateOf(token: string) {
  const { linkForToken } = await import("@/lib/video-share.server");
  const link = await linkForToken(token);
  if (!link) return { link: null, blocked: notFound() };
  const { shareState, SHARE_STATE_MESSAGE } = await import("@/lib/video-share");
  const st = shareState(link);
  if (st !== "active") return { link: null, blocked: page("Shared video", `<h1>Shared video</h1><p>${esc(SHARE_STATE_MESSAGE[st])}</p>`, 410) };
  return { link, blocked: null };
}

export const Route = createFileRoute("/api/public/watch/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { blocked } = await stateOf(String(params.token ?? ""));
        return blocked ?? page("Shared video", form());
      },
      POST: async ({ params, request }) => {
        const { link, blocked } = await stateOf(String(params.token ?? ""));
        if (blocked) return blocked;
        let fd: FormData;
        try { fd = await request.formData(); } catch { return page("Shared video", form("", "", "Please enter your name and email."), 400); }
        const { checkViewer } = await import("@/lib/video-share");
        const v = checkViewer({ name: fd.get("name"), email: fd.get("email") });
        if (!v.ok) return page("Shared video", form(String(fd.get("name") ?? ""), String(fd.get("email") ?? ""), v.error), 400);
        const h = request.headers;
        const ip = (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "").slice(0, 64) || null;
        try {
          const { watchShared } = await import("@/lib/video-share.server");
          const w = await watchShared(link, { name: v.name, email: v.email, ip, userAgent: h.get("user-agent") });
          const cam = w.cameraUrl
            ? (w.cameraVideo
              ? `<div class="cam"><p class="small">Camera and microphone (follows the video)</p><video id="c" src="${esc(w.cameraUrl)}" playsinline></video></div>`
              : `<audio id="c" src="${esc(w.cameraUrl)}"></audio>`)
            : "";
          const sync = w.cameraUrl ? `<script>(function(){var s=document.getElementById('s'),c=document.getElementById('c');if(!s||!c)return;function y(){if(Math.abs(c.currentTime-s.currentTime)>0.3)c.currentTime=s.currentTime}s.addEventListener('play',function(){y();c.play().catch(function(){})});s.addEventListener('pause',function(){c.pause()});s.addEventListener('seeked',y);s.addEventListener('ratechange',function(){c.playbackRate=s.playbackRate})})();</script>` : "";
          return page("Shared video", `<h1>Shared video</h1><p class="small">Watching as ${esc(v.name)} · ${esc(v.email)}</p>
<div class="row"><video id="s" src="${esc(w.url)}" controls playsinline controlsList="nodownload"></video>${cam}</div>
<p class="small">If the video doesn't play, try Chrome. This page works for 4 hours; open the link again after that.</p>${sync}`, 200, true);
        } catch (e) {
          console.error("shared video open failed", e instanceof Error ? e.message : "");
          return page("Shared video", form(v.name, v.email, "We couldn't open the video. Please try again in a minute."), 500);
        }
      },
    },
  },
});
