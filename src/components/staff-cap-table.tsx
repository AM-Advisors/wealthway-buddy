import { useMemo, useState } from "react";

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getStaffCapTables,
  staffCancelCertificate,
  staffCreateCertificate,
  staffIssueCertificate,
} from "@/lib/staff-cap-table.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const num = (v: any) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
const money = (cents: any) =>
  cents == null
    ? "—"
    : (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (v: any) => (v ? new Date(v).toLocaleDateString() : "—");

const STATUS_TONE: Record<string, string> = {
  issued: "default",
  draft: "secondary",
  cancelled: "destructive",
  replaced: "outline",
  closed: "outline",
  outstanding: "default",
  pending: "secondary",
  approved: "default",
  declined: "destructive",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={(STATUS_TONE[status] ?? "secondary") as any}>{status}</Badge>;
}

export function StaffCapTable() {
  const load = useServerFn(getStaffCapTables);
  const createCert = useServerFn(staffCreateCertificate);
  const issueCert = useServerFn(staffIssueCertificate);
  const cancelCert = useServerFn(staffCancelCertificate);
  const qc = useQueryClient();

  const [clientId, setClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [issuing, setIssuing] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState<any | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [reason, setReason] = useState("");
  const [reissue, setReissue] = useState(true);

  const queryKey = ["staff-cap-tables", clientId ?? "first"];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => load({ data: { clientId } }),
  });

  const selected = data?.selectedId ?? null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["staff-cap-tables"] });
  };

  const stakeholderName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of data?.stakeholders ?? []) map.set(String(s.id), String(s.name));
    return map;
  }, [data]);

  const holdingLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of data?.holdings ?? []) {
      map.set(
        String(h.id),
        `${stakeholderName.get(String(h.stakeholder_id)) ?? "Unknown holder"} · ${num(h.quantity)} ${h.security_type}`,
      );
    }
    return map;
  }, [data, stakeholderName]);

  const liveCertByHolding = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of data?.certificates ?? []) {
      if (["draft", "issued"].includes(String(c.status))) map.set(String(c.holding_id), c);
    }
    return map;
  }, [data]);

  const create = useMutation({
    mutationFn: (holdingId: string) =>
      createCert({ data: { clientId: selected!, holdingId } }),
    onSuccess: (r: any) => {
      toast.success(`Draft certificate ${r?.certificate_no ?? ""} created.`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't work."),
  });

  const issue = useMutation({
    mutationFn: () =>
      issueCert({
        data: {
          clientId: selected!,
          id: issuing.id,
          signerName,
          signerTitle: signerTitle || null,
          instruction,
        },
      }),
    onSuccess: () => {
      toast.success("Certificate issued.");
      setIssuing(null);
      setSignerName("");
      setSignerTitle("");
      setInstruction("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't work."),
  });

  const cancel = useMutation({
    mutationFn: () =>
      cancelCert({ data: { clientId: selected!, id: cancelling.id, reason, reissue } }),
    onSuccess: (r: any) => {
      toast.success(
        r?.replacement
          ? `Cancelled and replaced with ${r.replacement.certificate_no}.`
          : "Certificate cancelled.",
      );
      setCancelling(null);
      setReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't work."),
  });

  const clients = (data?.clients ?? []).filter(
    (c: any) =>
      !search.trim() ||
      `${c.clientName} ${c.companyName ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const current = (data?.clients ?? []).find((c: any) => c.clientId === selected);
  const canIssue = Boolean(data?.canIssue);

  const outstanding = (data?.holdings ?? []).filter((h: any) => h.status === "outstanding");
  const totalShares = outstanding.reduce((s: number, h: any) => s + Number(h.quantity ?? 0), 0);
  const drafts = (data?.certificates ?? []).filter((c: any) => c.status === "draft").length;
  const pendingTransfers = (data?.transfers ?? []).filter((t: any) => t.status === "pending").length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Client cap tables</h1>
          <p className="text-sm text-muted-foreground">
            Each client's shareholders, share records, certificates and transfers. Harmonious keeps
            the record; the company's own signatory is named on every certificate issued.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Back</Link>
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">{(error as any)?.message ?? "Couldn't load."}</p>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a client"
            />
            <div className="space-y-1">
              {clients.length === 0 && (
                <p className="text-sm text-muted-foreground">No cap table clients yet.</p>
              )}
              {clients.map((c: any) => (
                <button
                  key={c.clientId}
                  type="button"
                  onClick={() => setClientId(c.clientId)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                    c.clientId === selected ? "border-primary bg-muted" : ""
                  }`}
                >
                  <span className="block font-medium">{c.clientName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.holdings} record{c.holdings === 1 ? "" : "s"} · {num(c.shares)} shares
                    {c.setupComplete ? "" : " · setup pending"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {!selected && (
              <p className="text-sm text-muted-foreground">
                Select a client to see their cap table.
              </p>
            )}

            {selected && (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Shareholders" value={String((data.stakeholders ?? []).length)} />
                  <Stat label="Shares outstanding" value={num(totalShares)} />
                  <Stat label="Certificates awaiting issue" value={String(drafts)} />
                  <Stat label="Transfers pending" value={String(pendingTransfers)} />
                </div>

                {current?.companyName && (
                  <p className="text-sm text-muted-foreground">
                    Company of record: {current.companyName}
                  </p>
                )}
                {!canIssue && (
                  <p className="text-sm text-muted-foreground">
                    You can view these records. Issuing or cancelling a certificate needs admin,
                    operations, legal or fund administration authority.
                  </p>
                )}

                <Tabs defaultValue="shares">
                  <TabsList className="flex w-full flex-wrap justify-start">
                    <TabsTrigger value="shares">Shares</TabsTrigger>
                    <TabsTrigger value="certificates">Certificates</TabsTrigger>
                    <TabsTrigger value="transfers">Transfers</TabsTrigger>
                    <TabsTrigger value="holders">Shareholders</TabsTrigger>
                  </TabsList>

                  <TabsContent value="shares" className="space-y-3 pt-4">
                    {(data.holdings ?? []).length === 0 && <Empty text="No shares recorded yet." />}
                    {(data.holdings ?? []).map((h: any) => {
                      const cert = liveCertByHolding.get(String(h.id));
                      return (
                        <Card key={h.id}>
                          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                            <div className="space-y-1 text-sm">
                              <p className="font-medium">
                                {stakeholderName.get(String(h.stakeholder_id)) ?? "Unknown holder"}
                              </p>
                              <p className="text-muted-foreground">
                                {num(h.quantity)} {h.security_type}
                                {h.share_class ? ` · ${h.share_class}` : ""} ·{" "}
                                {money(h.price_per_share_cents)} per share
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Issued {day(h.issued_on)} · recorded {day(h.created_at)} ·{" "}
                                {h.source ?? "portal"}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge status={String(h.status)} />
                              {cert ? (
                                <Badge variant="outline">
                                  {cert.certificate_no} · {cert.status}
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canIssue || create.isPending}
                                  onClick={() => create.mutate(String(h.id))}
                                >
                                  Create certificate
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </TabsContent>

                  <TabsContent value="certificates" className="space-y-3 pt-4">
                    {(data.certificates ?? []).length === 0 && (
                      <Empty text="No certificates yet." />
                    )}
                    {(data.certificates ?? []).map((c: any) => (
                      <Card key={c.id}>
                        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                          <div className="space-y-1 text-sm">
                            <p className="font-medium">{c.certificate_no}</p>
                            <p className="text-muted-foreground">
                              {holdingLabel.get(String(c.holding_id)) ?? "Share record removed"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {c.signed_at
                                ? `Signed by ${c.signer_name}${c.signer_title ? `, ${c.signer_title}` : ""} on ${day(c.signed_at)}`
                                : `Created ${day(c.created_at)}`}
                              {c.cancelled_at
                                ? ` · cancelled ${day(c.cancelled_at)}: ${c.cancelled_reason}`
                                : ""}
                              {c.file_name ? ` · signed copy ${c.file_name}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={String(c.status)} />
                            {c.status === "draft" && (
                              <Button
                                size="sm"
                                disabled={!canIssue}
                                onClick={() => setIssuing(c)}
                              >
                                Issue
                              </Button>
                            )}
                            {["draft", "issued"].includes(String(c.status)) && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!canIssue}
                                onClick={() => {
                                  setCancelling(c);
                                  setReissue(true);
                                }}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>

                  <TabsContent value="transfers" className="space-y-3 pt-4">
                    {(data.transfers ?? []).length === 0 && <Empty text="No transfers yet." />}
                    {(data.transfers ?? []).map((t: any) => (
                      <Card key={t.id}>
                        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                          <div className="space-y-1 text-sm">
                            <p className="font-medium">
                              {stakeholderName.get(String(t.from_stakeholder_id)) ?? "Holder"} →{" "}
                              {stakeholderName.get(String(t.to_stakeholder_id)) ??
                                t.to_name ??
                                "New holder"}
                            </p>
                            <p className="text-muted-foreground">
                              {num(t.quantity)} shares ·{" "}
                              {holdingLabel.get(String(t.holding_id)) ?? "record removed"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Requested {day(t.created_at)}
                              {t.decided_at ? ` · decided ${day(t.decided_at)}` : ""}
                              {t.reason ? ` · ${t.reason}` : ""}
                              {t.decision_note ? ` · ${t.decision_note}` : ""}
                            </p>
                          </div>
                          <StatusBadge status={String(t.status)} />
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>

                  <TabsContent value="holders" className="space-y-3 pt-4">
                    {(data.stakeholders ?? []).length === 0 && (
                      <Empty text="No shareholders recorded yet." />
                    )}
                    {(data.stakeholders ?? []).map((s: any) => {
                      const shares = outstanding
                        .filter((h: any) => String(h.stakeholder_id) === String(s.id))
                        .reduce((sum: number, h: any) => sum + Number(h.quantity ?? 0), 0);
                      return (
                        <Card key={s.id}>
                          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                            <div>
                              <p className="font-medium">{s.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {s.email || "No email"} · {s.holder_type}
                              </p>
                            </div>
                            <span className="text-muted-foreground">
                              {num(shares)} shares
                              {totalShares > 0
                                ? ` · ${((shares / totalShares) * 100).toFixed(2)}%`
                                : ""}
                            </span>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
      )}

      <Dialog open={Boolean(issuing)} onOpenChange={(o) => !o && setIssuing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue {issuing?.certificate_no}</DialogTitle>
            <DialogDescription>
              Name the company signatory who authorised this certificate and record the instruction
              you received. Harmonious issues it on their behalf.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="issue-signer">Company signatory</Label>
              <Input
                id="issue-signer"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-title">Their title</Label>
              <Input
                id="issue-title"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="Chief Executive Officer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-instruction">Instruction on file</Label>
              <Textarea
                id="issue-instruction"
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Email from the signatory dated…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={
                issue.isPending || signerName.trim().length < 2 || instruction.trim().length < 3
              }
              onClick={() => issue.mutate()}
            >
              Issue certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelling)} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {cancelling?.certificate_no}</DialogTitle>
            <DialogDescription>
              The cancelled certificate stays on the record with your reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">Reason</Label>
              <Textarea
                id="cancel-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={reissue}
                onChange={(e) => setReissue(e.target.checked)}
              />
              <span>Replace it with a fresh draft certificate for the same shares</span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={cancel.isPending || reason.trim().length < 3}
              onClick={() => cancel.mutate()}
            >
              Cancel certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
