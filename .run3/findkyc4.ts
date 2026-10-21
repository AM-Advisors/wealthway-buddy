const key = process.env.DIDIT_API_KEY!.trim();
const r = await fetch("https://verification.didit.me/v2/session/60327733-1d91-4cd5-b8a5-a3f1b7b89464/decision/", { headers: { "x-api-key": key, accept: "application/json" } });
const d: any = await r.json();
console.log("aml:", JSON.stringify(d.aml ?? d.aml_screenings ?? null).slice(0, 400));
console.log("keys:", Object.keys(d).join(","));
