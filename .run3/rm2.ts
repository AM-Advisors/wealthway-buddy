const key = process.env.DIDIT_API_KEY!;
const id = "9bd58bf5-28aa-4575-819b-f650f8b28d72";
for (const u of [`https://verification.didit.me/v3/session/${id}/decision/`, `https://verification.didit.me/v2/session/${id}/decision/`, `https://verification.didit.me/v3/sessions/?workflow_id=5e5e3a14-fcd5-4138-bd9a-bbc9abb4fdc9&limit=50`, `https://verification.didit.me/v2/sessions/?limit=50`]) {
  const r = await fetch(u, { headers: { "x-api-key": key, accept: "application/json" } });
  const t = await r.text();
  console.log(u.slice(30), r.status, t.length);
  if (r.ok && t.includes("session")) { try { const j = JSON.parse(t); const list = j.results ?? j.data ?? []; console.log(JSON.stringify(list.slice?.(0, 20).map((s: any) => ({ id: s.session_id, st: s.status, wf: s.workflow_id, at: s.created_at, n: s.full_name ?? s.vendor_data })))); } catch {} }
}
