/**
 * Fictional signatures for /qa-sandbox: invented funds, investors and signers
 * shaped exactly like listSignatureCenterFn returns. Reminders mirror the live
 * rules: one per signer per day, only for the person whose turn it is.
 */
import { agreementKind, type RawItem } from "@/lib/signature-center-model";

export const QA_SIGNATURE_FNS = ["listSignatureCenterFn", "remindFileSignerFn", "sendSubscriptionSignNoticeFn", "emailFundSignatoryFn"] as const;

const ME = "qa000000-0000-4000-8000-0000000000b1";
const FUND = "qa000000-0000-4000-8000-0000000000b2";
const FUND2 = "qa000000-0000-4000-8000-0000000000b3";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export type QaSignatures = { reminded: Record<string, string> };
export const createQaSignatures = (): QaSignatures => ({ reminded: {} });

function items(role: "staff" | "manager") {
  const base = (r: RawItem, extra: Record<string, unknown>) => ({ ...r, kind: agreementKind(r.title, r.kindHint), isTest: false, managed: true, yourTurn: false, signLink: null, remind: null, lastRemindedAt: null, ...extra });
  const list = [
    base({ id: "ff:qa-sl-1", source: "fund_file", offeringId: FUND, fundName: "Fablewood Growth Fund I", title: "Side Letter: Ivy Lane Family Trust", kindHint: "sl_combined", investorName: "Ivy Lane Family Trust", onboardingId: "qa-ob-1", createdAt: daysAgo(1), executedAt: null,
      signers: [{ id: "qa-ffs-1m", name: "Dana Rowe", email: "dana.rowe@fablewood.example", userId: ME, role: "fund_signatory", order: 1, status: "signed", sentAt: daysAgo(1), signedAt: daysAgo(1) }, { id: "qa-ffs-1i", name: "Ivy Lane", email: "ivy@ivylane.example", userId: null, role: "investor", order: 2, status: "sent", sentAt: daysAgo(1), signedAt: null }] },
      { remind: { type: "file", signatureId: "qa-ffs-1i", key: "file-sign:qa-ffs-1i" } }),
    base({ id: "ff:qa-sl-2", source: "fund_file", offeringId: FUND, fundName: "Fablewood Growth Fund I", title: "Side Letter: Marlow Partners", kindHint: "sl_combined", investorName: "Marlow Partners LLC", onboardingId: "qa-ob-2", createdAt: daysAgo(0), executedAt: null,
      signers: [{ id: "qa-ffs-2m", name: "Dana Rowe", email: "dana.rowe@fablewood.example", userId: ME, role: "fund_signatory", order: 1, status: "sent", sentAt: daysAgo(0), signedAt: null }, { id: "qa-ffs-2i", name: "Theo Marlow", email: "theo@marlow.example", userId: null, role: "investor", order: 2, status: "waiting", sentAt: null, signedAt: null }] },
      { yourTurn: true, signLink: { type: "file", signatureId: "qa-ffs-2m" } }),
    base({ id: "ds:qa-sub-1", source: "subscription", offeringId: FUND, fundName: "Fablewood Growth Fund I", title: "Subscription Agreement", kindHint: "subscription_agreement", investorName: "Owen Brightwater", onboardingId: "qa-ob-3", createdAt: daysAgo(12), executedAt: null,
      signers: [{ id: "qa-dss-3i", name: "Owen Brightwater", email: "owen@brightwater.example", userId: "qa-u-3", role: "investor", order: 1, status: "viewed", sentAt: daysAgo(12), signedAt: null }, { id: "qa-dss-3m", name: "Dana Rowe", email: "dana.rowe@fablewood.example", userId: ME, role: "fund_signatory", order: 2, status: "waiting", sentAt: null, signedAt: null }] },
      { remind: { type: "investor", offeringId: FUND, onboardingId: "qa-ob-3", key: null } }),
    base({ id: "ns:qa-ob-4", source: "subscription_not_started", offeringId: FUND, fundName: "Fablewood Growth Fund I", title: "Subscription Agreement", kindHint: "subscription", investorName: "Priya Sandoval", onboardingId: "qa-ob-4", createdAt: daysAgo(3), executedAt: null,
      signers: [{ id: "qa-ob-4", name: "Priya Sandoval", email: "priya@sandoval.example", userId: "qa-u-4", role: "investor", order: 1, status: "waiting", sentAt: null, signedAt: null }] },
      { remind: { type: "investor", offeringId: FUND, onboardingId: "qa-ob-4", key: null } }),
    base({ id: "ff:qa-oa-1", source: "fund_file", offeringId: FUND, fundName: "Fablewood Growth Fund I", title: "Operating Agreement", kindHint: "operating_agreement", investorName: null, onboardingId: null, createdAt: daysAgo(30), executedAt: null,
      signers: [{ id: "qa-ffs-oa", name: "Dana Rowe", email: "dana.rowe@fablewood.example", userId: ME, role: "fund_signatory", order: 1, status: "signed", sentAt: daysAgo(30), signedAt: daysAgo(29) }] }, {}),
  ];
  if (role === "staff") list.push(
    base({ id: "ds:qa-sub-9", source: "subscription", offeringId: FUND2, fundName: "Harbor Lane Opportunity SPV", title: "Subscription Agreement", kindHint: "subscription_agreement", investorName: "Cedar Ridge Holdings", onboardingId: "qa-ob-9", createdAt: daysAgo(9), executedAt: null,
      signers: [{ id: "qa-dss-9i", name: "Cedar Ridge Holdings", email: "ops@cedarridge.example", userId: "qa-u-9", role: "investor", order: 1, status: "signed", sentAt: daysAgo(9), signedAt: daysAgo(8) }, { id: "qa-dss-9m", name: "Jordan Vale", email: "jordan@harborlane.example", userId: "qa-u-10", role: "fund_signatory", order: 2, status: "sent", sentAt: daysAgo(8), signedAt: null }] },
      { remind: { type: "countersign", offeringId: FUND2, signatureId: "qa-sub-9", key: "fund-signatory:qa-sub-9:qa-dss-9m" } }),
  );
  return list;
}

export function handleQaSignatureCall(fnName: string, data: any, role: "staff" | "manager", state: QaSignatures): unknown {
  const once = (key: string, email: string) => {
    const last = state.reminded[key];
    if (last && Date.now() - new Date(last).getTime() < 86_400_000) throw new Error("A reminder for this was already sent in the last 24 hours.");
    state.reminded[key] = new Date().toISOString();
    return { sent: true, recipientEmail: email };
  };
  switch (fnName) {
    case "listSignatureCenterFn": {
      const all = items(role).map((i: any) => ({ ...i, lastRemindedAt: i.remind?.key ? state.reminded[i.remind.key] ?? null : null }));
      const scoped = data?.offeringId ? all.filter((i) => i.offeringId === data.offeringId) : all;
      const funds = [...new Map(scoped.map((i) => [i.offeringId, { id: i.offeringId, name: i.fundName }])).values()];
      return { staff: role === "staff", managesAny: true, funds, items: scoped };
    }
    case "remindFileSignerFn": return once(`file-sign:${data.signatureId}`, "ivy@ivylane.example");
    case "emailFundSignatoryFn": return once(`fund-signatory:${data.signatureId}`, "jordan@harborlane.example");
    case "sendSubscriptionSignNoticeFn": return once(`subscription:${data.onboardingId}`, "investor@fictional.example");
  }
  throw new Error("Not modeled in the sandbox.");
}
