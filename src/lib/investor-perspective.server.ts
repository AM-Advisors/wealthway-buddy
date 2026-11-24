import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fundAccessFor } from "./fund-access.server";
import { computeReadinessFor, fundRosterViewer, investorDeskActor, investorSideSignedDocuments, publishedQuestionnaire } from "./investor-onboarding.server";
import { investmentAmountCents } from "./investment-amounts";
import { readinessView } from "./investment-readiness";
import { journeySteps } from "./investor-journey-model";
import { perspectiveEditor, perspectiveMissingFields, canOpenInvestorPerspective, completionActor, COMPLETION_EVENTS, safePerspectiveQuestion, type InvestorPerspectiveData } from "./investor-perspective";
import { canInvestorFund, questionAppliesToProfile, questionVisible, type Question } from "./investor-onboarding-model";
import { SENSITIVE_TITLE } from "./didit-questionnaire";
import standardQuestions from "./standard-investor-questionnaire.json";

/** Inspection only: no subject session, helper activation, saves, signatures or money paths. */
export async function investorPerspective(userId: string, input: { onboardingId: string; participantId?: string | null }): Promise<InvestorPerspectiveData> {
  const db = supabaseAdmin as any;
  const { data: row, error } = await db.from("investor_onboardings").select("*").eq("id", input.onboardingId).is("removed_at", null).maybeSingle();
  if (error || !row || row.merged_into_onboarding_id) throw new Error("That investment is not available.");
  const access = await fundAccessFor(db, userId, row.offering_id);
  if (!canOpenInvestorPerspective(access)) throw new Error("This view is available only to this fund's managers and authorized team.");
  await fundRosterViewer(userId, row.offering_id);
  const desk = await investorDeskActor(userId, row.offering_id).catch(() => null);
  const canReadDetails = access.staff || access.manager || Boolean(desk?.viaTeam);
  const editor = perspectiveEditor(access, Boolean(desk?.viaTeam));
  const [{ result, facts }, { data: offering, error: offeringError }, { data: participants, error: participantError }, { data: events, error: eventError }] = await Promise.all([
    computeReadinessFor(row),
    db.from("offerings").select("name").eq("id", row.offering_id).maybeSingle(),
    db.from("onboarding_participants").select("id, full_name, role, status, removed_at").eq("onboarding_id", row.id).in("status", ["invited", "active"]).is("removed_at", null),
    db.from("investor_onboarding_events").select("id, event, actor_user_id, actor_role, created_at").eq("onboarding_id", row.id).eq("offering_id", row.offering_id).in("event", Object.keys(COMPLETION_EVENTS)).order("created_at", { ascending: false }).limit(100),
  ]);
  if (offeringError || participantError || eventError) throw new Error("This investor view could not be loaded. Please try again.");
  const selected = input.participantId ? (participants ?? []).find((p: any) => p.id === input.participantId) : null;
  if (input.participantId && (!selected || !["preparer", "contact", "signer"].includes(selected.role))) throw new Error("That person's assignment is no longer available.");
  const readDetails = canReadDetails && (!selected || selected.role === "preparer" || selected.role === "signer");
  const { data: questionRows, error: questionError } = row.questionnaire_version && readDetails
    ? await db.from("offering_questionnaires").select("questions").eq("offering_id", row.offering_id).eq("version", row.questionnaire_version)
    : { data: [], error: null };
  if (questionError) throw new Error("Questionnaire details could not be loaded.");
  const answers = (row.questionnaire_responses ?? {}) as Record<string, unknown>;
  const currentQuestionnaire = readDetails && !row.questionnaire_version ? await publishedQuestionnaire(row.offering_id, row.created_at ?? null) : null;
  const questions = (questionRows?.[0]?.questions ?? currentQuestionnaire?.questions ?? standardQuestions) as Question[];
  const safe = readinessView(result, "manager");
  const person = facts.person ?? {};
  const investorName = [person.legal_first_name, person.legal_last_name].filter(Boolean).join(" ") || facts.profile?.display_label || "Investor";
  const actorIds = [...new Set((events ?? []).filter((e: any) => e.actor_role !== "system").map((e: any) => e.actor_user_id).filter(Boolean))] as string[];
  const { loadAccountNames } = await import("./profile-name.server");
  const names = await loadAccountNames(actorIds);
  const investorSigned = await investorSideSignedDocuments(row);
  const fundingGate = canInvestorFund({ stage: row.stage, requirements: facts.requirements, approvedToFundAt: row.approved_to_fund_at, countersignTiming: facts.countersignTiming, openBlockingExceptions: result.items.some(i => i.key === "exceptions" && i.status === "blocked") ? 1 : 0 });
  const display = (v: unknown): string | null => v == null || v === "" ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : ["string", "number"].includes(typeof v) ? String(v) : Array.isArray(v) ? v.filter(x => ["string", "number", "boolean"].includes(typeof x)).join(", ") : null;
  return {
    onboardingId: row.id, fundName: offering?.name ?? "Fund", investorName,
    profileLabel: facts.profile?.display_label ?? null, amountCents: investmentAmountCents(row),
    steps: journeySteps(facts.requirements, { stage: row.stage, approvedToFund: fundingGate.allowed, fundingStatus: row.funding_status, investorReportsSent: Boolean(row.investor_reports_sent_at) }),
    items: safe.items.map(i => ({ key: i.key, label: i.label, status: i.status, owner: i.owner })),
    canReadDetails: readDetails,
    questions: readDetails ? questions.filter(q => questionAppliesToProfile(q, facts.profile?.profile_type) && questionVisible(q, answers) && q.type !== "document" && safePerspectiveQuestion(q.key, q.label) && !SENSITIVE_TITLE.test(`${q.key} ${q.label}`)).map(q => ({ key: q.key, label: q.label, answer: display(answers[q.key]) })) : [],
    participants: (participants ?? []).map((p: any) => ({ id: p.id, name: p.full_name, role: p.role, status: p.status })),
    selectedParticipant: selected ? { id: selected.id, name: selected.full_name, role: selected.role } : null,
    person: readDetails ? [{ label: "Investor", value: investorName }, { label: "Investing as", value: facts.profile?.display_label ?? "Not selected" }, { label: "Address", value: [person.address_line1, person.city, person.region, person.postal_code, person.country].filter(Boolean).join(", ") || "Not provided" }] : [],
    documents: (facts.documents ?? []).map((d: any) => ({ id: String(d.id), title: d.title ?? "Fund document", status: d.signed ? "Signed" : investorSigned.has(String(d.id)) ? "Investor signed, waiting on fund countersignature" : d.requiresAcknowledgment ? (d.acknowledged ? "Acknowledged" : "Acknowledgment pending") : d.requiresSignature ? "Awaiting signatures" : "Available" })),
    missing: readDetails ? perspectiveMissingFields({ person: { ...person, tax_id_last4: person.tax_id_last4 ?? null }, profile: facts.profile ?? null, amountCents: investmentAmountCents(row) }) : [],
    editor: readDetails && !selected ? editor : null,
    history: (events ?? []).flatMap((e: any) => {
      const entry = COMPLETION_EVENTS[e.event];
      return entry ? [{ id: e.id, ...entry, actor: completionActor(e.actor_role, names.get(e.actor_user_id) ?? null), at: e.created_at }] : [];
    }),
  };
}