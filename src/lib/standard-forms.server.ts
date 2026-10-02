import { db, isStaff, team } from "@/lib/fund-tabs.server";

export const STANDARD_FORMS = [
  { key: "subscription_agreement", title: "Subscription Agreement" },
  { key: "operating_agreement", title: "Operating Agreement" },
  { key: "ppm", title: "Private Placement Memorandum (PPM)" },
] as const;
export type StandardFormKey = (typeof STANDARD_FORMS)[number]["key"];

export const PLACEHOLDERS = [
  "fund_name", "legal_name", "entity_type", "state_formed", "fund_type", "min_investment",
  "management_fee_pct", "management_fee_basis", "carry_pct", "hurdle_pct", "manager_name", "manager_email", "date",
] as const;

const usd = (c: number | null | undefined) => (c == null ? "" : `$${(Number(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

export async function fundKind(fundId: string) {
  const { data } = await (await db()).from("offerings").select("name, legal_entity_name, entity_type, state_formed, fund_type, min_investment_cents").eq("id", fundId).maybeSingle();
  const o = (data ?? {}) as any;
  return { offering: o, isSpv: /spv/i.test(String(o.fund_type ?? "")) };
}

async function latest() {
  const { data } = await (await db()).from("harmonious_standard_forms").select("id, form_key, version, created_at, note").order("version", { ascending: false });
  const map = new Map<string, any>();
  for (const r of (data ?? []) as any[]) if (!map.has(r.form_key)) map.set(r.form_key, r);
  return map;
}

export async function overview(uid: string, fundId: string) {
  const [{ isSpv }, map, staff] = await Promise.all([fundKind(fundId), latest(), isStaff(uid)]);
  return {
    isSpv, staff,
    forms: STANDARD_FORMS.map((f) => {
      const v = map.get(f.key);
      return { key: f.key, title: f.title, version: v?.version ?? null, updatedAt: v?.created_at ?? null };
    }),
  };
}

export async function uploadForm(uid: string, key: StandardFormKey, body: string, note: string) {
  if (!(await isStaff(uid))) throw new Error("Only Harmonious staff can update standard forms.");
  const d = await db();
  const { data: prev } = await d.from("harmonious_standard_forms").select("version").eq("form_key", key).order("version", { ascending: false }).limit(1);
  const version = (((prev ?? [])[0] as any)?.version ?? 0) + 1;
  const { error } = await d.from("harmonious_standard_forms").insert({ form_key: key, version, body, note: note || null, uploaded_by: uid });
  if (error) throw new Error("Couldn't save the form.");
  return { version };
}

export async function generate(uid: string, fundId: string, key: StandardFormKey) {
  const { offering: o, isSpv } = await fundKind(fundId);
  if (!isSpv) throw new Error("Harmonious standard forms are for SPVs. Regular funds use the ILPA templates.");
  const d = await db();
  const { data: form } = await d.from("harmonious_standard_forms").select("id, body, version").eq("form_key", key).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!form) throw new Error("Harmonious hasn't uploaded this form yet.");
  const t = await team(fundId);
  const gp = t.members.find((m: any) => m.team_role === "gp" || m.team_role === "manager");
  const fee = t.activeFee as any;
  const values: Record<string, string> = {
    fund_name: o.name ?? "", legal_name: o.legal_entity_name ?? o.name ?? "", entity_type: o.entity_type ?? "",
    state_formed: o.state_formed ?? "", fund_type: o.fund_type ?? "", min_investment: usd(o.min_investment_cents),
    management_fee_pct: fee?.management_fee_pct != null ? `${fee.management_fee_pct}%` : "",
    management_fee_basis: fee?.management_fee_basis ?? "", carry_pct: fee?.carry_pct != null ? `${fee.carry_pct}%` : "",
    hurdle_pct: fee?.hurdle_pct != null ? `${fee.hurdle_pct}%` : "",
    manager_name: gp?.full_name ?? t.signedInManagers[0]?.name ?? "", manager_email: gp?.email ?? t.signedInManagers[0]?.email ?? "",
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  };
  const missing: string[] = [];
  const body = String((form as any).body).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k: string) => {
    const v = values[k];
    if (v) return v;
    missing.push(k);
    return `[NEEDS ENTRY: ${k}]`;
  });
  const title = STANDARD_FORMS.find((f) => f.key === key)!.title;
  const { data, error } = await d.from("fund_files").insert({
    offering_id: fundId, title: `${title} - ${values["legal_name"] || values["fund_name"]}`, category: "fund_document",
    template_key: `standard:${key}`, standard_form_id: (form as any).id, body, uploaded_by: uid,
  }).select("id").single();
  if (error) throw new Error("Couldn't save the document.");
  return { id: data.id as string, missing: [...new Set(missing)] };
}
