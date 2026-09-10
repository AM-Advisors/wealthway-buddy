import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BankFeedPanel } from "@/components/bank-feed-panel";
import { WireTrackingPanel } from "@/components/wire-tracking-panel";
import { ScopeSection } from "@/components/fund-scope-section";
import { useFundScope } from "@/lib/fund-scope";
import {
  listManagedWireInstructions,
  saveManagedWireInstructions,
} from "@/lib/wire-instructions.functions";
import { BANK_CHOICES, getFundEntity, requestBankSetup } from "@/lib/fund-entity.functions";

const FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "bank_name", label: "Receiving bank" },
  { key: "bank_address", label: "Bank address" },
  { key: "account_name", label: "Account name" },
  { key: "account_number", label: "Account number" },
  { key: "routing_number", label: "Routing number (ABA)" },
  { key: "swift", label: "SWIFT / BIC", hint: "International wires only" },
  { key: "memo", label: "Reference / memo" },
];

const empty = Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Record<string, string>;

/**
 * Everything banking for one fund: entering the account details, asking
 * Harmonious to help open an account, the connected account and its deposits,
 * and the wires investors have sent.
 */
export function FundBanking({ fundId, backTo }: { fundId: string; backTo: "admin" | "manager" }) {
  const scope = useFundScope(fundId);
  const queryClient = useQueryClient();

  const loadWire = useServerFn(listManagedWireInstructions);
  const saveWire = useServerFn(saveManagedWireInstructions);
  const loadEntity = useServerFn(getFundEntity);
  const requestBank = useServerFn(requestBankSetup);

  const wireQuery = useQuery({
    queryKey: ["managed-wire-instructions"],
    queryFn: () => loadWire(),
    retry: false,
  });
  const entityQuery = useQuery({
    queryKey: ["fund-entity", fundId],
    queryFn: () => loadEntity({ data: { offering_id: fundId } }),
    retry: false,
  });

  const fund = useMemo(
    () => ((wireQuery.data as any)?.funds ?? []).find((f: any) => f.id === fundId) ?? null,
    [wireQuery.data, fundId],
  );

  const [form, setForm] = useState<Record<string, string>>(empty);
  const [confirmAccount, setConfirmAccount] = useState("");
  const [bank, setBank] = useState("");
  const [bankNote, setBankNote] = useState("");

  useEffect(() => {
    if (!fund) return;
    setForm({ ...empty, ...(fund.wire_instructions ?? {}) });
    setConfirmAccount("");
  }, [fund]);

  const saved = (fund?.wire_instructions ?? {}) as Record<string, string>;
  const hasInstructions = Object.values(saved).some((v) => String(v ?? "").trim() !== "");
  const accountChanged = (form["account_number"] ?? "") !== (saved["account_number"] ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      saveWire({
        data: {
          offering_id: fundId,
          bank_name: form["bank_name"] ?? "",
          bank_address: form["bank_address"] ?? "",
          account_name: form["account_name"] ?? "",
          account_number: form["account_number"] ?? "",
          routing_number: form["routing_number"] ?? "",
          swift: form["swift"] ?? "",
          memo: form["memo"] ?? "",
        } as any,
      }),
    onSuccess: () => {
      toast.success("Banking details saved. The change is recorded in the fund's history.");
      setConfirmAccount("");
      void queryClient.invalidateQueries({ queryKey: ["managed-wire-instructions"] });
      void queryClient.invalidateQueries({ queryKey: ["fund-page", fundId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save those details."),
  });

  const bankMutation = useMutation({
    mutationFn: () =>
      requestBank({ data: { offering_id: fundId, bank: bank as any, note: bankNote } as any }),
    onSuccess: () => {
      toast.success("Sent to Harmonious. Operations will follow up with next steps.");
      setBankNote("");
      void queryClient.invalidateQueries({ queryKey: ["fund-entity", fundId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not send that request."),
  });

  const bankRequests = ((entityQuery.data as any)?.bankRequests ?? []) as any[];
  const canEdit = Boolean((wireQuery.data as any)?.canEdit);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Fund banking</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Enter the fund&apos;s receiving account yourself, or ask Harmonious to help open one.
            Harmonious facilitates payments and recordkeeping; it is not a bank, custodian or
            escrow agent.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          {backTo === "admin" ? (
            <Link to="/admin/fund/$fundId" params={{ fundId }}>
              Back to the fund
            </Link>
          ) : (
            <Link to="/manager/fund/$fundId" params={{ fundId }}>
              Back to the fund
            </Link>
          )}
        </Button>
      </div>

      <div className="mt-6 space-y-6">
        <ScopeSection scope={scope} section="banking" offeringId={fundId} label="Bank account">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enter the account details</CardTitle>
                <CardDescription>
                  These are the instructions investors see when they fund.
                  {hasInstructions ? "" : " Nothing is saved for this fund yet."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {FIELDS.map((field) => (
                  <div key={field.key} className="grid gap-1.5">
                    <Label htmlFor={`bank-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`bank-${field.key}`}
                      value={form[field.key] ?? ""}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                    {field.hint && (
                      <p className="text-xs text-muted-foreground">{field.hint}</p>
                    )}
                  </div>
                ))}

                {accountChanged && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="bank-confirm">Re-type the account number to confirm</Label>
                    <Input
                      id="bank-confirm"
                      value={confirmAccount}
                      onChange={(e) => setConfirmAccount(e.target.value)}
                    />
                  </div>
                )}

                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={
                    !canEdit ||
                    saveMutation.isPending ||
                    (accountChanged && confirmAccount.trim() !== (form["account_number"] ?? "").trim())
                  }
                >
                  {saveMutation.isPending ? "Saving…" : "Save banking details"}
                </Button>

                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
                  Harmonious never changes these details by email. Investors are told to confirm
                  instructions by phone with a known contact before sending funds. Every change is
                  written to the fund&apos;s history with who made it and what it replaced.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Apply through Harmonious</CardTitle>
                <CardDescription>
                  Ask the Harmonious team to help open the fund&apos;s account. They coordinate with
                  the bank; the bank decides and holds the funds.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-1.5">
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
                <div className="grid gap-1.5">
                  <Label htmlFor="bank-request-note">Anything we should know (optional)</Label>
                  <Textarea
                    id="bank-request-note"
                    rows={3}
                    value={bankNote}
                    onChange={(e) => setBankNote(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => bankMutation.mutate()}
                  disabled={!bank || bankMutation.isPending}
                >
                  {bankMutation.isPending ? "Sending…" : "Ask Harmonious to open it"}
                </Button>

                {bankRequests.length > 0 && (
                  <ul className="grid gap-2">
                    {bankRequests.map((r) => (
                      <li key={r.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {BANK_CHOICES.find((b) => b.value === r.bank)?.label ?? r.bank}
                          </p>
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
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Requested {new Date(r.created_at).toLocaleDateString()}
                          {r.requested_by_email ? ` by ${r.requested_by_email}` : ""}
                        </p>
                        {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                        {r.review_note && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Operations: {r.review_note}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <BankFeedPanel fundId={fundId} />
          </div>
        </ScopeSection>

        <ScopeSection scope={scope} section="wires" offeringId={fundId} label="Wire tracking">
          <WireTrackingPanel offeringId={fundId} />
        </ScopeSection>
      </div>
    </main>
  );
}
