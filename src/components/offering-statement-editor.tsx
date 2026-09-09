import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getOfferingStatementForEdit,
  saveOfferingStatement,
} from "@/lib/offering-statement.functions";

type Draft = {
  headline: string;
  summary: string;
  security_type: string;
  target_raise: string;
  min_investment: string;
  max_investment: string;
  management_fee: string;
  carried_interest: string;
  preferred_return: string;
  fund_term_years: string;
  investment_period_years: string;
  first_closing_date: string;
  final_closing_date: string;
  capital_call_terms: string;
  distribution_policy: string;
  fees_and_expenses: string;
  transfer_restrictions: string;
  reporting: string;
  other_terms: string;
};

const blank: Draft = {
  headline: "",
  summary: "",
  security_type: "",
  target_raise: "",
  min_investment: "",
  max_investment: "",
  management_fee: "",
  carried_interest: "",
  preferred_return: "",
  fund_term_years: "",
  investment_period_years: "",
  first_closing_date: "",
  final_closing_date: "",
  capital_call_terms: "",
  distribution_policy: "",
  fees_and_expenses: "",
  transfer_restrictions: "",
  reporting: "",
  other_terms: "",
};

const TEXT_SECTIONS: Array<{ key: keyof Draft; label: string; hint: string }> = [
  {
    key: "capital_call_terms",
    label: "Capital calls",
    hint: "How and when investors are asked to send money.",
  },
  {
    key: "distribution_policy",
    label: "Distributions",
    hint: "How profits are shared and in what order.",
  },
  {
    key: "fees_and_expenses",
    label: "Fees and expenses",
    hint: "Anything charged to the fund beyond the headline fee.",
  },
  {
    key: "transfer_restrictions",
    label: "Transfers and withdrawals",
    hint: "Whether an interest can be sold or redeemed, and how.",
  },
  { key: "reporting", label: "Reporting", hint: "What investors receive and how often." },
  { key: "other_terms", label: "Other terms", hint: "Anything else investors should know." },
];

function moneyToCents(value: string): number | null {
  const clean = value.replace(/[^0-9.]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function centsToMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return String(cents / 100);
}

function percentToBps(value: string): number | null {
  const clean = value.replace(/[^0-9.]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function bpsToPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "";
  return String(bps / 100);
}

function numOrNull(value: string): number | null {
  const clean = value.replace(/[^0-9.]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function OfferingStatementEditor({ offeringId }: { offeringId?: string }) {
  const load = useServerFn(getOfferingStatementForEdit);
  const save = useServerFn(saveOfferingStatement);

  const [fundId, setFundId] = useState<string | null>(offeringId ?? null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["offering-statement-edit", fundId],
    queryFn: () => load({ data: { offering_id: fundId } }),
  });

  const selectedId = data?.selected?.id ?? null;

  useEffect(() => {
    if (!data) return;
    const s: any = data.statement ?? {};
    setDraft({
      headline: s.headline ?? "",
      summary: s.summary ?? "",
      security_type: s.security_type ?? "",
      target_raise: centsToMoney(s.target_raise_cents),
      min_investment: centsToMoney(s.min_investment_cents),
      max_investment: centsToMoney(s.max_investment_cents),
      management_fee: bpsToPercent(s.management_fee_bps),
      carried_interest: bpsToPercent(s.carried_interest_bps),
      preferred_return: bpsToPercent(s.preferred_return_bps),
      fund_term_years: s.fund_term_years === null ? "" : String(s.fund_term_years ?? ""),
      investment_period_years:
        s.investment_period_years === null ? "" : String(s.investment_period_years ?? ""),
      first_closing_date: s.first_closing_date ?? "",
      final_closing_date: s.final_closing_date ?? "",
      capital_call_terms: s.capital_call_terms ?? "",
      distribution_policy: s.distribution_policy ?? "",
      fees_and_expenses: s.fees_and_expenses ?? "",
      transfer_restrictions: s.transfer_restrictions ?? "",
      reporting: s.reporting ?? "",
      other_terms: s.other_terms ?? "",
    });
    setPublished(Boolean(s.is_published));
  }, [data]);

  async function submit(nextPublished: boolean) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await save({
        data: {
          offering_id: selectedId,
          headline: draft.headline,
          summary: draft.summary,
          security_type: draft.security_type,
          target_raise_cents: moneyToCents(draft.target_raise),
          min_investment_cents: moneyToCents(draft.min_investment),
          max_investment_cents: moneyToCents(draft.max_investment),
          management_fee_bps: percentToBps(draft.management_fee),
          carried_interest_bps: percentToBps(draft.carried_interest),
          preferred_return_bps: percentToBps(draft.preferred_return),
          fund_term_years: numOrNull(draft.fund_term_years),
          investment_period_years: numOrNull(draft.investment_period_years),
          first_closing_date: draft.first_closing_date || null,
          final_closing_date: draft.final_closing_date || null,
          capital_call_terms: draft.capital_call_terms,
          distribution_policy: draft.distribution_policy,
          fees_and_expenses: draft.fees_and_expenses,
          transfer_restrictions: draft.transfer_restrictions,
          reporting: draft.reporting,
          other_terms: draft.other_terms,
          is_published: nextPublished,
        },
      });
      setPublished(nextPublished);
      toast.success(
        nextPublished
          ? "Offering terms saved and visible in the diligence room"
          : "Offering terms saved as a draft",
      );
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the offering terms.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const funds = data?.funds ?? [];
  if (funds.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          You are not assigned to a fund yet, so there are no offering terms to enter.
        </CardContent>
      </Card>
    );
  }

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <div className="space-y-6">
      {!offeringId && funds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {funds.map((fund: any) => (
            <Button
              key={fund.id}
              size="sm"
              variant={selectedId === fund.id ? "default" : "outline"}
              onClick={() => setFundId(fund.id)}
            >
              {fund.name}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{data?.selected?.name ?? "Offering statement"}</CardTitle>
            <CardDescription>
              The terms of the offering, shown to investors in the due diligence room.
              {data?.statement?.updated_at
                ? ` Last saved ${new Date(data.statement.updated_at).toLocaleString()}.`
                : ""}
            </CardDescription>
          </div>
          <Badge variant={published ? "default" : "secondary"}>
            {published ? "Visible to investors" : "Draft — only your team"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="os-headline">Headline</Label>
            <Input
              id="os-headline"
              maxLength={200}
              placeholder="One line describing the offering"
              {...field("headline")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="os-summary">Summary</Label>
            <Textarea id="os-summary" rows={4} maxLength={8000} {...field("summary")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="os-security">What investors receive</Label>
              <Input
                id="os-security"
                placeholder="e.g. Limited partnership interests"
                {...field("security_type")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-target">Target raise (USD)</Label>
              <Input id="os-target" inputMode="decimal" {...field("target_raise")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-min">Minimum investment (USD)</Label>
              <Input id="os-min" inputMode="decimal" {...field("min_investment")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-max">Maximum investment (USD)</Label>
              <Input id="os-max" inputMode="decimal" {...field("max_investment")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-fee">Management fee (%)</Label>
              <Input id="os-fee" inputMode="decimal" {...field("management_fee")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-carry">Carried interest (%)</Label>
              <Input id="os-carry" inputMode="decimal" {...field("carried_interest")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-pref">Preferred return (%)</Label>
              <Input id="os-pref" inputMode="decimal" {...field("preferred_return")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-term">Fund term (years)</Label>
              <Input id="os-term" inputMode="decimal" {...field("fund_term_years")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-invper">Investment period (years)</Label>
              <Input id="os-invper" inputMode="decimal" {...field("investment_period_years")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-first">First closing date</Label>
              <Input id="os-first" type="date" {...field("first_closing_date")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os-final">Final closing date</Label>
              <Input id="os-final" type="date" {...field("final_closing_date")} />
            </div>
          </div>

          {TEXT_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-2">
              <Label htmlFor={`os-${section.key}`}>{section.label}</Label>
              <p className="text-xs text-muted-foreground">{section.hint}</p>
              <Textarea
                id={`os-${section.key}`}
                rows={4}
                maxLength={8000}
                {...field(section.key)}
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
            <div className="flex items-center gap-3">
              <Switch
                id="os-published"
                checked={published}
                onCheckedChange={(v) => setPublished(Boolean(v))}
              />
              <Label htmlFor="os-published" className="text-sm font-normal">
                Show these terms in the fund's due diligence room
              </Label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void submit(false)}>
                Save draft
              </Button>
              <Button disabled={busy} onClick={() => void submit(true)}>
                {busy ? "Saving…" : "Save and publish"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
