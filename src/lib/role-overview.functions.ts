import { canonicalizeApplications } from "@/lib/verification-status";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { investmentSubscriptionBadges, liveLegacyApplications, type SubscriptionBadge } from "@/lib/legacy-application-supersede";

export type InvestorFundLine = {
  /** Stable row key. */
  key: string;
  /** "investment" = current investment record (what Operations shows); "application" = older application with no investment record yet. */
  kind: "investment" | "application";
  onboardingId: string | null;
  applicationId: string | null;
  offeringId: string;
  fundName: string;
  currentStep: string | null;
  commitmentCents: number | null;
  badges: SubscriptionBadge[];
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

    // Roles, identity and managed funds come from the canonical session facts;
    // this summary no longer rediscovers relationships itself.
    const { gatherFacts } = await import("@/lib/session-facts.server");
    const facts = await gatherFacts(context);
    const roles = facts.roles;
    const isAdmin = roles.includes("admin");
    const isManager = roles.includes("fund_manager");
    const isOperations = roles.includes("operations") || isAdmin;
    const isReviewer = isAdmin || isManager;
    void claims;

    const email = facts.email;
    const name = facts.name || email || "there";

    // ---------- Investor ----------
    const [{ data: myApps }, { data: myOnboardings }] = await Promise.all([
      supabase
        .from("investor_applications")
        .select(
          "id, offering_id, status, current_step, commitment_cents, kyc_status, aml_status, accreditation_status, documents_status, funding_status",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("investor_onboardings").select("id, offering_id").eq("investor_user_id", userId).limit(500),
    ]);

    // A fund with a current investment record (any stage) is owned by that
    // record; its older application row is frozen history and never shows
    // its own "not started" statuses here.
    const myAppRows = await canonicalizeApplications(
      supabase,
      liveLegacyApplications((myApps ?? []) as any[], (myOnboardings ?? []) as any[]),
      userId,
    );
    type Investment = Awaited<ReturnType<typeof import("@/lib/dashboards.server").investorDashboard>>["investments"][number];
    let investments: Investment[] = [];
    if ((myOnboardings ?? []).length > 0) {
      try {
        const { investorDashboard } = await import("@/lib/dashboards.server");
        investments = (await investorDashboard(userId)).investments;
      } catch (e) {
        console.error("[role-overview] investment progress unavailable", (e as Error).message);
      }
    }
    const myOfferingIds = [...new Set(myAppRows.map((a) => a.offering_id as string))];

    // ---------- Reviewer scope ----------
    let managedOfferingIds: string[] = [];
    if (isManager && !isAdmin) {
      managedOfferingIds = [...new Set(facts.managedFundIds)];
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
      applications: [
        ...investments.map<InvestorFundLine>((i) => ({
          key: `investment:${i.id}`,
          kind: "investment",
          onboardingId: i.id,
          applicationId: null,
          offeringId: i.offeringId,
          fundName: i.profileLabel ? `${i.fundName} · ${i.profileLabel}` : i.fundName,
          currentStep: null,
          commitmentCents: i.amountCents ?? null,
          badges: investmentSubscriptionBadges(i),
        })),
        ...myAppRows.map<InvestorFundLine>((a) => ({
          key: `application:${a.id}`,
          kind: "application",
          onboardingId: null,
          applicationId: a.id,
          offeringId: a.offering_id,
          fundName: offerings.get(a.offering_id)?.name ?? "Your fund",
          currentStep: a.current_step ?? null,
          commitmentCents: a.commitment_cents ?? null,
          badges: [
            { label: "Identity", status: a.kyc_status ?? "not_started" },
            { label: "Screening", status: a.aml_status ?? "not_started" },
            { label: "Accreditation", status: a.accreditation_status ?? "not_started" },
            { label: "Documents", status: a.documents_status ?? "not_started" },
            { label: "Funding", status: a.funding_status ?? "not_started" },
          ],
        })),
      ],
      committedCents:
        investments.reduce((sum, i) => sum + (i.amountCents ?? 0), 0) +
        myAppRows.reduce((sum, a) => sum + (a.commitment_cents ?? 0), 0),
      unreadMessages: 0,
    };

    // Unread messages count every thread of this person's, including one
    // filed under an older application that an investment record now owns.
    const messageAppIds = ((myApps ?? []) as any[]).map((a) => a.id as string);
    if (messageAppIds.length > 0) {
      const { count } = await supabase
        .from("portal_messages")
        .select("id", { count: "exact", head: true })
        .in("application_id", messageAppIds)
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
        investor: myAppRows.length > 0 || investments.length > 0 || (!isReviewer && !isOperations),
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
