const { fetchSessionDecision } = await import("@/lib/kyc-verification.server");
const d: any = await fetchSessionDecision("9bd58bf5-28aa-4575-819b-f650f8b28d72");
if (!d) { console.log("none"); process.exit(0); }
const { answersFromDidit } = await import("@/lib/didit-questionnaire");
const a = answersFromDidit(d.questionnaire_responses);
console.log(JSON.stringify({ status: d.status, wf: d.workflow_id, created: d.created_at, idv: (d.id_verifications ?? []).map((v: any) => ({ s: v.status, f: v.first_name, l: v.last_name })), email: (d.email_verifications ?? [])[0]?.email, answers: Object.fromEntries(Object.entries(a).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 60)])) }, null, 1));
