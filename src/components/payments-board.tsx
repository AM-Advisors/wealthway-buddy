import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  decidePaymentInstruction,
  getPaymentDocumentUrl,
  listPaymentInstructions,
  updatePaymentChecks,
} from "@/lib/payment-controls.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Waiting on approvals",
  approved: "Approved to send",
  paused: "Paused",
  rejected: "Rejected",
};

const BANK_LABEL: Record<string, string> = {
  not_sent: "Not sent",
  sent: "Sent to the bank",
  settled: "Settled",
  returned: "Returned",
  rejected: "Rejected by the bank",
};

/** Every movement of money, the checks behind it and the two approvals it needs. */
export function PaymentsBoard({ purposes }: { purposes?: string[] } = {}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listPaymentInstructions);
  const setChecks = useServerFn(updatePaymentChecks);
  const decide = useServerFn(decidePaymentInstruction);
  const documentUrl = useServerFn(getPaymentDocumentUrl);

  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["payment-instructions"],
    queryFn: () => load({ data: {} }),
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["payment-instructions"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const checks = useMutation({
    mutationFn: (input: any) => setChecks({ data: input }),
    onSuccess: () => {
      toast.success("Checks updated.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That change didn't save."),
  });

  const decision = useMutation({
    mutationFn: (input: any) => decide({ data: input }),
    onSuccess: (result: any) => {
      toast.success(
        result?.status === "approved"
          ? "Approved and released to send."
          : `Recorded (${result?.approvals ?? 0} of ${result?.needed ?? 2} approvals).`,
      );
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That decision wasn't recorded."),
  });

  const rows = useMemo(() => {
    const all = (data?.instructions ?? []) as any[];
    const term = search.trim().toLowerCase();
    return all.filter((r) => {
      if (purposes && !purposes.includes(String(r.purpose))) return false;
      if (statusFilter === "open" && ["rejected"].includes(r.status)) return false;
      if (statusFilter === "awaiting" && r.status !== "awaiting_approval") return false;
      if (statusFilter === "approved" && r.status !== "approved") return false;
      if (statusFilter === "settled" && r.bank_status !== "settled") return false;
      if (!term) return true;
      return [r.clientName, r.fundName, r.invoiceNumber, r.beneficiary_name, r.purpose]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term));
    });
  }, [data, statusFilter, search, purposes]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading payments…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {(error as any)?.message ?? "This board isn't available to you."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Harmonious facilitates payments on instruction. Nothing leaves or is collected until the
            beneficiary is verified, compliance has cleared it and two authorised people have
            approved it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Label>Show</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="awaiting">Waiting on approvals</SelectItem>
                <SelectItem value="approved">Approved to send</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="all">Everything</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-64">
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client, fund or invoice"
            />
          </div>
          {!data?.canApprove ? (
            <p className="text-sm text-muted-foreground">
              You can view this queue. Approving a payment needs finance, operations, compliance or
              admin authority.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to show here.</p>
      ) : null}

      {rows.map((r) => {
        const needed = r.dual_approval_required ? 2 : 1;
        const note = notes[r.id] ?? "";
        return (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  {money(Number(r.amount_cents))} · {r.direction === "inbound" ? "Collect" : "Send"}
                </CardTitle>
                <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
                <Badge variant="outline">{BANK_LABEL[r.bank_status] ?? r.bank_status}</Badge>
                <Badge variant="outline">
                  {r.approvalCount} of {needed} approvals
                </Badge>
                {r.invoiceNumber ? <Badge variant="outline">{r.invoiceNumber}</Badge> : null}
              </div>
              <CardDescription>
                {[r.clientName, r.fundName, r.purpose].filter(Boolean).join(" · ")}
                {r.authorization_reference ? ` · ${r.authorization_reference}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <CheckSelect
                  label="Beneficiary verified"
                  value={r.verification_status}
                  options={[
                    ["pending", "Pending"],
                    ["verified", "Verified"],
                    ["failed", "Failed"],
                  ]}
                  onChange={(v) => checks.mutate({ id: r.id, verificationStatus: v })}
                />
                <CheckSelect
                  label="Callback"
                  value={r.callback_status}
                  options={[
                    ["not_required", "Not required"],
                    ["pending", "Pending"],
                    ["completed", "Completed"],
                    ["failed", "Failed"],
                  ]}
                  onChange={(v) => checks.mutate({ id: r.id, callbackStatus: v })}
                />
                <CheckSelect
                  label="Compliance"
                  value={r.compliance_status}
                  options={[
                    ["pending", "Pending"],
                    ["cleared", "Cleared"],
                    ["escalated", "Escalated"],
                  ]}
                  onChange={(v) => checks.mutate({ id: r.id, complianceStatus: v })}
                />
                <CheckSelect
                  label="Bank"
                  value={r.bank_status}
                  disabled={r.status !== "approved"}
                  options={[
                    ["not_sent", "Not sent"],
                    ["sent", "Sent"],
                    ["settled", "Settled"],
                    ["returned", "Returned"],
                    ["rejected", "Rejected"],
                  ]}
                  onChange={(v) => checks.mutate({ id: r.id, bankStatus: v })}
                />
              </div>

              {r.supporting_document_path ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res: any = await documentUrl({ data: { id: r.id } });
                      window.open(res.url, "_blank", "noopener");
                    } catch (e: any) {
                      toast.error(e?.message ?? "That document isn't available.");
                    }
                  }}
                >
                  Open supporting document
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">No supporting document attached.</p>
              )}

              {r.pause_reason ? (
                <p className="text-sm text-destructive">Paused: {r.pause_reason}</p>
              ) : null}

              {data?.canApprove && ["awaiting_approval", "paused"].includes(r.status) ? (
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea
                    value={note}
                    rows={2}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Required when pausing or rejecting"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => decision.mutate({ id: r.id, decision: "approved", note })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decision.mutate({ id: r.id, decision: "paused", note })}
                    >
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => decision.mutate({ id: r.id, decision: "rejected", note })}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : null}

              {(r.approvals ?? []).length ? (
                <ul className="text-xs text-muted-foreground">
                  {(r.approvals as any[]).map((a) => (
                    <li key={a.id}>
                      {a.decision} · {a.approver_role} ·{" "}
                      {new Date(a.created_at ?? Date.now()).toLocaleString()}
                      {a.note ? ` · ${a.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CheckSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled ?? false}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
