const key = process.env.DIDIT_API_KEY!;
const r = await fetch("https://verification.didit.me/v3/sessions/?workflow_id=9bd58bf5-28aa-4575-819b-f650f8b28d72&limit=50", { headers: { "x-api-key": key } });
const j: any = await r.json(); console.log(r.status, JSON.stringify((j.results ?? []).map((s: any) => ({ id: s.session_id, st: s.status, at: s.created_at, n: s.full_name }))));
const { fetchSessionDecision } = await import("@/lib/kyc-verification.server");
const d: any = await fetchSessionDecision("3e5ec9a6-fefe-4359-9f70-c2cf82d21eb1");
console.log(Object.keys(d).filter((k) => d[k] && (Array.isArray(d[k]) ? d[k].length : true)).join(","));
