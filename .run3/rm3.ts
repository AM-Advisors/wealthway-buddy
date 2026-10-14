const key = process.env.DIDIT_API_KEY!;
let url: string | null = "https://verification.didit.me/v2/sessions/?limit=100"; let n = 0;
while (url && n < 30) { n++;
  const r = await fetch(url, { headers: { "x-api-key": key } }); const j: any = await r.json();
  for (const s of j.results ?? []) { const t = JSON.stringify(s); if (/manger|9bd58bf5/i.test(t)) console.log(JSON.stringify({ id: s.session_id, st: s.status, wf: s.workflow_id, at: s.created_at, n: s.full_name, keys: Object.keys(s) })); }
  url = j.next ?? null; }
console.log("pages", n);
