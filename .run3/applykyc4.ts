const key = process.env.DIDIT_API_KEY!.trim();
const r = await fetch("https://verification.didit.me/v2/aml/", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": key },
  body: JSON.stringify({ full_name: "Alyssa Mcewen Pettit", date_of_birth: "1992-08-10" }),
});
const t = await r.text();
console.log(r.status, t.slice(0, 600));
