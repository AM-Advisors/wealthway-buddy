import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BANK_CHOICES,
  getFundEntity,
  generateSs4,
  getSs4Url,
  requestBankSetup,
  saveFundEntity,
  updateBankSetupStatus,
} from "@/lib/fund-entity.functions";

const FUND_TYPES = ["SPV", "Private Equity", "Venture Capital", "Family Office", "Hedge Fund", "Other"] as const;
const ENTITY_TYPES = ["LLC", "LP", "GP", "Series LLC", "Master LLC"] as const;

const ENTITY_KINDS = [
  { value: "sole_proprietor", label: "Sole proprietor" },
  { value: "partnership", label: "Partnership" },
  { value: "corporation", label: "Corporation" },
  { value: "personal_service_corp", label: "Personal service corporation" },
  { value: "trust", label: "Trust" },
  { value: "estate", label: "Estate" },
  { value: "other", label: "Other" },
];

const REASONS = [
  { value: "started_business", label: "Started a new business" },
  { value: "banking_purpose", label: "Banking purpose" },
  { value: "hired_employees", label: "Hired employees" },
  { value: "compliance", label: "Compliance with IRS withholding rules" },
  { value: "changed_type", label: "Changed type of organization" },
  { value: "purchased_business", label: "Purchased a going business" },
  { value: "created_trust", label: "Created a trust" },
  { value: "created_pension", label: "Created a pension plan" },
  { value: "other", label: "Other" },
];

const ACTIVITIES = [
  { value: "finance_insurance", label: "Finance & insurance" },
  { value: "real_estate", label: "Real estate" },
  { value: "rental_leasing", label: "Rental & leasing" },
  { value: "health_care", label: "Health care & social assistance" },
  { value: "construction", label: "Construction" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "transportation", label: "Transportation & warehousing" },
  { value: "accommodation_food", label: "Accommodation & food service" },
  { value: "retail", label: "Retail" },
  { value: "wholesale_agent", label: "Wholesale — agent/broker" },
  { value: "wholesale_other", label: "Wholesale — other" },
  { value: "other", label: "Other" },
];

const BANK_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  in_progress: "In progress",
  opened: "Account opened",
  cancelled: "Cancelled",
};

type Ss4State = Record<string, string | boolean>;

const emptySs4: Ss4State = {
  legal_name: "",
  trade_name: "",
  care_of: "",
  mailing_street: "",
  mailing_city_state_zip: "",
  street_address: "",
  street_city_state_zip: "",
  county_state: "",
  responsible_party_name: "",
  responsible_party_tin: "",
  is_llc: true,
  llc_members: "",
  llc_us_organized: true,
  entity_kind: "partnership",
  entity_detail: "",
  state_incorporated: "",
  reason: "banking_purpose",
  reason_detail: "",
  date_started: "",
  closing_month: "December",
  employees_agricultural: "0",
  employees_household: "0",
  employees_other: "0",
  first_wages_date: "",
  principal_activity: "finance_insurance",
  principal_activity_other: "",
  principal_line: "",
  previous_ein_applied: false,
  previous_ein: "",
  designee_name: "",
  designee_phone: "",
  designee_address: "",
  designee_fax: "",
  applicant_name_title: "",
  applicant_phone: "",
  applicant_fax: "",
};

export function FundEntityCard({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundEntity);
  const save = useServerFn(saveFundEntity);
  const makeForm = useServerFn(generateSs4);
  const openForm = useServerFn(getSs4Url);
  const requestBank = useServerFn(requestBankSetup);
  const setBankStatus = useServerFn(updateBankSetupStatus);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["fund-entity", fundId],
    queryFn: () => load({ data: { offering_id: fundId } }),
    retry: false,
  });

  const [entity, setEntity] = useState({
    legal_entity_name: "",
    fund_type: "" as string,
    fund_type_other: "",
    entity_type: "" as string,
    state_formed: "",
    date_formed: "",
  });
  const [hasEin, setHasEin] = useState(true);
  const [ein, setEin] = useState("");
  const [ss4, setSs4] = useState<Ss4State>(emptySs4);
  const [bank, setBank] = useState<string>("");
  const [bankNote, setBankNote] = useState("");
  const [wantsHarmoniousBank, setWantsHarmoniousBank] = useState(false);

  const data = query.data as any;

  useEffect(() => {
    if (!data) return;
    const o = data.offering ?? {};
    setEntity({
      legal_entity_name: o.legal_entity_name ?? "",
      fund_type: o.fund_type ?? "",
      fund_type_other: o.fund_type_other ?? "",
      entity_type: o.entity_type ?? "",
      state_formed: o.state_formed ?? "",
      date_formed: o.date_formed ?? "",
    });
    setHasEin(Boolean(data.details?.has_ein));
    setEin(data.details?.ein ?? "");
    setSs4({ ...emptySs4, ...(data.details?.ss4 ?? {}) } as Ss4State);
  }, [data]);

  const bankRequests = useMemo(() => (data?.bankRequests ?? []) as any[], [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          offering_id: fundId,
          legal_entity_name: entity.legal_entity_name.trim(),
          fund_type: (entity.fund_type || null) as any,
          fund_type_other: entity.fund_type_other.trim(),
          entity_type: (entity.entity_type || null) as any,
          state_formed: entity.state_formed.trim(),
          date_formed: entity.date_formed.trim() || null,
          has_ein: hasEin,
          ein: hasEin ? ein.trim() : "",
          ss4: ss4 as any,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Entity details saved.");
      void queryClient.invalidateQueries({ queryKey: ["fund-entity", fundId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save those details."),
  });

  const ss4Mutation = useMutation({
    mutationFn: () => makeForm({ data: { offering_id: fundId } }),
    onSuccess: (result: any) => {
      if (result?.url) window.open(result.url, "_blank", "noopener");
      toast.success("Form SS-4 generated. Print, sign and file it with the IRS.");
      void queryClient.invalidateQueries({ queryKey: ["fund-entity", fundId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not generate the form."),
  });

  const openMutation = useMutation({
    mutationFn: () => openForm({ data: { offering_id: fundId } }),
    onSuccess: (result: any) => {
      if (result?.url) window.open(result.url, "_blank", "noopener");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not open the form."),
  });

  const bankMutation = useMutation({
    mutationFn: () =>
      requestBank({ data: { offering_id: fundId, bank: bank as any, note: bankNote.trim() } }),
    onSuccess: () => {
      setBankNote("");
      toast.success("Request sent to the Harmonious team.");
      void queryClient.invalidateQueries({ queryKey: ["fund-entity", fundId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not send that request."),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      setBankStatus({ data: { id: vars.id, offering_id: fundId, status: vars.status as any } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fund-entity", fundId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not update that."),
  });

  const field = (key: string, label: string, placeholder?: string) => (
    <div className="grid gap-2">
      <Label htmlFor={`ss4-${key}`}>{label}</Label>
      <Input
        id={`ss4-${key}`}
        value={String(ss4[key] ?? "")}
        placeholder={placeholder ?? ""}
        onChange={(e) => setSs4((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  );

  if (query.isLoading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Entity and banking</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Entity and banking</CardTitle>
          <CardDescription>
            {query.error instanceof Error ? query.error.message : "These details are not available."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Entity and banking</CardTitle>
        <CardDescription>
          Who the fund legally is, its tax ID, and how its bank account gets opened. Tax details are
          kept private and are only visible to you and this fund&apos;s managers.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="legal-entity-name">Legal entity name</Label>
            <Input
              id="legal-entity-name"
              value={entity.legal_entity_name}
              placeholder="Harmonious Growth Fund II, LLC"
              onChange={(e) => setEntity({ ...entity, legal_entity_name: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type of fund</Label>
              <Select
                value={entity.fund_type}
                onValueChange={(v) => setEntity({ ...entity, fund_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {FUND_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Entity type</Label>
              <Select
                value={entity.entity_type}
                onValueChange={(v) => setEntity({ ...entity, entity_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {entity.fund_type === "Other" && (
            <div className="grid gap-2">
              <Label htmlFor="fund-type-other">Describe the type of fund</Label>
              <Input
                id="fund-type-other"
                value={entity.fund_type_other}
                onChange={(e) => setEntity({ ...entity, fund_type_other: e.target.value })}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="state-formed">State formed</Label>
              <Input
                id="state-formed"
                value={entity.state_formed}
                placeholder="Delaware"
                onChange={(e) => setEntity({ ...entity, state_formed: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date-formed">Date formed</Label>
              <Input
                id="date-formed"
                type="date"
                value={entity.date_formed}
                onChange={(e) => setEntity({ ...entity, date_formed: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <p className="text-sm font-medium">Tax ID / EIN</p>
          <div className="mt-3 grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={hasEin} onCheckedChange={(v) => setHasEin(Boolean(v))} />
              This entity already has an EIN
            </label>
            {hasEin ? (
              <div className="grid max-w-xs gap-2">
                <Label htmlFor="ein">EIN</Label>
                <Input
                  id="ein"
                  value={ein}
                  placeholder="12-3456789"
                  onChange={(e) => setEin(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  Answer the questions below and we will fill in the official IRS Form SS-4 for you to
                  print, sign and file. Harmonious does not file the form with the IRS on your behalf.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("legal_name", "Legal name of entity (line 1)")}
                  {field("trade_name", "Trade name, if different (line 2)")}
                  {field("care_of", "Executor, trustee or “care of” name (line 3)")}
                  {field("county_state", "County and state of the business (line 6)")}
                  {field("mailing_street", "Mailing address (line 4a)")}
                  {field("mailing_city_state_zip", "City, state, ZIP (line 4b)")}
                  {field("street_address", "Street address, if different (line 5a)")}
                  {field("street_city_state_zip", "City, state, ZIP (line 5b)")}
                  {field("responsible_party_name", "Responsible party (line 7a)")}
                  {field("responsible_party_tin", "Their SSN, ITIN or EIN (line 7b)")}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={Boolean(ss4["is_llc"])}
                      onCheckedChange={(v) => setSs4((p) => ({ ...p, is_llc: Boolean(v) }))}
                    />
                    This is a limited liability company (line 8a)
                  </label>
                  {Boolean(ss4["is_llc"]) && field("llc_members", "Number of LLC members (line 8b)")}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Type of entity (line 9a)</Label>
                    <Select
                      value={String(ss4["entity_kind"] ?? "")}
                      onValueChange={(v) => setSs4((p) => ({ ...p, entity_kind: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTITY_KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {field("entity_detail", "Details for that choice, if any")}
                  <div className="grid gap-2">
                    <Label>Reason for applying (line 10)</Label>
                    <Select
                      value={String(ss4["reason"] ?? "")}
                      onValueChange={(v) => setSs4((p) => ({ ...p, reason: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {field("reason_detail", "Details for that reason, if any")}
                  {field("state_incorporated", "State or country of incorporation (line 9b)")}
                  {field("date_started", "Date the business started (line 11)", "01/31/2026")}
                  {field("closing_month", "Closing month of accounting year (line 12)", "December")}
                  {field("employees_other", "Employees expected in 12 months (line 13)", "0")}
                  {field("first_wages_date", "First date wages paid (line 15)")}
                  <div className="grid gap-2">
                    <Label>Principal activity (line 16)</Label>
                    <Select
                      value={String(ss4["principal_activity"] ?? "")}
                      onValueChange={(v) => setSs4((p) => ({ ...p, principal_activity: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIVITIES.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {String(ss4["principal_activity"]) === "other" &&
                    field("principal_activity_other", "Describe the activity")}
                  {field("principal_line", "Main products or services (line 17)")}
                  {field("designee_name", "Third party designee, if any (optional)")}
                  {field("designee_phone", "Designee phone")}
                  {field("applicant_name_title", "Name and title of the signer (line 18)")}
                  {field("applicant_phone", "Applicant phone number")}
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(ss4["previous_ein_applied"])}
                    onCheckedChange={(v) =>
                      setSs4((p) => ({ ...p, previous_ein_applied: Boolean(v) }))
                    }
                  />
                  This entity has applied for an EIN before
                </label>
                {Boolean(ss4["previous_ein_applied"]) && field("previous_ein", "Previous EIN")}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => ss4Mutation.mutate()}
                    disabled={ss4Mutation.isPending}
                  >
                    {ss4Mutation.isPending ? "Preparing…" : "Generate SS-4"}
                  </Button>
                  {data?.details?.has_ss4_file && (
                    <Button
                      variant="ghost"
                      onClick={() => openMutation.mutate()}
                      disabled={openMutation.isPending}
                    >
                      Open the saved form
                    </Button>
                  )}
                  {data?.details?.ss4_generated_at && (
                    <span className="text-xs text-muted-foreground">
                      Last prepared {new Date(data.details.ss4_generated_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Save your answers first — the form is built from the saved details.
                </p>
                {data?.details?.withOperations && (
                  <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                    The tax ID and Form SS-4 are with the operations team for review. They become
                    available here once approved.
                    {data.details.review_note ? ` Note: ${data.details.review_note}` : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border p-4">
          <p className="text-sm font-medium">Banking</p>
          <div className="mt-3 grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={wantsHarmoniousBank}
                onCheckedChange={(v) => setWantsHarmoniousBank(Boolean(v))}
              />
              Have Harmonious open the fund&apos;s bank account
            </label>
            {wantsHarmoniousBank && (
              <div className="grid gap-3">
                <div className="grid max-w-sm gap-2">
                  <Label>Bank</Label>
                  <Select value={bank} onValueChange={setBank}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANK_CHOICES.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bank-note">Anything we should know (optional)</Label>
                  <Textarea
                    id="bank-note"
                    rows={3}
                    value={bankNote}
                    onChange={(e) => setBankNote(e.target.value)}
                  />
                </div>
                <div>
                  <Button
                    variant="outline"
                    onClick={() => bankMutation.mutate()}
                    disabled={!bank || bankMutation.isPending}
                  >
                    {bankMutation.isPending ? "Sending…" : "Ask Harmonious to open it"}
                  </Button>
                </div>
              </div>
            )}

            {bankRequests.length > 0 && (
              <ul className="grid gap-2">
                {bankRequests.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {BANK_CHOICES.find((b) => b.value === r.bank)?.label ?? r.bank}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested {new Date(r.created_at).toLocaleDateString()}
                        {r.requested_by_email ? ` by ${r.requested_by_email}` : ""}
                      </p>
                      {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                      {r.review_note && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Operations: {r.review_note}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          r.review_status === "approved"
                            ? "default"
                            : r.review_status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.review_status === "approved"
                          ? "Approved by operations"
                          : r.review_status === "rejected"
                            ? "Sent back"
                            : "With operations"}
                      </Badge>
                      <Badge variant={r.status === "opened" ? "default" : "secondary"}>
                        {BANK_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                      <Select
                        value={r.status}
                        onValueChange={(v) => statusMutation.mutate({ id: r.id, status: v })}
                      >
                        <SelectTrigger className="h-8 w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(BANK_STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save entity details"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
