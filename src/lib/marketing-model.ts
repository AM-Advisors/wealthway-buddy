/** Marketing: pure shared model (client + server). No secrets, no I/O. */
export const MARKETING_ROLES = ["marketing_manager", "marketing_specialist"] as const;
/** May approve posts/emails (never their own). */
export const MARKETING_APPROVERS = ["marketing_manager", "executive", "super_admin", "admin"];
/** May open the Marketing section at all. */
export const MARKETING_ACCESS = [...MARKETING_ROLES, "executive", "super_admin", "admin"];

export const CHANNELS = ["linkedin", "facebook", "instagram"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = { linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram" };
export const CHANNEL_LIMIT: Record<Channel, number> = { linkedin: 3000, facebook: 63206, instagram: 2200 };

export const AUDIENCE_SOURCES = ["sales", "clients", "investors", "csv"] as const;
export type AudienceSource = (typeof AUDIENCE_SOURCES)[number];
export const SOURCE_LABEL: Record<AudienceSource, string> = { sales: "Sales contacts", clients: "Clients / fund managers", investors: "Investors", csv: "Imported list" };

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Waiting for approval", approved: "Approved", scheduled: "Scheduled", publishing: "Publishing",
  published: "Published", sending: "Sending", sent: "Sent", failed: "Failed", rejected: "Sent back",
};

export type EmailBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "image"; url: string; alt?: string }
  | { type: "button"; text: string; href: string }
  | { type: "divider" };

/** Problems that stop a post from being submitted. Server re-checks. */
export function postProblems(p: { title: string; body: string; channels: string[]; imageCount: number }): string[] {
  const out: string[] = [];
  if (!p.title.trim()) out.push("Add a title.");
  if (!p.body.trim()) out.push("Write the post text.");
  if (!p.channels.length) out.push("Pick at least one channel.");
  if (p.channels.includes("instagram") && p.imageCount === 0) out.push("Instagram posts need an image.");
  for (const c of p.channels as Channel[]) if (CHANNEL_LIMIT[c] && p.body.length > CHANNEL_LIMIT[c]) out.push(`${CHANNEL_LABEL[c]} allows ${CHANNEL_LIMIT[c]} characters.`);
  return out;
}

export function emailProblems(e: { subject: string; blocks: EmailBlock[]; audienceId: string | null }): string[] {
  const out: string[] = [];
  if (!e.subject.trim()) out.push("Add a subject line.");
  if (!e.blocks.length) out.push("Add some content.");
  if (!e.audienceId) out.push("Choose an audience.");
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeHref = (h: string) => (/^(https?:|mailto:)/i.test(h.trim()) ? h.trim() : "#");

/** Branded Harmonious email HTML. unsubscribeUrl is required for real sends. */
export function renderEmailHtml(e: { subject: string; preheader?: string | null; blocks: EmailBlock[] }, unsubscribeUrl: string): string {
  const navy = "#142647", teal = "#5DC6D1", ink = "#221F20";
  const body = e.blocks.map((b) => {
    switch (b.type) {
      case "heading": return `<h2 style="font-family:Rubik,Arial,sans-serif;color:${navy};font-size:22px;margin:24px 0 8px">${esc(b.text)}</h2>`;
      case "text": return esc(b.text).split(/\n{2,}/).map((p) => `<p style="font-family:Poppins,Arial,sans-serif;color:${ink};font-size:15px;line-height:1.6;margin:0 0 14px">${p.replace(/\n/g, "<br/>")}</p>`).join("");
      case "image": return b.url ? `<img src="${esc(b.url)}" alt="${esc(b.alt ?? "")}" style="display:block;width:100%;max-width:560px;border-radius:8px;margin:16px 0"/>` : "";
      case "button": return `<p style="margin:20px 0"><a href="${esc(safeHref(b.href))}" style="background:${navy};color:#ffffff;text-decoration:none;font-family:Poppins,Arial,sans-serif;font-size:15px;padding:12px 22px;border-radius:6px;display:inline-block">${esc(b.text)}</a></p>`;
      case "divider": return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>`;
    }
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(e.subject)}</title></head><body style="margin:0;background:#ffffff">
<span style="display:none;max-height:0;overflow:hidden">${esc(e.preheader ?? "")}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:${navy};padding:20px 28px;border-bottom:4px solid ${teal}"><span style="font-family:Rubik,Arial,sans-serif;color:#ffffff;font-size:20px;font-weight:600">Harmonious</span></td></tr>
<tr><td style="padding:24px 28px">${body}</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e5e7eb;font-family:Poppins,Arial,sans-serif;font-size:12px;color:#6b7280">Harmonious · harmonious.co<br/>You're receiving this because you're connected with Harmonious. <a href="${esc(unsubscribeUrl)}" style="color:${navy}">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function renderEmailText(e: { blocks: EmailBlock[] }, unsubscribeUrl: string): string {
  return e.blocks.map((b) => b.type === "heading" || b.type === "text" ? b.text : b.type === "button" ? `${b.text}: ${b.href}` : "").filter(Boolean).join("\n\n") + `\n\n—\nHarmonious · Unsubscribe: ${unsubscribeUrl}`;
}

/** Parse a pasted/uploaded CSV into {email, name}. First column with an @ wins. */
export function parseCsvEmails(text: string): { email: string; full_name: string | null }[] {
  const seen = new Set<string>();
  const out: { email: string; full_name: string | null }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const email = cells.find((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))?.toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const name = cells.find((c) => c && !c.includes("@")) ?? null;
    out.push({ email, full_name: name });
  }
  return out;
}
