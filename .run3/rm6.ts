const { fetchSessionDecision } = await import("@/lib/kyc-verification.server");
const d: any = await fetchSessionDecision("3e5ec9a6-fefe-4359-9f70-c2cf82d21eb1");
console.log("idv", d.id_verification?.status, d.id_verification?.first_name, d.id_verification?.last_name, "email", d.email?.email);
const q = d.questionnaire; console.log("q type", Array.isArray(q) ? "arr" : typeof q, JSON.stringify(q).slice(0, 300));
const key = process.env.DIDIT_API_KEY!;
const r = await fetch("https://verification.didit.me/v2/sessions/?limit=100", { headers: { "x-api-key": key } }); const j: any = await r.json();
const s = j.results.find((x: any) => x.session_id === "3e5ec9a6-fefe-4359-9f70-c2cf82d21eb1"); console.log("vd", s?.vendor_data, "internal", s?.didit_internal_id);
