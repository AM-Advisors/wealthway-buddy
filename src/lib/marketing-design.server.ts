/**
 * Design Studio (C1 Brand Kit + templates, C2 editable designs). Server-only; every call re-checks roles.
 * Nothing here exports to a channel or publishes. Versions and events are append-only (DB triggers).
 */
import { STUDIO_ACCESS } from "@/lib/marketing-studio-model";
import {
  BRAND_KIT_EDITORS, DEFAULT_BRAND_KIT, brandKitProblems, buildTemplate, changeKind, isFormat,
  type BrandKit, type DesignDoc, type DesignFormat, type TemplateKey,
} from "@/lib/marketing-design-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
async function ctx(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => STUDIO_ACCESS.includes(r))) throw new Error("Only the Marketing team can use the Design Studio.");
  return { db, roles };
}
const ev = async (db: any, design_id: string, action: string, actor_id: string, note?: string | null) => {
  const { error } = await db.from("marketing_design_events").insert({ design_id, action, actor_id, note: note ?? null });
  if (error) throw new Error(error.message);
};

async function currentKit(db: any): Promise<{ kit: BrandKit; version: number }> {
  const { data } = await db.from("marketing_brand_kit_versions").select("version, kit").order("version", { ascending: false }).limit(1).maybeSingle();
  return data ? { kit: data.kit as BrandKit, version: data.version } : { kit: DEFAULT_BRAND_KIT, version: 0 };
}

export async function getBrandKit(userId: string) {
  const { db, roles } = await ctx(userId);
  const cur = await currentKit(db);
  const { data: hist } = await db.from("marketing_brand_kit_versions").select("version, note, actor_id, created_at").order("version", { ascending: false }).limit(20);
  return { ...cur, canEdit: roles.some((r) => BRAND_KIT_EDITORS.includes(r)), history: hist ?? [] };
}

export async function saveBrandKit(userId: string, kit: BrandKit, note: string | null) {
  const { db, roles } = await ctx(userId);
  if (!roles.some((r) => BRAND_KIT_EDITORS.includes(r))) throw new Error("Only a marketing manager or administrator can change the Brand Kit.");
  const p = brandKitProblems(kit);
  if (p.length) throw new Error(p.join(" "));
  const { version } = await currentKit(db);
  const { error } = await db.from("marketing_brand_kit_versions").insert({ version: version + 1, kit, note, actor_id: userId });
  if (error) throw new Error(error.message);
  return { version: version + 1 };
}

export async function designHome(userId: string) {
  const { db } = await ctx(userId);
  const since = new Date(Date.now() - 45 * 864e5).toISOString();
  const [designs, items, stories] = await Promise.all([
    db.from("marketing_designs").select("id, title, series_key, format, status, version, source_kind, updated_at, designer_id").order("updated_at", { ascending: false }).limit(100),
    db.from("marketing_content_items").select("id, series_key, article_title, topic, status, package_version").order("updated_at", { ascending: false }).limit(40),
    db.from("marketing_research_stories").select("id, headline, publisher, url, suggested_series").is("dismissed_at", null).eq("verification_status", "verified_primary").gte("retrieved_at", since).order("score", { ascending: false }).limit(40),
  ]);
  return { designs: designs.data ?? [], items: items.data ?? [], stories: stories.data ?? [] };
}

type Create = { kind: "blank" | "template" | "item" | "story" | "design"; template: TemplateKey; format: DesignFormat; source_id?: string | null; title?: string | null };

/** Creates a design linked to its source. Claims come only from the stored package/story — nothing is made up. */
export async function createDesign(userId: string, c: Create) {
  const { db } = await ctx(userId);
  if (!isFormat(c.format)) throw new Error("Unknown format.");
  const { kit } = await currentKit(db);
  let doc: DesignDoc, title = c.title?.trim() || "Untitled design", series: string | null = null;
  const row: any = { source_kind: c.kind, designer_id: userId };
  if (c.kind === "item") {
    const { data: item } = await db.from("marketing_content_items").select("id, series_key, article_title, topic").eq("id", c.source_id).single();
    if (!item) throw new Error("Calendar item not found.");
    const { data: pkg } = await db.from("marketing_content_packages").select("package").eq("item_id", item.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const P: any = pkg?.package ?? {};
    const claims = (Array.isArray(P.claims) ? P.claims : []).filter((x: any) => x?.source_url && x?.text).slice(0, 12).map((x: any) => ({ text: String(x.text), source_url: String(x.source_url) }));
    const headline = P.social_headline || P.headline || P.article?.title || item.article_title || item.topic || "";
    doc = buildTemplate(c.template, c.format, kit, { headline, claims, ...(claims[0] ? { source_url: claims[0].source_url, publisher: new URL(claims[0].source_url).hostname.replace(/^www\./, "") } : {}) });
    title = c.title?.trim() || headline || title; series = item.series_key; row.source_item_id = item.id;
  } else if (c.kind === "story") {
    const { data: s } = await db.from("marketing_research_stories").select("id, headline, publisher, url, suggested_series, verification_status").eq("id", c.source_id).single();
    if (!s) throw new Error("Story not found.");
    if (s.verification_status !== "verified_primary") throw new Error("Only verified stories can start a design.");
    doc = buildTemplate(c.template, c.format, kit, { headline: s.headline, publisher: s.publisher || new URL(s.url).hostname, source_url: s.url, claims: [{ text: s.headline, source_url: s.url }] });
    title = c.title?.trim() || s.headline; series = s.suggested_series ?? null; row.source_story_id = s.id;
  } else if (c.kind === "design") {
    const { data: d } = await db.from("marketing_designs").select("*").eq("id", c.source_id).single();
    if (!d) throw new Error("Design not found.");
    doc = d.doc; title = c.title?.trim() || `${d.title} (copy)`; series = d.series_key; row.source_template_design_id = d.id;
    row.source_item_id = d.source_item_id; row.source_story_id = d.source_story_id;
  } else {
    doc = buildTemplate(c.kind === "blank" ? "blank" : c.template, c.format, kit);
  }
  series = series ?? doc.series_key;
  doc = { ...doc, series_key: series };
  const { data, error } = await db.from("marketing_designs").insert({ ...row, title: title.slice(0, 200), series_key: series, format: doc.format, template_key: c.template, doc }).select("id").single();
  if (error) throw new Error(error.message);
  await db.from("marketing_design_versions").insert({ design_id: data.id, version: 1, doc, change_kind: "created", actor_id: userId });
  await ev(db, data.id, "created", userId, `From ${c.kind}`);
  return { id: data.id as string };
}

export async function getDesign(userId: string, id: string) {
  const { db } = await ctx(userId);
  const [{ data: d }, { data: versions }, { data: events }, kit] = await Promise.all([
    db.from("marketing_designs").select("*").eq("id", id).single(),
    db.from("marketing_design_versions").select("version, change_kind, actor_id, created_at").eq("design_id", id).order("version", { ascending: false }).limit(50),
    db.from("marketing_design_events").select("action, note, actor_id, created_at").eq("design_id", id).order("created_at", { ascending: false }).limit(50),
    currentKit(db),
  ]);
  if (!d) throw new Error("Design not found.");
  let source: any = null;
  if (d.source_item_id) source = (await db.from("marketing_content_items").select("id, article_title, status").eq("id", d.source_item_id).maybeSingle()).data;
  else if (d.source_story_id) source = (await db.from("marketing_research_stories").select("id, headline, url, publisher").eq("id", d.source_story_id).maybeSingle()).data;
  return { design: d, versions: versions ?? [], events: events ?? [], kit: kit.kit, source };
}

/** Saves a new version. Material changes (text, figures, chart data, sources) reset any review back to draft. */
export async function saveDesign(userId: string, id: string, doc: DesignDoc, title: string, baseVersion: number) {
  const { db } = await ctx(userId);
  const { data: d } = await db.from("marketing_designs").select("*").eq("id", id).single();
  if (!d) throw new Error("Design not found.");
  if (d.version !== baseVersion) throw new Error("Someone else saved this design. Reload to see the latest version.");
  if (!isFormat(doc.format) || !Array.isArray(doc.pages) || !doc.pages.length || doc.pages.length > 20) throw new Error("Invalid design.");
  const kind = changeKind(d.doc, doc);
  if (kind === "none" && title === d.title) return { version: d.version, kind };
  const version = d.version + 1;
  const status = kind === "material" && d.status !== "draft" ? "draft" : d.status;
  const { error } = await db.from("marketing_design_versions").insert({ design_id: id, version, doc, change_kind: kind, actor_id: userId });
  if (error) throw new Error(error.message);
  await db.from("marketing_designs").update({ doc, title: title.slice(0, 200), format: doc.format, series_key: doc.series_key, version, status, updated_at: new Date().toISOString() }).eq("id", id).eq("version", d.version);
  if (status !== d.status) await ev(db, id, "review_reset", userId, "Text, figures or sources changed — needs review again.");
  return { version, kind };
}

export async function restoreDesignVersion(userId: string, id: string, version: number) {
  const { db } = await ctx(userId);
  const { data: v } = await db.from("marketing_design_versions").select("doc").eq("design_id", id).eq("version", version).single();
  const { data: d } = await db.from("marketing_designs").select("version, title").eq("id", id).single();
  if (!v || !d) throw new Error("Version not found.");
  const r = await saveDesign(userId, id, v.doc, d.title, d.version);
  await ev(db, id, "restored", userId, `Restored version ${version}`);
  return r;
}
