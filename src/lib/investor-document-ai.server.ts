/**
 * Read an investor document (PDF or image) with AI and turn what it finds into
 * suggested updates on the investor record. Never writes the record directly;
 * Harmonious reviewers accept or reject each suggestion. Tax IDs are never extracted.
 */
import { assertOnboardingAccess, forbid } from "@/lib/investor-onboarding.server";
import { proposeUpdate } from "@/lib/investor-record.server";

type Target = { table: "persons" | "investment_profiles" | "investor_onboardings"; field: string; kind: "text" | "date" | "cents" };
const FIELDS: Record<string, Target> = {
  first_name: { table: "persons", field: "legal_first_name", kind: "text" },
  middle_name: { table: "persons", field: "legal_middle_name", kind: "text" },
  last_name: { table: "persons", field: "legal_last_name", kind: "text" },
  email: { table: "persons", field: "email", kind: "text" },
  phone: { table: "persons", field: "phone", kind: "text" },
  date_of_birth: { table: "persons", field: "date_of_birth", kind: "date" },
  citizenship_country: { table: "persons", field: "citizenship_country", kind: "text" },
  address_line1: { table: "persons", field: "address_line1", kind: "text" },
  address_line2: { table: "persons", field: "address_line2", kind: "text" },
  city: { table: "persons", field: "city", kind: "text" },
  region: { table: "persons", field: "region", kind: "text" },
  postal_code: { table: "persons", field: "postal_code", kind: "text" },
  country: { table: "persons", field: "country", kind: "text" },
  investing_entity_legal_name: { table: "investment_profiles", field: "legal_name", kind: "text" },
  commitment_amount_usd: { table: "investor_onboardings", field: "commitment_amount_cents", kind: "cents" },
  investment_date: { table: "investor_onboardings", field: "investment_date", kind: "date" },
};
const KEYS = Object.keys(FIELDS);

async function ai(content: any[]) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI isn't configured.");
  const schema = {
    type: "object", additionalProperties: false, required: ["document_kind", "summary", ...KEYS],
    properties: {
      document_kind: { type: "string" }, summary: { type: "string" },
      ...Object.fromEntries(KEYS.map((k) => [k, { type: ["string", "null"] }])),
    },
  };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra", reasoning: { effort: "low" }, store: false,
      instructions: "You read investor documents for a fund administrator (subscription agreements, W-9s, IDs, accreditation letters, entity documents, statements). Return only values clearly printed in the document; use null when absent or unclear. Dates as YYYY-MM-DD. Amounts as plain numbers in US dollars. Never return SSNs, EINs, ITINs, account or ID numbers. document_kind: short label like 'Subscription agreement'. summary: one sentence.",
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "investor_doc", strict: true, schema } },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error(`investor document AI failed [${res.status}]: ${t}`);
    if (res.status === 429) throw new Error("The AI helper is busy. Try again in a minute.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in Settings → Plans & credits.");
    throw new Error(`AI request failed [${res.status}].`);
  }
  const j: any = await res.json();
  const text = String(j?.output_text ?? (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join(""));
  try { return JSON.parse(text); } catch { throw new Error("The AI couldn't read that document."); }
}

function normalize(kind: Target["kind"], raw: string): unknown {
  const v = raw.trim();
  if (!v) return null;
  if (kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  if (kind === "cents") { const n = Number(v.replace(/[,$\s]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; }
  // Defensive: drop anything that looks like a 9-digit tax number.
  if (/\b\d{3}-?\d{2}-?\d{4}\b/.test(v)) return null;
  return v.slice(0, 300);
}

export async function readInvestorDocument(userId: string, input: { onboardingId: string; fileName: string; mimeType: string; base64: string }) {
  const { role } = await assertOnboardingAccess(userId, input.onboardingId);
  if (role !== "staff") forbid("only Harmonious can read documents with AI.");
  const name = input.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
  const isPdf = input.mimeType === "application/pdf";
  const part = isPdf
    ? { type: "input_file", filename: name.endsWith(".pdf") ? name : `${name}.pdf`, file_data: `data:application/pdf;base64,${input.base64}` }
    : { type: "input_image", image_url: `data:${input.mimeType};base64,${input.base64}` };
  const out = await ai([part, { type: "input_text", text: `File name: ${name}` }]);

  const found: { label: string; value: unknown; suggested: boolean }[] = [];
  for (const k of KEYS) {
    const raw = out?.[k];
    if (typeof raw !== "string") continue;
    const t = FIELDS[k]!;
    const value = normalize(t.kind, raw);
    if (value == null) continue;
    const r = await proposeUpdate(userId, { onboardingId: input.onboardingId, subjectTable: t.table, field: t.field, proposed: value, source: "document", sourceRef: name });
    found.push({ label: k.replace(/_/g, " "), value: t.kind === "cents" ? `$${((value as number) / 100).toLocaleString()}` : value, suggested: r.created });
  }
  return { documentKind: String(out?.document_kind ?? "Document"), summary: String(out?.summary ?? ""), found };
}
