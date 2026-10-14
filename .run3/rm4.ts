const { fetchSessionDecision } = await import("@/lib/kyc-verification.server");
const d: any = await fetchSessionDecision("3e5ec9a6-fefe-4359-9f70-c2cf82d21eb1");
const t = JSON.stringify(d); const i = t.indexOf("9bd58bf5");
console.log("wf", d.workflow_id, "idctx", i >= 0 ? t.slice(Math.max(0, i - 80), i + 40).replace(/\d{9}/g, "[num]") : "not found");
const { answersFromDidit } = await import("@/lib/didit-questionnaire");
const a = answersFromDidit(d.questionnaire_responses);
console.log(JSON.stringify(Object.fromEntries(Object.entries(a).map(([k, v]) => [k.slice(0, 45), String(v).slice(0, 70)])), null, 1));
console.log(JSON.stringify((d.id_verifications ?? []).map((v: any) => ({ s: v.status, f: v.first_name, l: v.last_name }))));
