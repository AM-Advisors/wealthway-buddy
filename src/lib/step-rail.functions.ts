import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";

export type RailStatus = "not_started" | "in_progress" | "in_review" | "complete" | "attention";

export type RailStep = {
  key: "kyc" | "aml" | "accreditation" | "documents" | "funding";
  label: string;
  status: RailStatus;
  /** Real captured values for this step — empty when nothing is on file yet. */
  facts: { label: string; value: string }[];
  capturedAt: string | null;
};

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "—";

const titleize = (v: string | null | undefined) =>
  v ? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";

/**
 * The onboarding rail, built from the records each form actually writes:
 * profile + identity document, AML declarations, accreditation attestation,
 * signatures/subscription and funding.
 */
export const getStepRail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ steps: RailStep[] }> => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: application }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("investor_applications")
        .select("*")
        .eq("user_id", userId)
        .eq("id", await activeApplicationId(supabase, userId))
        .maybeSingle(),
    ]);

    const blank = (): RailStep[] => [
      { key: "kyc", label: "Identity", status: "not_started", facts: [], capturedAt: null },
      { key: "aml", label: "Screening", status: "not_started", facts: [], capturedAt: null },
      {
        key: "accreditation",
        label: "Accreditation",
        status: "not_started",
        facts: [],
        capturedAt: null,
      },
      { key: "documents", label: "Documents", status: "not_started", facts: [], capturedAt: null },
      { key: "funding", label: "Funding", status: "not_started", facts: [], capturedAt: null },
    ];

    if (!application) return { steps: blank() };

    const appId = application.id;

    const [kyc, aml, acc, subscription, signatures, payments, wires] = await Promise.all([
      supabase.from("kyc_verifications").select("*").eq("application_id", appId).maybeSingle(),
      supabase.from("aml_screenings").select("*").eq("application_id", appId).maybeSingle(),
      supabase.from("accreditation_records").select("*").eq("application_id", appId).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("application_id", appId).maybeSingle(),
      supabase
        .from("document_signatures")
        .select("id, signer_name, signed_at")
        .eq("application_id", appId),
      supabase
        .from("payments")
        .select("method, amount_cents, status, reference_code, confirmed_at")
        .eq("application_id", appId)
        .order("created_at", { ascending: false }),
      supabase
        .from("wire_confirmations")
        .select("amount_cents, sending_bank_name, sending_account_last4, sent_on, status")
        .eq("application_id", appId)
        .order("created_at", { ascending: false }),
    ]);

    const requiredDocs = await supabase
      .from("offering_documents")
      .select("id")
      .eq("offering_id", application.offering_id)
      .eq("requires_signature", true);

    const steps = blank();

    const statusFromCheck = (
      s: string | null | undefined,
      hasData: boolean,
    ): RailStatus => {
      if (s === "approved") return "complete";
      if (s === "declined") return "attention";
      if (s === "review" || s === "pending") return "in_review";
      return hasData ? "in_progress" : "not_started";
    };

    // 1. Identity
    const idResult = (kyc.data?.result ?? {}) as Record<string, unknown>;
    const identityFacts: RailStep["facts"] = [];
    if (profile?.legal_name) identityFacts.push({ label: "Legal name", value: profile.legal_name });
    if (profile?.investor_type)
      identityFacts.push({ label: "Investor type", value: titleize(profile.investor_type) });
    if (profile?.entity_name)
      identityFacts.push({ label: "Entity", value: profile.entity_name });
    if (profile?.date_of_birth)
      identityFacts.push({ label: "Date of birth", value: String(profile.date_of_birth) });
    if (idResult["id_document_type"])
      identityFacts.push({
        label: "ID on file",
        value: `${titleize(String(idResult["id_document_type"]))}${
          idResult["id_document_number_last4"] ? ` ····${idResult["id_document_number_last4"]}` : ""
        }`,
      });
    if (idResult["id_expiration"])
      identityFacts.push({ label: "ID expires", value: String(idResult["id_expiration"]) });
    if (profile?.city)
      identityFacts.push({
        label: "Address",
        value: [profile.city, profile.region, profile.country].filter(Boolean).join(", "),
      });
    if (profile?.tax_id)
      identityFacts.push({ label: "Tax ID", value: `····${String(profile.tax_id).slice(-4)}` });
    steps[0]!.facts = identityFacts;
    steps[0]!.status = statusFromCheck(application.kyc_status, identityFacts.length > 0);
    steps[0]!.capturedAt = (idResult["submitted_at"] as string | undefined) ?? null;

    // 2. Screening (AML)
    const amlAnswers = ((aml.data?.matches ?? {}) as { answers?: Record<string, unknown>; flagged?: boolean })
      .answers;
    const amlFlagged = ((aml.data?.matches ?? {}) as { flagged?: boolean }).flagged === true;
    const screeningFacts: RailStep["facts"] = [];
    if (amlAnswers) {
      screeningFacts.push({
        label: "Source of funds",
        value: titleize(String(amlAnswers["source_of_funds"] ?? "")) || "—",
      });
      if (amlAnswers["funds_origin_country"])
        screeningFacts.push({
          label: "Funds originate in",
          value: String(amlAnswers["funds_origin_country"]),
        });
      screeningFacts.push({
        label: "US person",
        value: amlAnswers["is_us_person"] ? "Yes" : "No",
      });
      screeningFacts.push({
        label: "PEP / sanctions",
        value:
          amlAnswers["is_pep"] || amlAnswers["sanctions_exposure"]
            ? "Disclosed — under review"
            : "None declared",
      });
      screeningFacts.push({
        label: "Third-party funds",
        value: amlAnswers["third_party_funding"] ? "Yes" : "No",
      });
      if (amlAnswers["source_of_wealth"])
        screeningFacts.push({
          label: "Source of wealth",
          value: String(amlAnswers["source_of_wealth"]).slice(0, 160),
        });
    }
    steps[1]!.facts = screeningFacts;
    steps[1]!.status = amlFlagged
      ? "attention"
      : statusFromCheck(application.aml_status, screeningFacts.length > 0);
    steps[1]!.capturedAt =
      ((aml.data?.matches ?? {}) as { submitted_at?: string }).submitted_at ?? null;

    // 3. Accreditation
    const q = (acc.data?.questionnaire ?? {}) as Record<string, unknown>;
    const accFacts: RailStep["facts"] = [];
    if (acc.data) {
      accFacts.push({
        label: "Offering rule",
        value: acc.data.reg_type === "506c" ? "Reg D 506(c)" : "Reg D 506(b)",
      });
      if (acc.data.method) accFacts.push({ label: "Basis", value: titleize(acc.data.method) });
      if (typeof acc.data.qualifies === "boolean")
        accFacts.push({
          label: "Qualifies",
          value: acc.data.qualifies ? "Yes — accredited" : "Not qualified",
        });
      if (q["net_worth_over_1m"] !== undefined)
        accFacts.push({
          label: "Net worth over $1M",
          value: q["net_worth_over_1m"] ? "Yes" : "No",
        });
      if (q["income_last_two_years"] !== undefined)
        accFacts.push({
          label: "Income test met",
          value: q["income_last_two_years"] ? "Yes" : "No",
        });
      if (acc.data.attested_signature)
        accFacts.push({ label: "Signed by", value: acc.data.attested_signature });
      if (acc.data.pre_existing_relationship)
        accFacts.push({
          label: "Relationship",
          value: String(acc.data.pre_existing_relationship).slice(0, 160),
        });
    }
    steps[2]!.facts = accFacts;
    steps[2]!.status = statusFromCheck(application.accreditation_status, accFacts.length > 0);
    steps[2]!.capturedAt = acc.data?.attested_at ?? null;

    // 4. Documents
    const signed = signatures.data ?? [];
    const required = requiredDocs.data?.length ?? 0;
    const docFacts: RailStep["facts"] = [];
    if (required > 0 || signed.length > 0)
      docFacts.push({ label: "Signed", value: `${signed.length} of ${required || signed.length}` });
    if (subscription.data?.commitment_cents)
      docFacts.push({ label: "Commitment", value: money(subscription.data.commitment_cents) });
    if (subscription.data?.ownership_title)
      docFacts.push({ label: "Ownership title", value: subscription.data.ownership_title });
    const lastSigned = signed
      .map((s) => s.signed_at)
      .filter(Boolean)
      .sort()
      .pop();
    steps[3]!.facts = docFacts;
    steps[3]!.status =
      required > 0 && signed.length >= required
        ? "complete"
        : signed.length > 0
          ? "in_progress"
          : "not_started";
    steps[3]!.capturedAt = (lastSigned as string | undefined) ?? null;

    // 5. Funding
    const payment = payments.data?.[0];
    const wire = wires.data?.[0];
    const fundFacts: RailStep["facts"] = [];
    if (payment) {
      fundFacts.push({ label: "Method", value: payment.method === "ach" ? "ACH" : "Wire" });
      fundFacts.push({ label: "Amount", value: money(payment.amount_cents) });
      if (payment.reference_code)
        fundFacts.push({ label: "Reference", value: payment.reference_code });
      fundFacts.push({ label: "Status", value: titleize(payment.status) });
    } else if (application.commitment_cents) {
      fundFacts.push({ label: "Commitment", value: money(application.commitment_cents) });
    }
    if (wire) {
      fundFacts.push({
        label: "Wire sent",
        value: `${wire.sending_bank_name} ····${wire.sending_account_last4} on ${wire.sent_on}`,
      });
    }
    steps[4]!.facts = fundFacts;
    steps[4]!.status =
      application.funding_status === "settled"
        ? "complete"
        : application.funding_status === "failed" || application.funding_status === "returned"
          ? "attention"
          : application.funding_status === "not_started"
            ? fundFacts.length > 0
              ? "in_progress"
              : "not_started"
            : "in_review";
    steps[4]!.capturedAt = (payment?.confirmed_at as string | undefined) ?? null;

    return { steps };
  });
