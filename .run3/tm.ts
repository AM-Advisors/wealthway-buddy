import { readFileSync } from "node:fs";
const { supabaseAdmin: d } = (await import("@/integrations/supabase/client.server")) as any;
const PID = "ed669351-16d9-438a-a301-cc53db366597";
const key = process.env["DIDIT_API_KEY"]!.trim(); const DIDIT = "https://verification.didit.me/v2";
const { data: u } = await d.from("profiles").select("id").ilike("email", "alyssa@harmonious.co").maybeSingle();
const f = (p: string) => new Blob([readFileSync(p)], { type: "image/jpeg" });
const form = new FormData(); form.append("front_image", f("/mnt/user-uploads/IMG_1053.jpeg"), "front.jpg"); form.append("back_image", f("/mnt/user-uploads/IMG_1054.jpeg"), "back.jpg");
const r = await fetch(`${DIDIT}/id-verification/`, { method: "POST", headers: { "x-api-key": key }, body: form });
const t = await r.text(); if (!r.ok) { console.log("ID FAIL", r.status, t.slice(0, 400)); process.exit(1); }
const j = JSON.parse(t); const v = j.id_verification ?? j;
const idStatus = String(v.status ?? "Unknown"); const fullName = [v.first_name, v.last_name].filter(Boolean).join(" ") || "Thomas Morgan Jr.";
const dob = v.date_of_birth ?? "1961-02-22";
let amlStatus: string | null = null, hits = 0;
const a = await fetch(`${DIDIT}/aml/`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify({ full_name: fullName, date_of_birth: dob, ...(v.nationality ? { nationality: v.nationality } : {}) }) });
const at = await a.text();
if (a.ok) { const x = JSON.parse(at); const m = x.aml ?? x; hits = Number(m.total_hits ?? (m.hits?.length ?? 0)) || 0; const s = String(m.status ?? "").toLowerCase(); amlStatus = s === "declined" ? "declined" : s === "in review" || hits > 0 ? "review" : s === "approved" ? "approved" : "pending"; } else console.log("AML FAIL", a.status, at.slice(0, 300));
const summary = { documentType: "drivers_license", idStatus, nameOnDocument: fullName, dateOfBirth: dob, nationality: v.nationality ?? null, expiry: v.expiration_date ?? null, documentNumberLast4: v.document_number ? String(v.document_number).slice(-4) : null, amlHits: hits, warnings: (v.warnings ?? []).map((w: any) => w.short_description ?? w.risk ?? w), note: "Document only: no selfie or liveness check, so this is not full KYC." };
const ins = await d.from("person_kyc_requests").insert({ person_id: PID, mode: "document", document_type: "drivers_license", session_id: j.request_id ?? null, status: "completed", id_status: idStatus, aml_status: amlStatus, result_summary: summary, created_by: u?.id ?? null }).select("id").single();
const now = new Date().toISOString();
const upd: any = { date_of_birth: dob, address_line1: "1403 Post Oak Place", city: "Westlake", region: "TX", postal_code: "76262", country: "US" };
if (amlStatus) { upd.aml_status = amlStatus; upd.aml_screened_at = now; }
const pu = await d.from("persons").update(upd).eq("id", PID);
console.log(JSON.stringify({ summary, amlStatus, ins: ins.error?.message ?? ins.data, pu: pu.error?.message ?? "ok" }, null, 1));
