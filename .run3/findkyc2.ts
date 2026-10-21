const key = process.env.DIDIT_API_KEY!.trim();
let url: string | null = "https://verification.didit.me/v2/sessions/?limit=100";
let n = 0;
const found: any[] = [];
while (url && n < 40) {
  n++;
  const r = await fetch(url, { headers: { "x-api-key": key } });
  const j: any = await r.json();
  for (const s of j.results ?? []) {
    const t = JSON.stringify(s);
    if (/alyssa|pettit/i.test(t)) found.push({ id: s.session_id, st: s.status, at: s.created_at, n: s.full_name ?? s.vendor_data, wf: s.workflow_id });
  }
  url = j.next ?? null;
}
console.log("pages", n, "matches:", JSON.stringify(found, null, 1));
