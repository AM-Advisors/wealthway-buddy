const { fetchSessionDecision } = await import("@/lib/kyc-verification.server");
const d: any = await fetchSessionDecision("3e5ec9a6-fefe-4359-9f70-c2cf82d21eb1");
const { answersFromDidit } = await import("@/lib/didit-questionnaire");
const a = answersFromDidit(d.questionnaire);
console.log(JSON.stringify(Object.fromEntries(Object.entries(a).map(([k, v]) => [k.slice(0, 45), String(v).slice(0, 70)])), null, 1));
const raw: any = {}; for (const s of d.questionnaire.sections) for (const i of s.items) if (/taxpayer|phone/i.test(i.title)) raw[i.title.slice(0,20)] = typeof (i.answer?.value ?? i.answer);
console.log(JSON.stringify(raw), "wf", d.workflow_id);
