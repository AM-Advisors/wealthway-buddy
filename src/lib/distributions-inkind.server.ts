/**
 * Cash, cash & shares, and share distributions on top of the canonical
 * distribution batch/line engine. Never moves money or shares: it prepares
 * sheets/files and records what people confirm they did outside Harmonious.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  proposeDistribution, distributionAuthority, distributionRole, destinationFromRow, distributionBatchRow,
} from "@/lib/distributions.server";
import { allocateShares, distributionFee, validateSetup, type DistributionKind } from "@/lib/distributions-inkind-model";
import type { DistributionType } from "@/lib/distributions-model";

const db = () => supabaseAdmin as any;
const fail = (m: string): never => { throw new Error(m); };

export type InKindSetup = {
  offeringId: string;
  kind: DistributionKind;
  distributionType: DistributionType;
  title?: string | null;
  paymentDate?: string | null;
  cashCents?: number | null;
  shareIssuer?: string | null;
  shareClass?: string | null;
  shareCount?: number | null;
  sharePriceCents?: number | null;
  shareIsPublic?: boolean | null;
  shareCustodian?: string | null;
  harmoniousFeeCents?: number | null;
  custodianCostCents?: number | null;
  feeNote?: string | null;
};

export async function setupDistribution(userId: string, input: InKindSetup) {
  await distributionAuthority(userId, input.offeringId, "prepare");
  const problems = validateSetup({ kind: input.kind, cashCents: input.cashCents, shareCount: input.shareCount, sharePriceCents: input.sharePriceCents, issuer: input.shareIssuer, custodian: input.shareCustodian });
  if (problems.length) fail(problems.join(" "));
  const shareValue = input.kind === "cash" ? 0 : Math.round(Number(input.shareCount) * Number(input.sharePriceCents));
  const declared = input.kind === "shares" ? shareValue : Math.round(Number(input.cashCents));
  const fee = distributionFee(input.kind, input);
  if (fee.needsApproval && !input.feeNote?.trim()) fail("Explain the share fee quote (public/private, custodian costs).");

  const res: any = await proposeDistribution(userId, {
    offeringId: input.offeringId,
    distributionType: input.distributionType,
    declaredAmountCents: declared,
    title: input.title ?? null,
    paymentDate: input.paymentDate ?? null,
  });
  const batchId = String(res.batchId);

  const { error: be } = await db().from("distribution_batches").update({
    distribution_kind: input.kind,
    cash_amount_cents: input.kind === "shares" ? 0 : declared,
    share_issuer: input.kind === "cash" ? null : input.shareIssuer?.trim(),
    share_class: input.kind === "cash" ? null : input.shareClass?.trim() || null,
    share_count: input.kind === "cash" ? null : Number(input.shareCount),
    share_price_cents: input.kind === "cash" ? null : Number(input.sharePriceCents),
    share_is_public: input.kind === "cash" ? null : Boolean(input.shareIsPublic),
    share_custodian: input.kind === "cash" ? null : input.shareCustodian?.trim(),
    harmonious_fee_cents: fee.harmoniousFeeCents,
    custodian_cost_cents: fee.custodianCostCents,
    fee_note: input.feeNote?.trim() || (input.kind === "cash" ? "Standard cash distribution fee" : null),
    fee_quoted_by: userId,
    fee_approved_at: fee.needsApproval ? null : new Date().toISOString(),
  }).eq("id", batchId);
  if (be) fail("Could not save the distribution details.");

  const { data: lines } = await db().from("distribution_lines").select("id, gross_cents").eq("batch_id", batchId).order("created_at");
  const list = (lines ?? []) as any[];
  const shares = input.kind === "cash"
    ? { allocations: list.map((l) => ({ key: String(l.id), shares: 0 })), unallocated: 0 }
    : allocateShares(Number(input.shareCount), list.map((l) => ({ key: String(l.id), weight: Number(l.gross_cents) })));
  const byLine = new Map(shares.allocations.map((a) => [a.key, a.shares]));
  for (const l of list) {
    const s = byLine.get(String(l.id)) ?? 0;
    await db().from("distribution_lines").update({
      cash_cents: input.kind === "shares" ? 0 : Number(l.gross_cents),
      shares_allocated: input.kind === "cash" ? null : s,
      share_value_cents: input.kind === "cash" ? null : s * Number(input.sharePriceCents),
      payment_method: input.kind === "shares" ? "in_kind" : undefined,
    }).eq("id", l.id);
  }
  return { batchId, recipients: list.length, unallocatedShares: shares.unallocated };
}

const FEE_APPROVER_ROLES = ["super_admin", "executive", "cro"];

export async function approveDistributionFee(userId: string, batchId: string) {
  const batch = await distributionBatchRow(batchId);
  const { data: roles } = await db().from("user_roles").select("role").eq("user_id", userId);
  if (!((roles ?? []) as any[]).some((r) => FEE_APPROVER_ROLES.includes(String(r.role)))) fail("Only the CEO, CRO or a Super Admin can approve a distribution fee quote.");
  if (String(batch.fee_quoted_by ?? "") === userId) fail("A different person must approve the fee you quoted.");
  if (batch.fee_approved_at) return { ok: true };
  await db().from("distribution_batches").update({ fee_approved_by: userId, fee_approved_at: new Date().toISOString() }).eq("id", batchId);
  return { ok: true };
}

async function loadSheet(batchId: string) {
  const batch = await distributionBatchRow(batchId);
  const { data: lines } = await db().from("distribution_lines").select("*").eq("batch_id", batchId).order("display_name");
  const list = (lines ?? []) as any[];
  const instrIds = [...new Set(list.map((l) => l.payment_instruction_id).filter(Boolean))];
  const { data: instr } = instrIds.length ? await db().from("investor_payment_instructions").select("*").in("id", instrIds) : { data: [] };
  const instrById = new Map(((instr ?? []) as any[]).map((i) => [String(i.id), i]));
  const { data: transfers } = await db().from("distribution_share_transfers").select("*").eq("batch_id", batchId).order("created_at");
  const totalGross = list.reduce((s, l) => s + Number(l.gross_cents ?? 0), 0);
  return { batch, list, instrById, transfers: (transfers ?? []) as any[], totalGross };
}

/** Distribution sheet for staff and that fund's managers. Account numbers masked. */
export async function distributionSheet(userId: string, batchId: string) {
  const batch = await distributionBatchRow(batchId);
  const { role } = await distributionRole(userId, String(batch.offering_id));
  if (role === "investor") fail("Only Harmonious staff and this fund's managers can see the distribution sheet.");
  const { list, instrById, transfers, totalGross } = await loadSheet(batchId);
  const latestTransfer = new Map<string, any>();
  for (const t of transfers) latestTransfer.set(String(t.distribution_line_id), t);
  return {
    batch: {
      id: String(batch.id), title: batch.title ?? null, status: String(batch.status), kind: String(batch.distribution_kind ?? "cash"),
      paymentDate: batch.payment_date ?? null, cashCents: Number(batch.cash_amount_cents ?? batch.declared_amount_cents ?? 0),
      shareIssuer: batch.share_issuer, shareClass: batch.share_class, shareCount: batch.share_count == null ? null : Number(batch.share_count),
      sharePriceCents: batch.share_price_cents == null ? null : Number(batch.share_price_cents), shareIsPublic: batch.share_is_public,
      shareCustodian: batch.share_custodian, harmoniousFeeCents: Number(batch.harmonious_fee_cents ?? 0),
      custodianCostCents: Number(batch.custodian_cost_cents ?? 0), feeNote: batch.fee_note ?? null,
      feeApproved: Boolean(batch.fee_approved_at), managerApproved: Boolean(batch.manager_approved_at), finalApproved: Boolean(batch.final_approved_at),
    },
    canApproveFee: role === "harmonious",
    isStaff: role === "harmonious",
    rows: list.map((l) => {
      const i = l.payment_instruction_id ? instrById.get(String(l.payment_instruction_id)) : null;
      const t = latestTransfer.get(String(l.id));
      return {
        lineId: String(l.id), investor: String(l.display_name ?? "Investor"),
        ownershipPct: totalGross ? Math.round((Number(l.gross_cents) / totalGross) * 10000) / 100 : 0,
        cashCents: Number(l.cash_cents ?? (String(batch.distribution_kind ?? "cash") === "shares" ? 0 : l.gross_cents) ?? 0),
        shares: l.shares_allocated == null ? null : Number(l.shares_allocated),
        shareValueCents: l.share_value_cents == null ? null : Number(l.share_value_cents),
        withholdingCents: Number(l.withholding_cents ?? 0), netCents: Number(l.net_cents ?? 0),
        destination: i ? `${i.bank_name ?? i.method} ${i.masked_account ?? ""}`.trim() : null,
        destinationVerified: Boolean(l.destination_verified),
        shareDestination: l.share_destination ?? null,
        paymentState: String(l.payment_state ?? "pending"),
        shareTransfer: t ? String(t.event) : null,
      };
    }),
  };
}

/** Record the brokerage/custodian account where an investor's shares go. */
export async function setShareDestination(userId: string, lineId: string, destination: string) {
  const { data: line } = await db().from("distribution_lines").select("id, batch_id, offering_id").eq("id", lineId).maybeSingle();
  if (!line) fail("That distribution line was not found.");
  await distributionAuthority(userId, String(line.offering_id), "prepare");
  const d = destination.trim();
  if (d.length < 4) fail("Enter the brokerage or custodian account for these shares.");
  await db().from("distribution_lines").update({ share_destination: d }).eq("id", lineId);
  return { ok: true };
}

/** Wire/ACH list for authorized staff to upload to the bank themselves. Every download is logged. */
export async function distributionBankFile(userId: string, batchId: string) {
  const batch = await distributionBatchRow(batchId);
  await distributionAuthority(userId, String(batch.offering_id), "execute");
  if (!["approved", "executing"].includes(String(batch.status))) fail("The bank file is available only after final approval.");
  if (String(batch.distribution_kind ?? "cash") === "shares") fail("A shares-only distribution has no cash to wire.");
  const { list, instrById } = await loadSheet(batchId);
  const rows = list.filter((l) => Number(l.net_cents) > 0 && Number(l.cash_cents ?? l.gross_cents) > 0);
  const unverified = rows.filter((l) => !l.destination_verified || !l.payment_instruction_id);
  if (unverified.length) fail(`${unverified.length} investor(s) have no verified wire instructions. Verify them before creating the bank file.`);
  await db().from("distribution_file_access").insert({ batch_id: batchId, file_kind: "bank_file", actor_user_id: userId });
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = ["Beneficiary", "Bank", "Routing / SWIFT", "Account", "Method", "Amount (USD)", "Reference"];
  const lines = rows.map((l) => {
    const d = destinationFromRow(instrById.get(String(l.payment_instruction_id)));
    return [d.beneficiaryName ?? l.display_name, d.bankName, d.routingNumber ?? d.swift, d.accountNumber ?? d.custodianAccount, d.method, (Number(l.net_cents) / 100).toFixed(2), `DIST ${String(batch.batch_number ?? batchId).slice(0, 12)}`].map(esc).join(",");
  });
  return { filename: `distribution-${String(batch.batch_number ?? batchId).slice(0, 12)}-bank-file.csv`, csv: [header.map(esc).join(","), ...lines].join("\n"), count: rows.length };
}

/** Record a custodian/transfer agent instruction or confirmation for one investor's shares. */
export async function recordShareTransfer(userId: string, input: { lineId: string; event: "instructed" | "confirmed" | "failed"; confirmationRef?: string | null; note?: string | null }) {
  const { data: line } = await db().from("distribution_lines").select("id, batch_id, offering_id, shares_allocated").eq("id", input.lineId).maybeSingle();
  if (!line) fail("That distribution line was not found.");
  const batch = await distributionBatchRow(String(line.batch_id));
  await distributionAuthority(userId, String(batch.offering_id), "execute");
  if (!["approved", "executing", "completed"].includes(String(batch.status))) fail("Share transfers can be recorded only after final approval.");
  if (!(Number(line.shares_allocated) > 0)) fail("This investor receives no shares.");
  if (input.event === "confirmed" && (input.confirmationRef ?? "").trim().length < 3) fail("Enter the custodian's confirmation reference.");
  const { error } = await db().from("distribution_share_transfers").insert({
    batch_id: batch.id, distribution_line_id: line.id, event: input.event, custodian: batch.share_custodian,
    shares: Number(line.shares_allocated), confirmation_ref: input.confirmationRef?.trim() || null, note: input.note?.trim() || null, actor_user_id: userId,
  });
  if (error) fail("Could not record the share transfer.");
  return { ok: true };
}

/** Funds' batches for the fund Distributions tab. */
export async function fundDistributions(userId: string, offeringId: string) {
  const { role } = await distributionRole(userId, offeringId);
  if (role === "investor") fail("Not available for this fund.");
  const { data } = await db().from("distribution_batches").select("id, title, status, distribution_kind, declared_amount_cents, share_count, share_issuer, payment_date, created_at, harmonious_fee_cents, fee_approved_at")
    .eq("offering_id", offeringId).order("created_at", { ascending: false });
  return { isStaff: role === "harmonious", batches: ((data ?? []) as any[]).map((b) => ({
    id: String(b.id), title: b.title ?? null, status: String(b.status), kind: String(b.distribution_kind ?? "cash"),
    declaredCents: Number(b.declared_amount_cents ?? 0), shareCount: b.share_count == null ? null : Number(b.share_count),
    shareIssuer: b.share_issuer ?? null, paymentDate: b.payment_date ?? null, createdAt: String(b.created_at),
    feeCents: Number(b.harmonious_fee_cents ?? 0), feeApproved: Boolean(b.fee_approved_at),
  })) };
}
