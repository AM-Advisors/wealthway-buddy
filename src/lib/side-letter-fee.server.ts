/**
 * Paid side letters: a fund manager pays the side-letter fee for one investor whose
 * commitment is below the fund minimum; once payment is confirmed the side letter
 * document is generated and filed in the Side Letter Registry as a proposal that a
 * different staff member or fund manager approves (existing registry rule).
 */
import { sideLetterRequired } from "@/lib/investor-onboarding-model";
import { SIDE_LETTER_FEE_CENTS, sideLetterText } from "@/lib/side-letter-fee";

const db = async () => ((await import("@/integrations/supabase/client.server")).supabaseAdmin as any);

async function investorLabel(d: any, ob: any) {
  const [{ data: profile }, { data: person }] = await Promise.all([
    ob.investment_profile_id ? d.from("investment_profiles").select("legal_name").eq("id", ob.investment_profile_id).maybeSingle() : { data: null },
    ob.person_id ? d.from("persons").select("legal_first_name, legal_last_name, email").eq("id", ob.person_id).maybeSingle() : { data: null },
  ]);
  return profile?.legal_name || [person?.legal_first_name, person?.legal_last_name].filter(Boolean).join(" ") || person?.email || "Investor";
}

/** Checks the caller manages the fund and the investor really needs a side letter; never trusts the browser. */
export async function resolveSideLetterTarget(userId: string, onboardingId: string) {
  const d = await db();
  const { data: ob } = await d.from("investor_onboardings").select("id, offering_id, person_id, investment_profile_id, requested_amount_cents, accepted_amount_cents").eq("id", onboardingId).is("removed_at", null).maybeSingle();
  if (!ob) throw new Error("That investment wasn't found.");
  const [{ data: mgr }, { data: o }, { data: existing }] = await Promise.all([
    d.from("fund_managers").select("id").eq("offering_id", ob.offering_id).eq("user_id", userId).maybeSingle(),
    d.from("offerings").select("id, name, legal_entity_name, client_id, min_investment_cents").eq("id", ob.offering_id).maybeSingle(),
    d.from("side_letters").select("id").eq("onboarding_id", ob.id).not("fee_payment_id", "is", null).in("status", ["proposed", "active"]).limit(1),
  ]);
  if (!mgr) throw new Error("Only this fund's managers can order a side letter.");
  if (!o?.client_id) throw new Error("This fund isn't linked to an organization yet.");
  const commitment = Number(ob.accepted_amount_cents ?? ob.requested_amount_cents ?? 0);
  if (!sideLetterRequired(commitment, o.min_investment_cents)) throw new Error("This investor's commitment meets the fund minimum, so no side letter is needed.");
  if ((existing ?? []).length) throw new Error("A side letter has already been ordered for this investor.");
  return { clientId: o.client_id as string, offeringId: ob.offering_id as string, onboardingId: ob.id as string, commitment, minimum: Number(o.min_investment_cents) };
}

export function sideLetterItems(onboardingId: string) {
  return [{ key: "side_letter_fee", name: "Side letter (commitment below fund minimum)", cents: SIDE_LETTER_FEE_CENTS, source: "rate_card" as const, onboardingId }];
}

async function renderPdf(lines: string[]) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 740;
  const wrap = (t: string, size: number, f: any) => {
    const words = t.split(" "); const out: string[] = []; let cur = "";
    for (const w of words) { const n = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(n, size) > 500) { out.push(cur); cur = w; } else cur = n; }
    out.push(cur); return out;
  };
  lines.forEach((t, i) => {
    const f = i === 0 ? bold : font; const size = i === 0 ? 16 : 11;
    for (const l of t ? wrap(t, size, f) : [""]) {
      if (y < 60) { page = pdf.addPage([612, 792]); y = 740; }
      page.drawText(l, { x: 56, y, size, font: f }); y -= size + 6;
    }
  });
  return pdf.save();
}

/** Idempotent: one side letter per confirmed payment. Called when card payment is confirmed. */
export async function generateSideLetterForPayment(paymentId: string) {
  const d = await db();
  const { data: p } = await d.from("fund_payments").select("id, kind, status, items, created_by").eq("id", paymentId).maybeSingle();
  if (!p || p.kind !== "side_letter" || p.status !== "paid") return null;
  const { data: done } = await d.from("side_letters").select("id").eq("fee_payment_id", p.id).maybeSingle();
  if (done) return done.id as string;
  const onboardingId = (p.items ?? [])[0]?.onboardingId as string | undefined;
  if (!onboardingId) return null;
  const { data: ob } = await d.from("investor_onboardings").select("id, offering_id, person_id, investment_profile_id, requested_amount_cents, accepted_amount_cents").eq("id", onboardingId).maybeSingle();
  const { data: o } = ob ? await d.from("offerings").select("name, legal_entity_name, min_investment_cents").eq("id", ob.offering_id).maybeSingle() : { data: null };
  if (!ob || !o) return null;
  const label = await investorLabel(d, ob);
  const commitment = Number(ob.accepted_amount_cents ?? ob.requested_amount_cents ?? 0);
  const today = new Date().toISOString().slice(0, 10);
  const { data: letter, error } = await d.from("side_letters").insert({
    offering_id: ob.offering_id, onboarding_id: ob.id, person_id: ob.person_id, investor_label: label,
    status: "proposed", created_by: p.created_by, fee_payment_id: p.id,
  }).select("id").single();
  if (error) { console.error("[side letter]", error.message); return null; }
  const bytes = await renderPdf(sideLetterText({ fundName: o.legal_entity_name || o.name, investorName: label, commitmentCents: commitment, minimumCents: Number(o.min_investment_cents), date: today }));
  const path = `side-letters/${ob.offering_id}/${letter.id}.pdf`;
  const up = await d.storage.from("offering-files").upload(path, new Blob([bytes as BlobPart], { type: "application/pdf" }), { contentType: "application/pdf", upsert: false });
  if (up.error) console.error("[side letter pdf]", up.error.message);
  await d.from("side_letters").update({ document_reference: up.error ? null : path }).eq("id", letter.id);
  const snapshot = {
    investorLabel: label, mfnEnabled: false, mfnScope: null, effectiveDate: today, expiryDate: null, renewalNote: null,
    documentReference: up.error ? null : path,
    terms: [{ id: "minimum", category: "other", description: `Fund minimum of $${(Number(o.min_investment_cents) / 100).toLocaleString("en-US")} waived; commitment of $${(commitment / 100).toLocaleString("en-US")} accepted.`, value: null, applicability: null }],
  };
  const { data: req } = await d.from("side_letter_change_requests").insert({
    side_letter_id: letter.id, offering_id: ob.offering_id, kind: "create", before_snapshot: null, after_snapshot: snapshot,
    reason: "Commitment below the fund minimum; side-letter fee paid.", proposed_by: p.created_by, proposer_kind: "manager",
  }).select("id").single();
  await d.from("side_letter_events").insert({ offering_id: ob.offering_id, side_letter_id: letter.id, event: "proposed_create", actor_id: p.created_by, detail: { change_request_id: req?.id ?? null, fee_payment_id: p.id } });
  await d.from("fund_payments").update({ status: "used", used_for: letter.id, used_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", p.id).eq("status", "paid");
  await d.from("fund_payment_events").insert({ payment_id: p.id, event_kind: "used", actor_id: p.created_by, detail: { side_letter_id: letter.id } });
  return letter.id as string;
}

/** Fund manager view: investors below the minimum and the state of their side letter. */
export async function listSideLetterNeeds(userId: string, offeringId: string) {
  const d = await db();
  const { data: mgr } = await d.from("fund_managers").select("id").eq("offering_id", offeringId).eq("user_id", userId).maybeSingle();
  if (!mgr) throw new Error("Only this fund's managers can see this.");
  const { data: o } = await d.from("offerings").select("min_investment_cents").eq("id", offeringId).maybeSingle();
  const min = Number(o?.min_investment_cents ?? 0);
  if (!min) return { minimumCents: 0, feeCents: SIDE_LETTER_FEE_CENTS, investors: [] };
  const { data: obs } = await d.from("investor_onboardings").select("id, person_id, investment_profile_id, requested_amount_cents, accepted_amount_cents").eq("offering_id", offeringId).is("removed_at", null);
  const below = ((obs ?? []) as any[]).filter((r) => sideLetterRequired(Number(r.accepted_amount_cents ?? r.requested_amount_cents ?? 0), min));
  const { data: letters } = below.length ? await d.from("side_letters").select("id, onboarding_id, status, document_reference").in("onboarding_id", below.map((r) => r.id)).not("fee_payment_id", "is", null) : { data: [] };
  const investors = [];
  for (const r of below) {
    const l = ((letters ?? []) as any[]).find((x) => x.onboarding_id === r.id && x.status !== "declined");
    investors.push({ onboardingId: r.id as string, name: await investorLabel(d, r), commitmentCents: Number(r.accepted_amount_cents ?? r.requested_amount_cents), sideLetter: l ? { id: l.id as string, status: l.status as string, hasDocument: Boolean(l.document_reference) } : null });
  }
  return { minimumCents: min, feeCents: SIDE_LETTER_FEE_CENTS, investors };
}

export async function sideLetterDocumentUrl(userId: string, sideLetterId: string) {
  const d = await db();
  const { data: l } = await d.from("side_letters").select("offering_id, document_reference").eq("id", sideLetterId).maybeSingle();
  if (!l?.document_reference) throw new Error("No side letter document is stored yet.");
  const { data: mgr } = await d.from("fund_managers").select("id").eq("offering_id", l.offering_id).eq("user_id", userId).maybeSingle();
  const { data: roles } = await d.from("user_roles").select("role").eq("user_id", userId);
  const staff = ((roles ?? []) as any[]).some((r) => ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"].includes(r.role));
  if (!mgr && !staff) throw new Error("You can't open this side letter.");
  const { data, error } = await d.storage.from("offering-files").createSignedUrl(l.document_reference, 300);
  if (error || !data) throw new Error("Couldn't open the side letter.");
  return { url: data.signedUrl as string };
}
