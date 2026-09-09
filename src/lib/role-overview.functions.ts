import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InvestorFundLine = {
  applicationId: string;
  offeringId: string;
  fundName: string;
  status: string;
  currentStep: string | null;
  commitmentCents: number | null;
  kyc: string | null;
  aml: string | null;
  accreditation: string | null;
  documents: string | null;
  funding: string | null;
};

export type ReviewerFundLine = {
  offeringId: string;
  fundName: string;
  investors: number;
  committedCents: number;
  needsReview: number;
};

/**
 * One read that powers the role-aware home page. Every block is optional:
 * a person can be an investor, a fund manager, operations staff and an admin
 * at the same time, and each block they qualify for is filled in.
 */
export const getRoleOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle(),
    ]);
    const roles = ((roleRows ?? []) as any[]).map((r) => r.role as string);
    const isAdmin = roles.includes("admin");
    const isManager = roles.includes("fund_manager");
    const isOperations = roles.includes("operations") || isAdmin;
    const isReviewer = isAdmin || isManager;

    const email =
      ((profile as any)?.email as string | undefined) ??
      ((claims as any)?.email as string | undefined) ??
      "";
    const name = ((profile as any)?.legal_name as string | undefined) || email || "there";

    // ---------- Investor ----------
    const { data: myApps } = await supabase
      .from("investor_applications")
      .select(
        "id, offering_id, status, current_step, commitment_cents, kyc_status, aml_status, accreditation_status, documents_status, funding_status",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const myAppRows = (myApps ?? []) as any[];
    const myOfferingIds = [...new Set(myAppRows.map((a) => a.offering_id as string))];

    // ---------- Reviewer scope ----------
    let managedOfferingIds: string[] = [];
    if (isManager && !isAdmin) {
      const { data: assignments } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      managedOfferingIds = [...new Set(((assignments ?? []) as any[]).map((a) => a.offering_id))];
    }

    const lookupIds = [...new Set([...myOfferingIds, ...managedOfferingIds])];
    let offeringsQuery = supabase.from("offerings").select("id, name, is_open, reg_type");
    if (!isAdmin && lookupIds.length > 0) offeringsQuery = offeringsQuery.in("id", lookupIds);
    const { data: offeringRows } = isAdmin || lookupIds.length > 0 ? await offeringsQuery : { data: [] as any[] };
    const offerings = new Map<string, { name: string; isOpen: boolean }>();
    for (const o of (offeringRows ?? []) as any[]) {
      offerings.set(o.id as string, { name: o.name as string, isOpen: Boolean(o.is_open) });
    }

    const investor = {
      applications: myAppRows.map<InvestorFundLine>((a) => ({
        applicationId: a.id,
        offeringId: a.offering_id,
        fundName: offerings.get(a.offering_id)?.name ?? "Your fund",
        status: a.status ?? "draft",
        currentStep: a.current_step ?? null,
        commitmentCents: a.commitment_cents ?? null,
        kyc: a.kyc_status ?? null,
        aml: a.aml_status ?? null,
        accreditation: a.accreditation_status ?? null,
        documents: a.documents_status ?? null,
        funding: a.funding_status ?? null,
      })),
      committedCents: myAppRows.reduce((sum, a) => sum + (a.commitment_cents ?? 0), 0),
      unreadMessages: 0,
    };

    if (myAppRows.length > 0) {
      const { count } = await supabase
        .from("portal_messages")
        .select("id", { count: "exact", head: true })
        .in(
          "application_id",
          myAppRows.map((a) => a.id),
        )
        .neq("sender_id", userId)
        .is("read_at", null);
      investor.unreadMessages = count ?? 0;
    }

    // ---------- Fund management ----------
    let manager: {
      funds: ReviewerFundLine[];
      needsReview: number;
      wiresToReview: number;
      uploadsToReview: number;
      committedCents: number;
      investors: number;
    } | null = null;

    if (isReviewer) {
      let appsQuery = supabase
        .from("investor_applications")
        .select("id, offering_id, status, commitment_cents, manager_review_status");
      if (!isAdmin) {
        if (managedOfferingIds.length === 0) appsQuery = appsQuery.in("offering_id", ["00000000-0000-0000-0000-000000000000"]);
        else appsQuery = appsQuery.in("offering_id", managedOfferingIds);
      }
      const { data: reviewApps } = await appsQuery;
      const rows = (reviewApps ?? []) as any[];

      const byFund = new Map<string, ReviewerFundLine>();
      for (const row of rows) {
        const key = row.offering_id as string;
        const line =
          byFund.get(key) ??
          ({
            offeringId: key,
            fundName: offerings.get(key)?.name ?? "Fund",
            investors: 0,
            committedCents: 0,
            needsReview: 0,
          } satisfies ReviewerFundLine);
        line.investors += 1;
        line.committedCents += row.commitment_cents ?? 0;
        if (row.status === "submitted" || row.manager_review_status === "pending")
          line.needsReview += 1;
        byFund.set(key, line);
      }

      let wiresToReview = 0;
      let uploadsToReview = 0;
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id as string);
        const [{ count: wires }, { count: uploads }] = await Promise.all([
          supabase
            .from("wire_confirmations")
            .select("id", { count: "exact", head: true })
            .in("application_id", ids)
            .in("status", ["submitted", "pending"]),
          supabase
            .from("investor_documents")
            .select("id", { count: "exact", head: true })
            .in("application_id", ids)
            .eq("review_status", "pending"),
        ]);
        wiresToReview = wires ?? 0;
        uploadsToReview = uploads ?? 0;
      }

      const funds = [...byFund.values()].sort((a, b) => a.fundName.localeCompare(b.fundName));
      manager = {
        funds,
        needsReview: funds.reduce((s, f) => s + f.needsReview, 0),
        wiresToReview,
        uploadsToReview,
        committedCents: funds.reduce((s, f) => s + f.committedCents, 0),
        investors: funds.reduce((s, f) => s + f.investors, 0),
      };
    }

    // ---------- Operations ----------
    let operations: {
      bankingPending: number;
      ss4Pending: number;
      taxPending: number;
    } | null = null;

    if (isOperations) {
      const [{ count: banking }, { count: tax }, { data: ss4 }] = await Promise.all([
        supabase
          .from("offering_bank_setup_requests")
          .select("id", { count: "exact", head: true })
          .eq("review_status", "pending"),
        supabase
          .from("fund_tax_documents")
          .select("id", { count: "exact", head: true })
          .eq("review_status", "pending"),
        supabase.rpc("list_entity_reviews"),
      ]);
      const ss4Rows = (ss4 ?? []) as any[];
      operations = {
        bankingPending: banking ?? 0,
        taxPending: tax ?? 0,
        ss4Pending: ss4Rows.filter(
          (r) => r.ein_review_status === "pending" || r.ss4_review_status === "pending",
        ).length,
      };
    }

    // ---------- Admin ----------
    let admin: {
      openFunds: number;
      totalFunds: number;
      accessRequests: number;
      wireRequests: number;
    } | null = null;

    if (isAdmin) {
      const [{ count: totalFunds }, { count: openFunds }, { count: access }, { count: wireReq }] =
        await Promise.all([
          supabase.from("offerings").select("id", { count: "exact", head: true }),
          supabase
            .from("offerings")
            .select("id", { count: "exact", head: true })
            .eq("is_open", true),
          supabase
            .from("fund_access_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "new"),
          supabase
            .from("wire_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        ]);
      admin = {
        totalFunds: totalFunds ?? 0,
        openFunds: openFunds ?? 0,
        accessRequests: access ?? 0,
        wireRequests: wireReq ?? 0,
      };
    }

    return {
      name,
      email,
      roles: {
        investor: myAppRows.length > 0 || (!isReviewer && !isOperations),
        manager: isManager,
        admin: isAdmin,
        operations: roles.includes("operations"),
      },
      investor,
      manager,
      operations,
      admin,
    };
  });
