/** Browser helpers to save a recording. Page replays become one HTML file that plays on its own. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function replayHtml(events: unknown[], title: string, playerJs: string, playerCss: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>&"]/g, "")}</title><style>${playerCss}</style>
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#fff;color:#221F20}</style></head>
<body><h1 style="font-size:18px">${title.replace(/[<>&"]/g, "")}</h1><p style="font-size:13px;color:#555">Private Harmonious page replay. Typed values are hidden.</p><div id="p"></div>
<script>${playerJs.replace(/<\/script/gi, "<\\/script")}</script>
<script>var ev=${safeJson(events)};new rrwebPlayer({target:document.getElementById("p"),props:{events:ev,width:Math.min(window.innerWidth-48,1100),height:600,autoPlay:false,showController:true}});</script>
</body></html>`;
}
