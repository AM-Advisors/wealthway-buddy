import { RELATED_REVIEW_MESSAGE } from "@/lib/related-person-model";
import { InvestorRecordDocuments } from "@/components/investor-document-review";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { investorRecordDetailFn, resolveSuggestionFn, updateInvestorRecordFn } from "@/lib/investor-record.functions";
import { CLAIM_STATE_LABELS, SOURCE_LABELS, type EntrySource } from "@/lib/investor-record-model";
import { money, prettyStatus } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TABS = ["overview", "investment", "profile", "onboarding", "readiness", "documents", "activity"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/investor/$onboardingId")({
  head: () => ({ meta: [
    { title: "Investor Record — Harmonious" }, { name: "description", content: "Fund-scoped investor record: investment, profile, onboarding, readiness and activity." },
    { property: "og:title", content: "Investor Record — Harmonious" }, { property: "og:description", content: "Maintain a fund investor's canonical record." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => (TABS as readonly string[]).includes(String(s["tab"])) ? { tab: s["tab"] as Tab } : {},
  component: InvestorRecordPage,
});

function InvestorRecordPage() {
  const { fundId, onboardingId } = Route.useParams();
  const { tab: initial } = Route.useSearch();
  const [tab, setTab] = useState<Tab>(initial ?? "overview");
  const load = useServerFn(investorRecordDetailFn);
  const update = useServerFn(updateInvestorRecordFn);
  const resolve = useServerFn(resolveSuggestionFn);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["investor-record", onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  const [edit, setEdit] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setEdit((s) => ({ ...s, [k]: e.target.value }));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["investor-record", onboardingId] }); qc.invalidateQueries({ queryKey: ["fund-investor-records", fundId] }); };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading investor…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{(error as Error)?.message ?? "Investor not found."}</p>;
  const staff = data.viewer === "staff";
  const p = data.person; const inv = data.investment as any;
  const cents = (v?: string) => (v ? Math.round(Number(v.replace(/[$,\s]/g, "")) * 100) : undefined);

  const save = async (payload: any) => {
    try {
      const r = await update({ data: payload });
      toast.success(r.suggested ? `${r.changed} saved; ${r.suggested} sent to Harmonious for review because the investor supplied it.` : r.changed ? "Saved" : "No changes");
      setEdit({}); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const field = (k: string, label: string, cur: unknown, props: Record<string, unknown> = {}) => (
    <div className="space-y-1"><Label htmlFor={`ir-${k}`}>{label}</Label><Input id={`ir-${k}`} defaultValue={cur == null ? "" : String(cur)} onChange={set(k)} disabled={data.overview.removed} {...props} /></div>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><Link to="/manager/fund/$fundId/investors" params={{ fundId }} className="text-sm text-muted-foreground hover:underline">← {data.fund?.name ?? "Fund"} investors</Link>
          <h2 className="mt-1 text-xl">{data.overview.name}</h2>
          <p className="text-sm text-muted-foreground">{data.profile?.label ?? "No investing profile yet"} · {prettyStatus(data.overview.stage)} · Entered by {SOURCE_LABELS[data.overview.enteredBy as EntrySource] ?? "Investor"}{data.overview.investorConfirmedAt ? " · confirmed by investor" : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          {data.overview.removed ? <Badge variant="destructive">Removed from Fund</Badge> : null}
          <Badge variant={data.claimState === "prepared" ? "outline" : "secondary"}>{CLAIM_STATE_LABELS[data.claimState]}</Badge>
          {data.pendingReviewCount ? <Badge variant="secondary">{data.pendingReviewCount} awaiting Harmonious review</Badge> : null}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b pb-1">{TABS.map((t) => <Button key={t} size="sm" variant={t === tab ? "default" : "ghost"} className="shrink-0" onClick={() => setTab(t)}>{prettyStatus(t)}</Button>)}</div>

      {tab === "overview" ? <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Investment</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <p>Amount: {money(inv.amountCents)}</p><p>Commitment: {money(inv.commitmentCents)}</p>{staff ? <p>Accepted: {money(inv.acceptedCents)}</p> : null}<p>Funded: {money(inv.fundedCents)}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Readiness</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <p className="font-medium">{data.readiness.label}</p>{data.readiness.nextAction ? <p className="text-muted-foreground">Next: {data.readiness.nextAction}</p> : null}
          <p className="text-muted-foreground">{p?.verificationLabel}</p></CardContent></Card>
        {staff && data.suggestions.length ? <Card className="md:col-span-2"><CardHeader><CardTitle className="text-base">Information conflicts & suggested updates</CardTitle></CardHeader><CardContent className="divide-y">
          {data.suggestions.map((s) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div><p className="font-medium">{prettyStatus(s.field)}</p><p className="text-muted-foreground">Harmonious record: {JSON.stringify(s.current)} · {SOURCE_LABELS[s.source as EntrySource] ?? s.source}: {JSON.stringify(s.proposed)}{s.status === "review_later" ? " · marked for later" : ""}</p></div>
            <div className="flex gap-1">{(["accept", "reject", "review_later"] as const).map((a) => <Button key={a} size="sm" variant={a === "accept" ? "default" : "outline"} onClick={async () => { try { await resolve({ data: { id: s.id, action: a } }); toast.success("Recorded"); refresh(); } catch (e) { toast.error((e as Error).message); } }}>{a === "review_later" ? "Review later" : prettyStatus(a)}</Button>)}</div>
          </div>)}</CardContent></Card> : null}
      </div> : null}

      {tab === "investment" ? <Card><CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
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
        } })}>Save investment</Button>
      </CardContent></Card> : null}

      {tab === "profile" ? <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-base">Contact</CardTitle>
          {data.contactEditMode === "suggest" ? <p className="text-sm text-muted-foreground">This investor has claimed their record and supplies their own contact details. Your changes are sent to Harmonious as suggested updates; they don't overwrite what the investor entered.</p>
            : data.claimState === "prepared" ? <p className="text-sm text-muted-foreground">Prepared record: entered by {SOURCE_LABELS[data.overview.enteredBy as EntrySource] ?? "the Fund team"}, not by the investor. Nobody has access to it until the investor signs in with this email, and they'll be asked to confirm it.</p> : null}
        </CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          {field("firstName", "Legal first name", p?.firstName)}{field("middleName", "Middle name", p?.middleName)}{field("lastName", "Last name", p?.lastName)}{field("preferredName", "Preferred name", p?.preferredName)}
          {field("email", "Email", p?.email)}{field("phone", "Phone", p?.phone)}{field("citizenship", "Citizenship", p?.citizenship)}
          {staff ? field("dob", "Date of birth", (p as any)?.dateOfBirth, { type: "date" }) : null}
          {field("address1", "Residential address", p?.addressLine1)}{field("address2", "Address line 2", p?.addressLine2)}{field("city", "City", p?.city)}{field("region", "State / region", p?.region)}{field("postal", "Postal code", p?.postalCode)}{field("country", "Country", p?.country)}
          <Button className="sm:w-fit" disabled={data.overview.removed} onClick={() => save({ onboardingId, person: {
            firstName: edit['firstName'], middleName: edit['middleName'], lastName: edit['lastName'], preferredName: edit['preferredName'], email: edit['email'], phone: edit['phone'],
            citizenship: edit['citizenship'], dateOfBirth: staff ? edit['dob'] : undefined, addressLine1: edit['address1'], addressLine2: edit['address2'], city: edit['city'], region: edit['region'], postalCode: edit['postal'], country: edit['country'],
          } })}>{data.contactEditMode === "suggest" ? "Suggest change" : "Save contact"}</Button>
        </CardContent></Card>
        {data.profile ? <Card><CardHeader><CardTitle className="text-base">Investment Profile · {data.profile.typeLabel}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          {field("legalName", "Legal investor name", data.profile.legalName)}
          {data.profile.type === "entity" || data.profile.type === "trust" ? field("jurisdiction", "Jurisdiction", (data.profile.details as any).jurisdiction) : null}
          {data.profile.type === "ira" ? field("custodianName", "Custodian", (data.profile.details as any).custodianName) : null}
          <Button className="sm:w-fit" disabled={data.overview.removed} onClick={() => save({ onboardingId, profile: { legalName: edit['legalName'], details: Object.fromEntries(["jurisdiction", "custodianName"].filter((k) => edit[k] !== undefined).map((k) => [k, edit[k]!])) } })}>Save profile</Button>
          <div className="sm:col-span-2"><p className="text-sm font-medium">Owners, control persons & signers</p>
            {data.related.length ? <ul className="mt-1 space-y-1 text-sm">{data.related.map((r) => <li key={r.id}>{r.name} · {prettyStatus(r.role)}{r.ownershipPercent != null ? ` · ${r.ownershipPercent}%` : ""}{r.signer ? " · signer" : ""}{(r as any).underReview ? <span className="block text-xs text-muted-foreground">{RELATED_REVIEW_MESSAGE}</span> : null}</li>)}</ul> : <p className="text-sm text-muted-foreground">None recorded.</p>}</div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Tax IDs, tax forms, ID images and verification evidence are never shown here. The investor provides them securely.</p>
        </CardContent></Card> : null}
      </div> : null}

      {tab === "onboarding" ? <Card><CardContent className="space-y-1 pt-6 text-sm"><p>Stage: {prettyStatus(data.overview.stage)}</p><p>{p?.hasAccount ? "The investor has signed in." : "The investor hasn't signed in yet. When they sign in with this email or use the Fund's onboarding link, they continue this same investment."}</p><p>{data.overview.investorConfirmedAt ? "The investor confirmed the prepared information." : "Investor confirmation of prepared information is pending."}</p></CardContent></Card> : null}

      {tab === "readiness" ? <Card><CardHeader><CardTitle className="text-base">{data.readiness.label}</CardTitle></CardHeader><CardContent><ul className="divide-y text-sm">{data.readiness.stages.map((s: any) => <li key={s.key} className="flex justify-between py-2"><span>{s.label}</span><span className="text-muted-foreground">{prettyStatus(s.status)}</span></li>)}</ul>
        <Link to="/manager/fund/$fundId/readiness" params={{ fundId }} className="mt-3 inline-block text-sm text-primary hover:underline">Open Fund readiness</Link></CardContent></Card> : null}

      {tab === "documents" ? <div className="space-y-4"><InvestorRecordDocuments offeringId={fundId} onboardingId={onboardingId} /><Card><CardContent className="pt-6 text-sm text-muted-foreground">Values read from imported documents show up as suggested updates for Harmonious to review; they never overwrite this record automatically.
        <div className="mt-2"><Link to="/manager/fund/$fundId/documents" params={{ fundId }} className="text-primary hover:underline">Open Fund documents</Link></div></CardContent></Card></div> : null}

      {tab === "activity" ? <Card><CardContent className="pt-6">{data.activity.length ? <ul className="divide-y text-sm">{data.activity.map((a: any, i: number) => <li key={i} className="py-2"><p>{a.label}</p><p className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()} · {a.source}{a.field ? ` · ${a.field}: ${JSON.stringify(a.from)} → ${JSON.stringify(a.to)}` : ""}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No activity yet.</p>}</CardContent></Card> : null}
    </section>
  );
}
