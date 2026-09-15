import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  HOLDER_TYPES,
  SECURITY_TYPES,
  decideTransfer,
  getFounderCapTable,
  importCapTable,
  requestTransfer,
  saveHolding,
  saveStakeholder,
} from "@/lib/founder-cap-table.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function num(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function pct(value: number) {
  if (!value) return "0%";
  return `${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}%`;
}

/** Very small CSV reader: header row plus comma-separated values. */
function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

export function FounderCapTable({ clientId }: { clientId?: string | null }) {
  const load = useServerFn(getFounderCapTable);
  const addStakeholder = useServerFn(saveStakeholder);
  const addHolding = useServerFn(saveHolding);
  const upload = useServerFn(importCapTable);
  const askTransfer = useServerFn(requestTransfer);
  const decide = useServerFn(decideTransfer);
  const queryClient = useQueryClient();
  const queryKey = ["founder-cap-table", clientId ?? "default"];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => load({ data: { clientId: clientId ?? null } }),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey });

  const [holder, setHolder] = useState({
    name: "",
    email: "",
    holder_type: "individual",
    notes: "",
  });
  const [shares, setShares] = useState({
    stakeholder_id: "",
    security_type: "common",
    share_class: "",
    quantity: "",
    price: "",
    issued_on: "",
    certificate_no: "",
  });
  const [transfer, setTransfer] = useState({
    holding_id: "",
    to_stakeholder_id: "",
    to_name: "",
    to_email: "",
    quantity: "",
    reason: "",
  });
  const [csv, setCsv] = useState("");

  const stakeholders = (data?.stakeholders ?? []) as any[];
  const holdings = (data?.holdings ?? []) as any[];
  const transfers = (data?.transfers ?? []) as any[];
  const canEdit = Boolean(data?.canEdit);
  const canApprove = Boolean(data?.canApprove);
  const plan = data?.plan ?? null;
  const activeClientId = data?.clientId ?? null;

  const nameById = useMemo(
    () => new Map(stakeholders.map((s) => [String(s.id), String(s.name)])),
    [stakeholders],
  );

  const ownership = useMemo(() => {
    const outstanding = holdings.filter((h) => h.status === "outstanding");
    const total = outstanding.reduce((sum, h) => sum + Number(h.quantity ?? 0), 0);
    const byHolder = new Map<string, number>();
    for (const h of outstanding) {
      const key = String(h.stakeholder_id);
      byHolder.set(key, (byHolder.get(key) ?? 0) + Number(h.quantity ?? 0));
    }
    const rows = [...byHolder.entries()]
      .map(([id, qty]) => ({
        id,
        name: nameById.get(id) ?? "Unknown holder",
        quantity: qty,
        pct: total ? (qty / total) * 100 : 0,
      }))
      .sort((a, b) => b.quantity - a.quantity);
    return { total, rows };
  }, [holdings, nameById]);

  const stakeholderMutation = useMutation({
    mutationFn: (input: any) => addStakeholder({ data: input }),
    onSuccess: () => {
      toast.success("Stakeholder saved.");
      setHolder({ name: "", email: "", holder_type: "individual", notes: "" });
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const holdingMutation = useMutation({
    mutationFn: (input: any) => addHolding({ data: input }),
    onSuccess: () => {
      toast.success("Shares recorded.");
      setShares({
        stakeholder_id: "",
        security_type: "common",
        share_class: "",
        quantity: "",
        price: "",
        issued_on: "",
        certificate_no: "",
      });
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const uploadMutation = useMutation({
    mutationFn: (input: any) => upload({ data: input }),
    onSuccess: (result: any) => {
      toast.success(`Added ${result.holdings} holdings for ${result.holders} new holders.`);
      setCsv("");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not upload."),
  });

  const transferMutation = useMutation({
    mutationFn: (input: any) => askTransfer({ data: input }),
    onSuccess: () => {
      toast.success("Transfer sent for approval.");
      setTransfer({
        holding_id: "",
        to_stakeholder_id: "",
        to_name: "",
        to_email: "",
        quantity: "",
        reason: "",
      });
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not send."),
  });

  const decideMutation = useMutation({
    mutationFn: (input: any) => decide({ data: input }),
    onSuccess: () => {
      toast.success("Transfer decided.");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not decide."),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your cap table…</p>;
  }

  if (!activeClientId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No company linked yet</CardTitle>
          <CardDescription>
            Ask your Harmonious contact to attach your sign-in to your company record.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cap table management</CardTitle>
          <CardDescription>
            This service is not currently included in your active scope. Request service.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const pending = transfers.filter((t) => t.status === "pending");
  const limit = plan.stakeholders;
  const used = stakeholders.length;

  function submitUpload() {
    const parsed = parseCsv(csv);
    if (parsed.length === 0) {
      toast.error("Add a header row and at least one line of holders.");
      return;
    }
    const rows = parsed
      .map((r) => ({
        name: r["name"] ?? r["stakeholder"] ?? "",
        email: r["email"] ?? null,
        holder_type: r["holder type"] ?? r["holder_type"] ?? null,
        security_type: r["security type"] ?? r["security_type"] ?? r["type"] ?? null,
        share_class: r["share class"] ?? r["share_class"] ?? r["class"] ?? null,
        quantity: Number((r["quantity"] ?? r["shares"] ?? "0").replace(/,/g, "")),
        price_per_share_cents: r["price per share"]
          ? Math.round(Number(r["price per share"]!.replace(/[$,]/g, "")) * 100)
          : null,
        issued_on: r["issued on"] || r["issued_on"] || null,
        certificate_no: r["certificate"] || null,
      }))
      .filter((r) => r.name && Number.isFinite(r.quantity) && r.quantity >= 0);
    if (rows.length === 0) {
      toast.error("Each line needs a name and a share quantity.");
      return;
    }
    uploadMutation.mutate({ clientId: activeClientId, rows });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Plan</CardDescription>
            <CardTitle className="text-xl">{plan.label}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stakeholders</CardDescription>
            <CardTitle className="text-xl">
              {used}
              {limit != null ? <span className="text-muted-foreground"> / {limit}</span> : null}
            </CardTitle>
          </CardHeader>
          {limit != null ? (
            <CardContent>
              <Progress value={Math.min(100, (used / limit) * 100)} className="h-2" />
            </CardContent>
          ) : null}
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Shares outstanding</CardDescription>
            <CardTitle className="text-xl">{num(ownership.total)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Transfers awaiting approval</CardDescription>
            <CardTitle className="text-xl">{pending.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="ownership">
        <TabsList className="flex-wrap">
          <TabsTrigger value="ownership">Ownership</TabsTrigger>
          <TabsTrigger value="shares">Shares</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="transfers">
            Transfers{pending.length ? ` (${pending.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="certificates">Certificates &amp; access</TabsTrigger>
        </TabsList>


        <TabsContent value="ownership" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who owns what</CardTitle>
              <CardDescription>
                Built from the outstanding holdings on record. Harmonious keeps the record; it is
                not a transfer agent or valuation agent.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {ownership.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No shares recorded yet. Add them under Shares or Upload.
                </p>
              ) : (
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Holder</th>
                      <th className="py-2 pr-3 font-medium">Shares</th>
                      <th className="py-2 pr-3 font-medium">Ownership</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownership.rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{row.name}</td>
                        <td className="py-2 pr-3">{num(row.quantity)}</td>
                        <td className="py-2 pr-3">{pct(row.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-medium">
                      <td className="py-2 pr-3">Total</td>
                      <td className="py-2 pr-3">{num(ownership.total)}</td>
                      <td className="py-2 pr-3">100%</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shares" className="mt-4 space-y-4">
          {canEdit ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Add a stakeholder</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="holder-name">Name</Label>
                      <Input
                        id="holder-name"
                        value={holder.name}
                        onChange={(e) => setHolder({ ...holder, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="holder-email">Email</Label>
                      <Input
                        id="holder-email"
                        value={holder.email}
                        onChange={(e) => setHolder({ ...holder, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="holder-type">Type</Label>
                    <select
                      id="holder-type"
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                      value={holder.holder_type}
                      onChange={(e) => setHolder({ ...holder, holder_type: e.target.value })}
                    >
                      {HOLDER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    disabled={!holder.name.trim() || stakeholderMutation.isPending}
                    onClick={() =>
                      stakeholderMutation.mutate({
                        clientId: activeClientId,
                        name: holder.name,
                        email: holder.email || null,
                        holder_type: holder.holder_type,
                        notes: holder.notes || null,
                      })
                    }
                  >
                    Save stakeholder
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Record shares</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="share-holder">Stakeholder</Label>
                    <select
                      id="share-holder"
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                      value={shares.stakeholder_id}
                      onChange={(e) => setShares({ ...shares, stakeholder_id: e.target.value })}
                    >
                      <option value="">Choose a holder</option>
                      {stakeholders.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="share-type">Security</Label>
                      <select
                        id="share-type"
                        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                        value={shares.security_type}
                        onChange={(e) => setShares({ ...shares, security_type: e.target.value })}
                      >
                        {SECURITY_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="share-class">Class</Label>
                      <Input
                        id="share-class"
                        value={shares.share_class}
                        placeholder="Class A"
                        onChange={(e) => setShares({ ...shares, share_class: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="share-qty">Quantity</Label>
                      <Input
                        id="share-qty"
                        inputMode="decimal"
                        value={shares.quantity}
                        onChange={(e) => setShares({ ...shares, quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="share-price">Price per share ($)</Label>
                      <Input
                        id="share-price"
                        inputMode="decimal"
                        value={shares.price}
                        onChange={(e) => setShares({ ...shares, price: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="share-date">Issued on</Label>
                      <Input
                        id="share-date"
                        type="date"
                        value={shares.issued_on}
                        onChange={(e) => setShares({ ...shares, issued_on: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="share-cert">Certificate</Label>
                      <Input
                        id="share-cert"
                        value={shares.certificate_no}
                        onChange={(e) => setShares({ ...shares, certificate_no: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button
                    disabled={
                      !shares.stakeholder_id ||
                      !shares.quantity.trim() ||
                      holdingMutation.isPending
                    }
                    onClick={() => {
                      const qty = Number(shares.quantity);
                      if (!Number.isFinite(qty) || qty < 0) {
                        toast.error("Quantity must be a positive number.");
                        return;
                      }
                      holdingMutation.mutate({
                        clientId: activeClientId,
                        stakeholder_id: shares.stakeholder_id,
                        security_type: shares.security_type,
                        share_class: shares.share_class || null,
                        quantity: qty,
                        price_per_share_cents: shares.price
                          ? Math.round(Number(shares.price) * 100)
                          : null,
                        issued_on: shares.issued_on || null,
                        certificate_no: shares.certificate_no || null,
                      });
                    }}
                  >
                    Record shares
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your access is view only. Ask a signatory on your account to make changes.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Holdings on record</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {holdings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Holder</th>
                      <th className="py-2 pr-3 font-medium">Security</th>
                      <th className="py-2 pr-3 font-medium">Class</th>
                      <th className="py-2 pr-3 font-medium">Quantity</th>
                      <th className="py-2 pr-3 font-medium">Issued</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{nameById.get(String(h.stakeholder_id))}</td>
                        <td className="py-2 pr-3">
                          {SECURITY_TYPES.find((t) => t.value === h.security_type)?.label ??
                            h.security_type}
                        </td>
                        <td className="py-2 pr-3">{h.share_class ?? "—"}</td>
                        <td className="py-2 pr-3">{num(Number(h.quantity ?? 0))}</td>
                        <td className="py-2 pr-3">{h.issued_on ?? "—"}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={h.status === "outstanding" ? "secondary" : "outline"}>
                            {h.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload shares</CardTitle>
              <CardDescription>
                Use a spreadsheet saved as CSV with the columns: name, email, security type, share
                class, quantity, price per share, issued on, certificate. Existing holders are
                matched by email or name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="file"
                accept=".csv,text/csv"
                disabled={!canEdit}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setCsv(await file.text());
                }}
              />
              <Textarea
                rows={8}
                value={csv}
                disabled={!canEdit}
                placeholder="name,email,security type,share class,quantity,price per share,issued on"
                onChange={(e) => setCsv(e.target.value)}
              />
              <Button disabled={!canEdit || !csv.trim() || uploadMutation.isPending} onClick={submitUpload}>
                {uploadMutation.isPending ? "Uploading…" : "Upload shares"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers" className="mt-4 space-y-4">
          {canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Request a transfer</CardTitle>
                <CardDescription>
                  A signatory on your account approves it before the cap table moves.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="tr-holding">Holding</Label>
                    <select
                      id="tr-holding"
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                      value={transfer.holding_id}
                      onChange={(e) => setTransfer({ ...transfer, holding_id: e.target.value })}
                    >
                      <option value="">Choose a holding</option>
                      {holdings
                        .filter((h) => h.status === "outstanding")
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {nameById.get(String(h.stakeholder_id))} — {num(Number(h.quantity))}{" "}
                            {h.share_class ?? h.security_type}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="tr-to">To an existing holder</Label>
                    <select
                      id="tr-to"
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                      value={transfer.to_stakeholder_id}
                      onChange={(e) =>
                        setTransfer({ ...transfer, to_stakeholder_id: e.target.value })
                      }
                    >
                      <option value="">New holder…</option>
                      {stakeholders.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!transfer.to_stakeholder_id ? (
                    <>
                      <div>
                        <Label htmlFor="tr-name">New holder name</Label>
                        <Input
                          id="tr-name"
                          value={transfer.to_name}
                          onChange={(e) => setTransfer({ ...transfer, to_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="tr-email">New holder email</Label>
                        <Input
                          id="tr-email"
                          value={transfer.to_email}
                          onChange={(e) => setTransfer({ ...transfer, to_email: e.target.value })}
                        />
                      </div>
                    </>
                  ) : null}
                  <div>
                    <Label htmlFor="tr-qty">Quantity</Label>
                    <Input
                      id="tr-qty"
                      inputMode="decimal"
                      value={transfer.quantity}
                      onChange={(e) => setTransfer({ ...transfer, quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tr-reason">Reason</Label>
                    <Input
                      id="tr-reason"
                      value={transfer.reason}
                      onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })}
                    />
                  </div>
                </div>
                <Button
                  disabled={
                    !transfer.holding_id || !transfer.quantity.trim() || transferMutation.isPending
                  }
                  onClick={() => {
                    const qty = Number(transfer.quantity);
                    if (!Number.isFinite(qty) || qty <= 0) {
                      toast.error("Quantity must be a positive number.");
                      return;
                    }
                    transferMutation.mutate({
                      clientId: activeClientId,
                      holding_id: transfer.holding_id,
                      to_stakeholder_id: transfer.to_stakeholder_id || null,
                      to_name: transfer.to_name || null,
                      to_email: transfer.to_email || null,
                      quantity: qty,
                      reason: transfer.reason || null,
                    });
                  }}
                >
                  Send for approval
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transfers</CardTitle>
              <CardDescription>
                {canApprove
                  ? "You can approve or decline transfers on this account."
                  : "Only signatories on your account can approve a transfer."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transfers yet.</p>
              ) : (
                transfers.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {num(Number(t.quantity))} from{" "}
                        {nameById.get(String(t.from_stakeholder_id)) ?? "—"} to{" "}
                        {t.to_stakeholder_id
                          ? (nameById.get(String(t.to_stakeholder_id)) ?? "—")
                          : (t.to_name ?? "a new holder")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.reason ?? "No reason given"} ·{" "}
                        {new Date(t.created_at).toLocaleDateString()}
                        {t.decision_note ? ` · ${t.decision_note}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={t.status === "pending" ? "secondary" : "outline"}>
                        {t.status}
                      </Badge>
                      {t.status === "pending" && canApprove ? (
                        <>
                          <Button
                            size="sm"
                            disabled={decideMutation.isPending}
                            onClick={() =>
                              decideMutation.mutate({
                                clientId: activeClientId,
                                id: t.id,
                                decision: "approved",
                              })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={decideMutation.isPending}
                            onClick={() =>
                              decideMutation.mutate({
                                clientId: activeClientId,
                                id: t.id,
                                decision: "rejected",
                              })
                            }
                          >
                            Decline
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificates" className="mt-4">
          <CapCertificatesPanel clientId={activeClientId} stakeholders={stakeholders} />
        </TabsContent>
      </Tabs>

    </div>
  );
}
