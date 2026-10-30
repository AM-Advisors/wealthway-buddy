import { AccountIdentityQueue } from "@/components/account-identity-queue";
import { InvestorVerificationCard } from "@/components/investor-verification-card";
import { PersonalInvestmentLinkCard } from "@/components/personal-investment-link";
import { InvestorReviewPanel } from "@/components/fund-tabs/investors-tab";
import { UploadForInvestor } from "@/components/upload-for-investor";
import { InvestorStepHistory } from "@/components/investor-step-history";
import { InvestorRecordDocuments } from "@/components/investor-document-review";
import { InvestorDocumentAi } from "@/components/investor-document-ai";
import { DistributionBankCard, InvestorTaxIdCard, RelatedPartiesEditor } from "@/components/investor-record-extras";
import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { openTargetFor } from "@/lib/readiness-open-target";
import { sendSubscriptionSignNoticeFn } from "@/lib/fund-tabs.functions";
import { prepareSubscriptionDocumentsFn } from "@/lib/investor-onboarding.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { investorRecordDetailFn, resolveSuggestionFn, updateInvestorRecordFn } from "@/lib/investor-record.functions";
import { CLAIM_STATE_LABELS, SOURCE_LABELS, type EntrySource } from "@/lib/investor-record-model";
import { prettyStatus } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BsaProfilePanel } from "@/components/bsa-profile-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const INVESTOR_RECORD_TABS = ["overview", "investment", "profile", "onboarding", "readiness", "documents", "activity", "history"] as const;
export type InvestorRecordTab = (typeof INVESTOR_RECORD_TABS)[number];
/** Four visible tabs; older links to merged tabs still land in the right place. */
const VISIBLE_TABS = ["overview", "details", "documents", "activity"] as const;
type VisibleTab = (typeof VISIBLE_TABS)[number] | "bsa";
const TAB_LABEL: Record<VisibleTab, string> = { overview: "Overview", details: "Details", documents: "Documents", activity: "Activity", bsa: "BSA (staff only)" };
function visibleTab(t?: InvestorRecordTab): VisibleTab {
  if (t === "investment" || t === "profile") return "details";
  if (t === "documents") return "documents";
  if (t === "activity" || t === "history") return "activity";
  return "overview";
}

export function InvestorRecordPage({ fundId, onboardingId, initial }: { fundId: string; onboardingId: string; initial?: InvestorRecordTab | undefined }) {
  // Staff open records on the Operations address; links stay there so the sign-in is kept.
  const onOps = useRouterState({ select: (st) => st.location.pathname.startsWith("/ops") });
  const [tab, setTab] = useState<VisibleTab>(visibleTab(initial));
  const contactRef = useRef<HTMLDivElement>(null);
  const correctDetails = () => {
    setTab("details");
    requestAnimationFrame(() => {
      contactRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      document.getElementById("ir-firstName")?.focus({ preventScroll: true });
    });
  };
  const load = useServerFn(investorRecordDetailFn);
  const update = useServerFn(updateInvestorRecordFn);
  const resolve = useServerFn(resolveSuggestionFn);
  const sendDoc = useServerFn(sendSubscriptionSignNoticeFn);
  const prepareDocs = useServerFn(prepareSubscriptionDocumentsFn);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["investor-record", onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  const [edit, setEdit] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setEdit((s) => ({ ...s, [k]: e.target.value }));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["investor-record", onboardingId] }); qc.invalidateQueries({ queryKey: ["fund-investor-records", fundId] }); for (const queryKey of [["onboarding"], ["profile-detail"], ["investment-profiles"], ["investment-readiness"], ["investor-prefill", onboardingId]]) qc.invalidateQueries({ queryKey }); };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading investor…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{(error as Error)?.message ?? "Investor not found."}</p>;
  const staff = data.viewer === "staff";
  const p = data.person; const inv = data.investment as any;
  const openItem = async (key: string) => {
    const t = openTargetFor(key);
    if (t.kind === "tab") { setTab(t.tab); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50); return; }
    if (t.kind === "fund") {
      if (onOps) navigate({ to: "/ops/fund/$fundId", params: { fundId }, search: { tab: t.area } });
      else if (t.area === "approvals") navigate({ to: "/manager/fund/$fundId/approvals", params: { fundId } });
      else navigate({ to: "/manager/fund-banking/$fundId", params: { fundId } });
      return;
    }
    if (t.kind === "ops_onboarding") {
      if (staff) navigate({ to: "/admin/investor-onboarding" });
      else toast.message("Harmonious handles this step. It's already on their list.");
      return;
    }
    try {
      if (t.action === "send_tax_form") {
        const r = await sendDoc({ data: { fundId, onboardingId, kind: "tax_form" } });
        toast.success(r.sent ? (r.invited ? "Invite and tax form sent to the investor to sign" : "Tax form sent to the investor to sign") : "Already sent today, or the email wasn't sent.");
      } else {
        const r: any = await prepareDocs({ data: { onboardingId } });
        toast.success(r?.alreadyPrepared ? "Documents were already prepared" : "Subscription documents prepared for signing");
        refresh(); qc.invalidateQueries({ queryKey: ["investment-readiness"] });
      }
    } catch (e) { toast.error((e as Error).message); }
  };
  const cents = (v?: string) => (v ? Math.round(Number(v.replace(/[$,\s]/g, "")) * 100) : undefined);

  const save = async (payload: any) => {
    try {
      const r = await update({ data: payload });
      toast.success(r.suggested ? `${r.changed} saved; ${r.suggested} sent to Harmonious for review.` : r.changed ? "Saved" : "No changes");
      setEdit({}); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const field = (k: string, label: string, cur: unknown, props: Record<string, unknown> = {}) => (
    <div className="space-y-1"><Label htmlFor={`ir-${k}`}>{label}</Label><Input id={`ir-${k}`} defaultValue={cur == null ? "" : String(cur)} onChange={set(k)} disabled={data.overview.removed} {...props} /></div>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>{onOps ? <Link to="/ops/fund/$fundId" params={{ fundId }} className="text-sm text-muted-foreground hover:underline">← {data.fund?.name ?? "Fund"}</Link> : <Link to="/manager/fund/$fundId/investors" params={{ fundId }} className="text-sm text-muted-foreground hover:underline">← {data.fund?.name ?? "Fund"} investors</Link>}
          <h2 className="mt-1 text-xl">{data.overview.name}</h2>
          <p className="text-sm text-muted-foreground">{data.profile?.legalName || data.profile?.label || "No investing profile yet"} · {prettyStatus(data.overview.stage)} · Entered by {SOURCE_LABELS[data.overview.enteredBy as EntrySource] ?? "Investor"}{data.overview.investorConfirmedAt ? " · confirmed by investor" : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          {!data.overview.removed ? <Button size="sm" variant="outline" onClick={correctDetails}><Pencil className="mr-2 h-4 w-4" />Correct investor details</Button> : null}
          {staff && data.overview.investorUserId ? <Button asChild size="sm" variant="outline"><Link to="/ops/investors/$investorId" params={{ investorId: data.overview.investorUserId }} search={{ tab: undefined }}>Open Investor 360</Link></Button> : null}
          {data.overview.removed ? <Badge variant="destructive">Removed from Fund</Badge> : null}
          {data.claimState === "prepared" ? <Badge variant="outline">{CLAIM_STATE_LABELS[data.claimState]}</Badge> : null}
          {data.pendingReviewCount ? <Badge variant="secondary">{data.pendingReviewCount} awaiting Harmonious review</Badge> : null}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b pb-1">{([...VISIBLE_TABS, ...(staff ? ["bsa" as const] : [])] as VisibleTab[]).map((t) => <Button key={t} size="sm" variant={t === tab ? "default" : "ghost"} className="shrink-0" onClick={() => setTab(t)}>{TAB_LABEL[t]}</Button>)}</div>
      {tab === "bsa" && staff ? <BsaProfilePanel onboardingId={onboardingId} /> : null}

      
      {tab === "overview" ? <div className="grid gap-4 md:grid-cols-2">
        {!data.overview.removed && <PersonalInvestmentLinkCard onboardingId={onboardingId} email={p?.email ?? undefined} />}
        <Card className="md:col-span-2"><CardHeader><CardTitle className="text-base">Status, review & actions</CardTitle></CardHeader><CardContent><InvestorReviewPanel fundId={fundId} id={onboardingId} embedded onOpenItem={openItem} /></CardContent></Card>
        {staff && data.suggestions.length ? <Card className="md:col-span-2"><CardHeader><CardTitle className="text-base">Information conflicts & suggested updates</CardTitle></CardHeader><CardContent className="divide-y">
          {data.suggestions.map((s) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div><p className="font-medium">{prettyStatus(s.field)}</p><p className="text-muted-foreground">Harmonious record: {JSON.stringify(s.current)} · {SOURCE_LABELS[s.source as EntrySource] ?? s.source}: {JSON.stringify(s.proposed)}{s.status === "review_later" ? " · marked for later" : ""}</p></div>
            <div className="flex gap-1">{(["accept", "reject", "review_later"] as const).map((a) => <Button key={a} size="sm" variant={a === "accept" ? "default" : "outline"} onClick={async () => { try { await resolve({ data: { id: s.id, action: a } }); toast.success("Recorded"); refresh(); } catch (e) { toast.error((e as Error).message); } }}>{a === "review_later" ? "Review later" : prettyStatus(a)}</Button>)}</div>
          </div>)}</CardContent></Card> : null}
      </div> : null}

      {tab === "details" ? <Card><CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
        {field("amount", "Investment amount (USD)", inv.amountCents ? inv.amountCents / 100 : "")}
        {field("commitment", "Commitment amount (USD)", inv.commitmentCents ? inv.commitmentCents / 100 : "")}
        {staff ? field("accepted", "Accepted amount (USD)", inv.acceptedCents ? inv.acceptedCents / 100 : "") : null}
        {field("investmentDate", "Investment date", inv.investmentDate, { type: "date" })}
        {field("units", "Shares / units", inv.unitCount)}
        {field("referral", "Source / referral", inv.sourceReferral)}
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="ir-mn">Notes visible to the Fund Manager</Label><Textarea id="ir-mn" defaultValue={inv.managerNotes ?? ""} onChange={set("managerNotes")} /></div>
        {staff ? <div className="space-y-1 sm:col-span-2"><Label htmlFor="ir-in">Internal Harmonious notes</Label><Textarea id="ir-in" defaultValue={inv.internalNotes ?? ""} onChange={set("internalNotes")} /></div> : null}
        <Button className="sm:w-fit" disabled={data.overview.removed} onClick={() => save({ onboardingId, investment: {
          amountCents: cents(edit['amount']), commitmentCents: cents(edit['commitment']), acceptedCents: staff ? cents(edit['accepted']) : undefined,
          investmentDate: edit['investmentDate'], unitCount: edit['units'] ? Number(edit['units']) : undefined, sourceReferral: edit['referral'],
          managerNotes: edit['managerNotes'], internalNotes: staff ? edit['internalNotes'] : undefined,
        } })}>{data.detailsEditMode === "suggest" ? "Submit investment changes" : "Save investment"}</Button>
      </CardContent></Card> : null}

      {tab === "details" && staff && data.overview.investorUserId ? <AccountIdentityQueue userId={data.overview.investorUserId} investorName={[p?.firstName, p?.middleName, p?.lastName].filter(Boolean).join(" ")} investorEmail={p?.email ?? undefined} /> : null}
      {tab === "details" ? <div className="space-y-4">
        {staff && data.overview.investorUserId ? <InvestorVerificationCard investorUserId={data.overview.investorUserId} /> : null}
        <Card ref={contactRef} className="scroll-mt-4"><CardHeader><CardTitle className="text-base">Investor details</CardTitle>
          {data.contactEditMode === "suggest" ? <p className="text-sm text-muted-foreground">Changes need review because signing or funding has started, or this contact is shared with another investment.</p>
            : data.claimState === "prepared" ? <p className="text-sm text-muted-foreground">Prepared record: entered by {SOURCE_LABELS[data.overview.enteredBy as EntrySource] ?? "the Fund team"}, not by the investor. Nobody has access to it until the investor signs in with this email, and they'll be asked to confirm it.</p> : null}
        </CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          {field("firstName", "Legal first name", p?.firstName)}{field("middleName", "Middle name", p?.middleName)}{field("lastName", "Last name", p?.lastName)}{field("preferredName", "Preferred name", p?.preferredName)}
          {field("email", "Email", p?.email)}{field("phone", "Phone", p?.phone)}{field("citizenship", "Citizenship", p?.citizenship)}
          {field("dob", staff ? "Date of birth" : "Date of birth (entered values are visible to Harmonious only)", staff ? (p as any)?.dateOfBirth : undefined, { type: "date" })}
          {field("address1", "Residential address", p?.addressLine1)}{field("address2", "Address line 2", p?.addressLine2)}{field("city", "City", p?.city)}{field("region", "State / region", p?.region)}{field("postal", "Postal code", p?.postalCode)}{field("country", "Country", p?.country)}
          <Button className="sm:w-fit" disabled={data.overview.removed} onClick={() => save({ onboardingId, person: {
            firstName: edit['firstName'], middleName: edit['middleName'], lastName: edit['lastName'], preferredName: edit['preferredName'], email: edit['email'], phone: edit['phone'],
            citizenship: edit['citizenship'], dateOfBirth: edit["dob"] || undefined, addressLine1: edit['address1'], addressLine2: edit['address2'], city: edit['city'], region: edit['region'], postalCode: edit['postal'], country: edit['country'],
          } })}>{data.contactEditMode === "suggest" ? "Submit correction for review" : "Save investor details"}</Button>
        </CardContent></Card>
        {data.profile ? <Card><CardHeader><CardTitle className="text-base">Investment Profile · {data.profile.typeLabel}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          {field("legalName", "Legal investor name", data.profile.legalName)}
          {data.profile.type === "entity" || data.profile.type === "trust" ? field("jurisdiction", "Jurisdiction", (data.profile.details as any).jurisdiction) : null}
          {data.profile.type === "ira" ? field("custodianName", "Custodian", (data.profile.details as any).custodianName) : null}
          <Button className="sm:w-fit" disabled={data.overview.removed} onClick={() => save({ onboardingId, profile: { legalName: edit['legalName'], details: Object.fromEntries(["jurisdiction", "custodianName"].filter((k) => edit[k] !== undefined).map((k) => [k, edit[k]])) } })}>Save profile</Button>
          <RelatedPartiesEditor onboardingId={onboardingId} related={data.related as any} editable={!data.overview.removed && (data as any).profileEditMode === "direct"} onChanged={refresh} />
          <p className="text-xs text-muted-foreground sm:col-span-2">Tax forms, ID images and verification evidence are never shown here.</p>
        </CardContent></Card> : null}
        {data.profile ? <InvestorTaxIdCard onboardingId={onboardingId} last4={(data.profile as any).taxIdLast4} editable={!data.overview.removed && (data as any).profileEditMode === "direct"} onChanged={refresh} /> : null}
        {!data.overview.removed ? <DistributionBankCard onboardingId={onboardingId} hasAccount={Boolean((data as any).investorHasAccount)} /> : null}
      </div> : null}

      {tab === "documents" ? <div className="space-y-4">{!data.overview.removed ? <UploadForInvestor onboardingId={onboardingId} /> : null}{staff ? <InvestorDocumentAi onboardingId={onboardingId} /> : null}<InvestorRecordDocuments offeringId={fundId} onboardingId={onboardingId} /><Card><CardContent className="pt-6 text-sm text-muted-foreground">Values read from imported documents show up as suggested updates for Harmonious to review; they never overwrite this record automatically.
        <div className="mt-2"><Link to={onOps ? "/ops/fund/$fundId" : "/manager/fund/$fundId/documents"} params={{ fundId }} className="text-primary hover:underline">Open Fund documents</Link></div></CardContent></Card></div> : null}

      {tab === "activity" ? <InvestorStepHistory offeringId={fundId} onboardingId={onboardingId} /> : null}
      {tab === "activity" ? <Card><CardContent className="pt-6">{data.activity.length ? <ul className="divide-y text-sm">{data.activity.map((a: any, i: number) => <li key={i} className="py-2"><p>{a.label}</p><p className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()} · {a.source}{a.field ? ` · ${a.field}: ${JSON.stringify(a.from)} → ${JSON.stringify(a.to)}` : ""}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No activity yet.</p>}</CardContent></Card> : null}
    </section>
  );
}
