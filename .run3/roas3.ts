const A = "fcf83359-0486-402d-83b4-fd5484fb663d";
const F = "acb8193f-35fc-41cc-9ee5-629bde3e11b2";
const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server") as any;
const { createInvestor } = await import("@/lib/investor-record.server");
async function answers(session: string) {
  const { data } = await db.from("didit_webhook_events").select("payload, received_at").eq("session_id", session).order("received_at", { ascending: false });
  const p = data.find((r: any) => r.payload?.decision?.questionnaire_responses?.length)?.payload;
  const m: Record<string, any> = {};
  for (const q of p.decision.questionnaire_responses) for (const s of q.sections) for (const i of s.items) m[i.title.trim()] = i.answer?.value ?? i.answer;
  return m;
}
const people = [
  { sessions: ["a4807639-c3f7-4632-833e-ccc25502a28d"], first: "Kiran", middle: "Kumar Satyasri", last: "Varanasi", type: "individual", legal: "Kiran Kumar Satyasri Varanasi" },
  { sessions: ["00d5655c-e758-4e61-88fa-f7307d476d97", "ef9f954f-93de-44c0-9997-191f4bc5d8a5"], first: "Michael", middle: "F.", last: "Monju", type: "ira", legal: "Charles Schwab & Co Cust FBO Michael F. Monju (Rollover IRA)" },
];
const out: any[] = [];
for (const p of people) {
  const a = await answers(p.sessions[0]);
  const addr = a["Subscriber's Address of residence"] ?? {};
  const amt = Math.round(Number(String(a["Subscription Amount"]).replace(/[^\d.]/g, "")) * 100);
  const ph = a["Phone"]; const tin = String(a["Taxpayer Identification Number or Social Security Number"] ?? "").replace(/\D/g, "");
  const r = await createInvestor(A, {
    offeringId: F, confirmedNew: true, source: "staff" as any,
    person: { firstName: p.first, middleName: p.middle, lastName: p.last, email: String(a["Email"]).toLowerCase(), phone: ph?.number ? `+${ph.callingCode}${ph.number}` : null,
      addressLine1: addr.street || null, city: addr.city || null, region: addr.state === "Texas" ? "TX" : addr.state || null, postalCode: addr.postalCode || null, country: "US" },
    profile: { type: p.type, legalName: p.legal, details: {} },
    investment: { commitmentCents: amt, internalNotes: `Added from ROAS Didit flow questionnaire (sessions ${p.sessions.join(", ")}); approved by Alyssa Pettit.` },
    taxId: tin.length === 9 ? tin : null,
  } as any);
  for (const s of p.sessions) {
    const e = await db.from("source_reconciliation_decisions").insert({ source: "didit", source_ref: `session:${s}`, decision: "confirm_match", proposed_person_id: r.personId,
      reason: `Session questionnaire name and email match ${p.first} ${p.last}; linked to ROAS Hedge LP investor on Alyssa Pettit's instruction.`, actor_user_id: A });
    if (e.error) throw e.error;
  }
  out.push({ name: p.legal, commitment: amt / 100, tinStored: tin.length === 9, ...r });
}
console.log(JSON.stringify(out, null, 1));
