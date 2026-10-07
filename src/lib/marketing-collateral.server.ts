/** Collateral Studio persistence: drafts, maker-checker approval, exported PDF storage. Server-only. */
import { brandProblems } from "@/lib/marketing-brand";
import { requireMarketing } from "@/lib/marketing.server";

const BUCKET = "marketing-assets";
const LEADERSHIP_ONLY = (roles: string[]) => roles.includes("leadership") && !roles.some((r) => r !== "leadership");

async function log(db: any, collateral_id: string, action: string, actor_id: string, note?: string | null) {
  await db.from("marketing_collateral_events").insert({ collateral_id, action, actor_id, note: note ?? null });
}
const textOf = (c: unknown) => JSON.stringify(c ?? {}).replace(/[{}"\[\]]/g, " ");

export async function listCollateral(userId: string) {
  const { db, canApprove } = await requireMarketing(userId);
  const { data } = await db.from("marketing_collateral").select("id, template, title, status, author_id, approved_by, updated_at, export_path").order("updated_at", { ascending: false }).limit(100);
  return { items: data ?? [], canApprove, userId };
}

export async function getCollateral(userId: string, id: string) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("marketing_collateral").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Collateral not found.");
  return data;
}

export async function saveCollateral(userId: string, d: { id?: string | null | undefined; template: string; title: string; content: unknown }) {
  const { db, roles } = await requireMarketing(userId);
  if (LEADERSHIP_ONLY(roles)) throw new Error("Leadership is view-only.");
  const fields = { template: d.template, title: d.title.slice(0, 200), content: d.content, updated_at: new Date().toISOString() };
  if (!d.id) {
    const { data, error } = await db.from("marketing_collateral").insert({ ...fields, author_id: userId }).select("id").single();
    if (error) throw new Error(error.message);
    await log(db, data.id, "created", userId);
    return { id: data.id as string };
  }
  const { data: cur } = await db.from("marketing_collateral").select("status").eq("id", d.id).maybeSingle();
  if (!cur) throw new Error("Collateral not found.");
  // Any edit returns it to draft so approval always covers the exact content.
  await db.from("marketing_collateral").update({ ...fields, status: "draft", approved_by: null, approved_at: null }).eq("id", d.id);
  await log(db, d.id, cur.status === "draft" ? "edited" : "edited_back_to_draft", userId);
  return { id: d.id };
}

export async function decideCollateral(userId: string, id: string, action: "submit" | "approve" | "reject", note?: string | null) {
  const { db, canApprove } = await requireMarketing(userId);
  const { data: c } = await db.from("marketing_collateral").select("*").eq("id", id).maybeSingle();
  if (!c) throw new Error("Collateral not found.");
  if (action === "submit") {
    if (c.status !== "draft" && c.status !== "rejected") throw new Error("Only drafts can be submitted.");
    const probs = brandProblems(`${c.title} ${textOf(c.content)}`);
    if (probs.length) throw new Error(probs.join(" "));
    await db.from("marketing_collateral").update({ status: "submitted" }).eq("id", id);
  } else {
    if (c.status !== "submitted") throw new Error("Only submitted collateral can be approved or sent back.");
    if (!canApprove) throw new Error("Only a Marketing Manager or leadership can approve.");
    if (c.author_id === userId && !(await (await import("@/lib/self-approval.server")).selfApprove(userId, "marketing_collateral", [id]))) throw new Error("Someone other than the author must approve.");
    await db.from("marketing_collateral").update(action === "approve" ? { status: "approved", approved_by: userId, approved_at: new Date().toISOString() } : { status: "rejected" }).eq("id", id);
  }
  await log(db, id, action === "submit" ? "submitted" : action === "approve" ? "approved" : "sent_back", userId, note);
  return { ok: true };
}

/** Stores the exported PDF for approved collateral and returns a download link. */
export async function storeExport(userId: string, id: string, base64: string) {
  const { db } = await requireMarketing(userId);
  const { data: c } = await db.from("marketing_collateral").select("status, title").eq("id", id).maybeSingle();
  if (!c) throw new Error("Collateral not found.");
  if (c.status !== "approved") throw new Error("Collateral must be approved before it's saved for sharing.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 25 * 1024 * 1024) throw new Error("Export is too large.");
  const path = `collateral/${id}/${Date.now()}.pdf`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf" });
  if (error) throw new Error(error.message);
  await db.from("marketing_collateral").update({ export_path: path }).eq("id", id);
  await log(db, id, "exported", userId);
  const { data: s } = await db.storage.from(BUCKET).createSignedUrl(path, 7 * 86400);
  return { url: s?.signedUrl ?? "" };
}
