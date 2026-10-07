import { N, U, step, db } from "./lib";
const ds = await import("@/lib/distributions.server");
const d = await db();
const { data: pos } = await d.from("investor_positions").select("investor_user_id, display_name").eq("offering_id", N);
for (const p of pos ?? []) {
  const nm = p.display_name;
  const r: any = await step(`${nm}: investor submits payout destination (synthetic)`, () => ds.requestPaymentInstruction(p.investor_user_id, { investorUserId: p.investor_user_id, offeringId: N, label: "[QA] synthetic", destination: { method: "wire", beneficiaryName: nm, bankName: "[QA] Simulated Bank", accountNumber: "000000001234", routingNumber: "000000000", country: "US", currency: "USD" } }));
  const cid = r?.changeId ?? r?.id;
  await step(`${nm}: investor step-up`, () => ds.recordInstructionStepUp(p.investor_user_id, cid, "qa_synthetic_otp"));
  await step(`${nm}: destination reviewed (reviewer)`, () => ds.reviewPaymentInstruction(U.rev, cid));
  await step(`${nm}: destination verified by callback (reviewer)`, () => ds.verifyPaymentInstruction(U.rev, { changeId: cid, method: "qa_callback_known_number", independentNoticeChannel: "qa_email_on_file" }));
  await step(`${nm}: approval within cooling-off is blocked`, () => ds.approvePaymentInstruction(U.appr, { changeId: cid }), true);
  await step(`${nm}: destination approved, cooling-off waived with reason (approver)`, () => ds.approvePaymentInstruction(U.appr, { changeId: cid, waiveCoolingOff: true, waiverReason: "[QA] Synthetic run executed in one session; 24h cooling-off cannot elapse. Real funds must wait." }));
}
