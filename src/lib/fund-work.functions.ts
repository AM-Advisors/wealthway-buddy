import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { FUND_WORK_SOURCES, normalizeFundWork, sortFundWork, type FundWorkItem, type FundWorkSourceKey, type RawFundWork } from "@/lib/fund-work-model";

type Reader = (d: any, id: string, staff: boolean) => Promise<RawFundWork[]>;
const rows = async (q: any): Promise<any[]> => { const r = await q; if (r.error) throw new Error(r.error.message); return r.data ?? []; };
const respSide = (v: string | null | undefined): RawFundWork["side"] => {
  const s = String(v ?? "").toUpperCase();
  if (s.includes("CLIENT") || s.includes("MANAGER")) return "manager";
  if (s.includes("HARMONIOUS") || s.includes("STAFF")) return "harmonious";
  return "other";
};

/** One reader per source; the Record type makes a missing source a typecheck failure. */
const READERS: Record<FundWorkSourceKey, Reader> = {
  service_requests: async (d, id, staff) => {
    let q = d.from("fund_service_requests").select("id,title,status,responsibility_status,due_date,created_at,client_visibility").eq("fund_id", id).not("status", "in", "(COMPLETED,CANCELLED)").limit(200);
    if (!staff) q = q.eq("client_visibility", true).neq("status", "DRAFT");
    return (await rows(q)).map((r) => ({ id: r.id, title: r.title, status: r.status, side: respSide(r.responsibility_status ?? r.status), due: r.due_date, at: r.created_at }));
  },
  staff_tasks: async (d, id) => (await rows(d.from("staff_tasks").select("id,title,status,due_date,created_at,responsible_party_type").eq("offering_id", id).neq("status", "done").limit(200)))
    .map((r) => ({ id: r.id, title: r.title, status: r.status, side: r.responsible_party_type === "client" ? "manager" : "harmonious", due: r.due_date, at: r.created_at })),
  fund_setup_requests: async (d, id) => (await rows(d.from("fund_requests").select("id,fund_name,status,created_at").eq("offering_id", id).not("status", "in", "(completed,cancelled,declined,converted,launched)").limit(50)))
    .map((r) => ({ id: r.id, title: r.fund_name, status: r.status, side: "harmonious", at: r.created_at })),
  fund_intakes: async (d, id) => (await rows(d.from("client_fund_intakes").select("id,status,created_at").eq("offering_id", id).eq("status", "request_draft").limit(20)))
    .map((r) => ({ id: r.id, title: "New fund details draft", status: "Draft", side: "manager", at: r.created_at })),
  close_requests: async (d, id) => (await rows(d.from("fund_close_requests").select("id,status,target_date,created_at").eq("offering_id", id).not("status", "in", "(completed,cancelled,rejected)").limit(50)))
    .map((r) => ({ id: r.id, title: "Fund close", status: r.status, side: r.status === "draft" || r.status === "returned" ? "manager" : "harmonious", due: r.target_date, at: r.created_at })),
  fee_terms: async (d, id) => (await rows(d.from("fund_fee_terms").select("id,status,created_at").eq("offering_id", id).in("status", ["pending", "requested", "submitted"]).limit(50)))
    .map((r) => ({ id: r.id, title: "Fee terms change", status: r.status, side: "harmonious", at: r.created_at })),
  side_letter_changes: async (d, id) => (await rows(d.from("side_letter_change_requests").select("id,kind,status,proposer_kind,created_at").eq("offering_id", id).eq("status", "pending").limit(50)))
    .map((r) => ({ id: r.id, title: `Side letter ${String(r.kind ?? "change").replace(/_/g, " ")}`, status: r.status, side: r.proposer_kind === "staff" ? "manager" : "harmonious", at: r.created_at })),
  locked_edits: async (d, id) => (await rows(d.from("locked_edit_requests").select("id,summary,status,created_at").like("resource_key", `%${id}%`).eq("status", "pending").limit(50)))
    .map((r) => ({ id: r.id, title: r.summary, status: r.status, side: "harmonious", at: r.created_at })),
  document_changes: async (d, id) => (await rows(d.from("offering_document_change_requests").select("id,file_name,status,requested_at").eq("offering_id", id).eq("status", "pending").limit(50)))
    .map((r) => ({ id: r.id, title: r.file_name ? `New version: ${r.file_name}` : "Document change", status: r.status, side: "harmonious", at: r.requested_at })),
  investor_signatures: async (d, id) => (await rows(d.from("document_signature_signers").select("id,signer_name,role_key,status,application_id,sent_at,created_at").eq("offering_id", id).in("status", ["sent", "viewed", "waiting"]).limit(200)))
    .map((r) => ({ id: r.id, title: r.role_key === "fund_manager" ? `Countersign for ${r.signer_name ?? "investor"}` : `${r.signer_name ?? "Investor"} to sign`, status: r.status, side: r.role_key === "fund_manager" ? "manager" : "investor", at: r.sent_at ?? r.created_at, onboardingId: r.application_id })),
  fund_file_signatures: async (d, id) => (await rows(d.from("fund_file_signatures").select("id,signer_name,status,sent_at,created_at,onboarding_id").eq("offering_id", id).not("status", "in", "(signed,cancelled)").limit(100)))
    .map((r) => ({ id: r.id, title: `${r.signer_name ?? "Signer"} to sign a fund document`, status: r.status, side: "manager", at: r.sent_at ?? r.created_at, onboardingId: r.onboarding_id })),
  ss4_signatures: async (d, id) => (await rows(d.from("ss4_signature_requests").select("id,signer_name,status,created_at").eq("offering_id", id).eq("status", "requested").limit(20)))
    .map((r) => ({ id: r.id, title: `SS-4 for ${r.signer_name ?? "signer"} to sign`, status: r.status, side: "manager", at: r.created_at })),
  w9_signatures: async (d, id) => (await rows(d.from("fund_w9_signature_requests").select("id,status,created_at").eq("offering_id", id).eq("status", "pending").limit(20)))
    .map((r) => ({ id: r.id, title: "Fund W-9 to sign", status: r.status, side: "manager", at: r.created_at })),
  investor_todos: async (d, id) => (await rows(d.from("investment_readiness_tasks").select("id,title,owner,status,onboarding_id,created_at,became_actionable_at").eq("offering_id", id).eq("status", "open").is("resolved_at", null).limit(300)))
    .map((r) => ({ id: r.id, title: r.title, status: r.status, side: r.owner === "fund_manager" ? "manager" : r.owner === "harmonious" ? "harmonious" : "investor", at: r.became_actionable_at ?? r.created_at, onboardingId: r.onboarding_id })),
  close_filings: async (d, id) => (await rows(d.from("fund_close_filings").select("id,filing_type,jurisdiction,status,prepared_at").eq("offering_id", id).not("status", "in", "(filed,not_required,cancelled)").limit(100)))
    .map((r) => ({ id: r.id, title: `${String(r.filing_type).replace(/_/g, " ")}${r.jurisdiction ? ` · ${r.jurisdiction}` : ""}`, status: r.status, side: "harmonious", at: r.prepared_at ?? new Date(0).toISOString() })),
  state_filings: async (d, id) => {
    const [apply, filed] = await Promise.all([
      rows(d.from("fund_state_filings").select("id,state,filer,created_at").eq("offering_id", id).eq("applies", true).limit(100)),
      rows(d.from("fund_state_filing_events").select("state").eq("offering_id", id).not("filed_on", "is", null).limit(500)),
    ]);
    const done = new Set(filed.map((f: any) => f.state));
    return apply.filter((r: any) => !done.has(r.state)).map((r: any) => ({ id: r.id, title: `${r.state} state filing`, status: "Not filed yet", side: r.filer === "client" ? "manager" : "harmonious", at: r.created_at }));
  },
  franchise_fees: async (d, id) => (await rows(d.from("fund_franchise_fees").select("id,state,description,due_date,created_at").eq("offering_id", id).is("filed_on", null).is("removed_at", null).limit(100)))
    .map((r) => ({ id: r.id, title: `${r.state ?? ""} franchise fee${r.description ? `: ${r.description}` : ""}`.trim(), status: "Not paid yet", side: "harmonious", due: r.due_date, at: r.created_at })),
  bank_setup: async (d, id) => (await rows(d.from("offering_bank_setup_requests").select("id,bank,status,created_at").eq("offering_id", id).not("status", "in", "(completed,opened,cancelled,declined)").limit(20)))
    .map((r) => ({ id: r.id, title: `Bank account setup${r.bank ? ` · ${r.bank}` : ""}`, status: r.status, side: "harmonious", at: r.created_at })),
  wire_requests: async (d, id) => (await rows(d.from("wire_requests").select("id,purpose,status,expected_date,created_at").eq("offering_id", id).not("status", "in", "(settled,approved,cancelled,rejected)").limit(100)))
    .map((r) => ({ id: r.id, title: r.purpose ? `Wire: ${r.purpose}` : "Wire request", status: r.status, side: "harmonious", due: r.expected_date, at: r.created_at })),
  reopen_requests: async (d, id) => (await rows(d.from("fund_reopen_requests").select("id,status,created_at").eq("offering_id", id).eq("status", "pending").limit(10)))
    .map((r) => ({ id: r.id, title: "Reopen the fund", status: r.status, side: "harmonious", at: r.created_at })),
  migration_requests: async (d, id) => (await rows(d.from("fund_migration_requests").select("id,fund_name,status,created_at").eq("offering_id", id).eq("status", "pending").limit(10)))
    .map((r) => ({ id: r.id, title: `Migration: ${r.fund_name ?? "fund"}`, status: r.status, side: "harmonious", at: r.created_at })),
  pricing_approvals: async (d, id) => (await rows(d.from("pricing_approval_requests").select("id,status,created_at").eq("offering_id", id).eq("status", "pending").limit(20)))
    .map((r) => ({ id: r.id, title: "Pricing below rate card", status: r.status, side: "harmonious", at: r.created_at })),
};

/** Every open item for one fund, read live from the original records and filtered by audience. */
export const fundOpenItemsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/fund-tabs.server");
    const { staff } = await s.assertFund(context.userId, data.fundId);
    const d = await s.db();
    const items: FundWorkItem[] = [];
    const failed: string[] = [];
    const srcs = FUND_WORK_SOURCES.filter((x) => staff || !x.staffOnly);
    const res = await Promise.allSettled(srcs.map((x) => READERS[x.key](d, data.fundId, staff)));
    res.forEach((r, i) => {
      const src = srcs[i]!;
      if (r.status === "fulfilled") items.push(...normalizeFundWork(src.key, r.value, staff));
      else { console.error("fund open items", src.table, r.reason); failed.push(src.label); }
    });
    return { staff, items: sortFundWork(items), failed };
  });
