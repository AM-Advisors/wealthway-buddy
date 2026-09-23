import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  SECURITY_KINDS,
  STAKEHOLDER_TYPES,
  TRANSACTION_KINDS,
  issueCapSecurity,
  recordCapTransaction,
  saveCapStakeholder,
} from "@/lib/captable.functions";

import { fmtDate, fmtMoney, fmtNumber, useCapTable } from "./captable-context";
import { CapTableSection } from "./captable-states";

export function SecuritiesView() {
  return (
    <CapTableSection>
      <Body />
    </CapTableSection>
  );
}

function Body() {
  const { workspace, refetch } = useCapTable();
  const company = workspace!.company!;
  const canManage = workspace!.canManage;

  return (
    <div className="space-y-6">
      {!canManage ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Viewing only</CardTitle>
            <CardDescription>
              {company.isDemo
                ? "This is the demo company. Switch to your own company in Settings to record securities."
                : "Your account is set to view only. An authorised signatory on your account can record securities."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          <AddStakeholderDialog onDone={refetch} />
          <IssueSecurityDialog onDone={refetch} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security classes</CardTitle>
          <CardDescription>Classes, preferences and conversion terms on record</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Authorised</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Preference</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace!.classes.map((cls) => (
                  <TableRow key={cls.id}>
                    <TableCell className="font-medium">{cls.name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {cls.kind.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-right">{fmtNumber(cls.authorized)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(cls.pricePerShare, 4)}</TableCell>
                    <TableCell className="text-right">
                      {cls.liquidationPreference ? `${cls.liquidationPreference}×` : "—"}
                    </TableCell>
                    <TableCell className="text-right">{cls.conversionRatio}×</TableCell>
                  </TableRow>
                ))}
                {workspace!.classes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      No classes recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issued securities</CardTitle>
          <CardDescription>
            Each position links to the transactions behind it. Balances are worked out from that
            history, never overwritten.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace!.securities.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.label ?? "—"}</TableCell>
                    <TableCell>{s.stakeholder}</TableCell>
                    <TableCell>{s.securityLabel}</TableCell>
                    <TableCell className="text-right">{fmtNumber(s.quantity)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(s.issueDate)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <RecordTransactionDialog
                          securityId={s.id}
                          holder={s.stakeholder}
                          onDone={refetch}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {workspace!.securities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                      Nothing issued yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AddStakeholderDialog({ onDone }: { onDone: () => void }) {
  const { workspace } = useCapTable();
  const save = useServerFn(saveCapStakeholder);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", type: "investor", entityName: "", title: "" });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId: workspace!.company!.id,
          name: form.name,
          email: form.email || null,
          type: form.type,
          entityName: form.entityName || null,
          title: form.title || null,
        },
      }),
    onSuccess: () => {
      toast.success("Stakeholder added. This does not create any ownership — use Issue Security to record shares.");
      setForm({ name: "", email: "", type: "investor", entityName: "", title: "" });
      setOpen(false);
      onDone();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not add the stakeholder"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">+ Add Stakeholder</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a stakeholder</DialogTitle>
          <DialogDescription>Founders, employees, investors, funds and SPVs.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="sh-name">Name</Label>
            <Input id="sh-name" value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="sh-email">Email</Label>
            <Input id="sh-email" type="email" value={form.email} maxLength={200} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="sh-type">Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger id="sh-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAKEHOLDER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="sh-entity">Entity name (if applicable)</Label>
            <Input id="sh-entity" value={form.entityName} maxLength={200} onChange={(e) => setForm({ ...form, entityName: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="sh-title">Title or role</Label>
            <Input id="sh-title" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!form.name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Add stakeholder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IssueSecurityDialog({ onDone }: { onDone: () => void }) {
  const { workspace } = useCapTable();
  const issue = useServerFn(issueCapSecurity);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    stakeholderId: "",
    classId: "",
    roundId: "",
    securityType: "common",
    label: "",
    quantity: "",
    issueDate: new Date().toISOString().slice(0, 10),
    purchasePrice: "",
    exercisePrice: "",
    principal: "",
    transferRestrictions: "",
    notes: "",
  });

  const isConvertible = form.securityType === "safe" || form.securityType === "note";

  const mutation = useMutation({
    mutationFn: () =>
      issue({
        data: {
          companyId: workspace!.company!.id,
          stakeholderId: form.stakeholderId,
          classId: form.classId || null,
          roundId: form.roundId || null,
          securityType: form.securityType,
          label: form.label || null,
          quantity: Number(form.quantity || 0),
          issueDate: form.issueDate || null,
          purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
          exercisePrice: form.exercisePrice ? Number(form.exercisePrice) : null,
          principal: form.principal ? Number(form.principal) : null,
          transferRestrictions: form.transferRestrictions || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Security recorded");
      setOpen(false);
      onDone();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not record the security"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Issue Security</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record an issuance</DialogTitle>
          <DialogDescription>
            This writes a dated transaction to the ledger and shows in the audit history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="is-holder">Stakeholder</Label>
            <Select value={form.stakeholderId} onValueChange={(v) => setForm({ ...form, stakeholderId: v })}>
              <SelectTrigger id="is-holder">
                <SelectValue placeholder="Choose a stakeholder" />
              </SelectTrigger>
              <SelectContent>
                {workspace!.stakeholders.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="is-type">Security</Label>
              <Select value={form.securityType} onValueChange={(v) => setForm({ ...form, securityType: v })}>
                <SelectTrigger id="is-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECURITY_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="is-label">Reference</Label>
              <Input id="is-label" value={form.label} maxLength={60} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="is-class">Class</Label>
              <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v })}>
                <SelectTrigger id="is-class">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {workspace!.classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="is-round">Round</Label>
              <Select value={form.roundId} onValueChange={(v) => setForm({ ...form, roundId: v })}>
                <SelectTrigger id="is-round">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {workspace!.rounds.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isConvertible ? (
              <div>
                <Label htmlFor="is-principal">Principal</Label>
                <Input id="is-principal" inputMode="decimal" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
              </div>
            ) : (
              <div>
                <Label htmlFor="is-qty">Quantity</Label>
                <Input id="is-qty" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            )}
            <div>
              <Label htmlFor="is-date">Issue date</Label>
              <Input id="is-date" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="is-price">Purchase price</Label>
              <Input id="is-price" inputMode="decimal" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="is-strike">Exercise price</Label>
              <Input id="is-strike" inputMode="decimal" value={form.exercisePrice} onChange={(e) => setForm({ ...form, exercisePrice: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="is-restrict">Transfer restrictions</Label>
            <Input id="is-restrict" value={form.transferRestrictions} maxLength={500} onChange={(e) => setForm({ ...form, transferRestrictions: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="is-notes">Notes</Label>
            <Textarea id="is-notes" value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!form.stakeholderId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Recording…" : "Record issuance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordTransactionDialog({
  securityId,
  holder,
  onDone,
}: {
  securityId: string;
  holder: string;
  onDone: () => void;
}) {
  const { workspace } = useCapTable();
  const record = useServerFn(recordCapTransaction);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    kind: "cancellation",
    quantity: "",
    effectiveDate: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      record({
        data: {
          companyId: workspace!.company!.id,
          securityId,
          kind: form.kind,
          quantity: Number(form.quantity || 0),
          effectiveDate: form.effectiveDate,
          reason: form.reason,
        },
      }),
    onSuccess: () => {
      toast.success("Transaction recorded");
      setOpen(false);
      onDone();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not record the transaction"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Record change
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a change</DialogTitle>
          <DialogDescription>{holder}'s position. The reason is kept on the record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="tx-kind">Type</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger id="tx-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tx-qty">Quantity</Label>
            <Input id="tx-qty" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="tx-date">Effective date</Label>
            <Input id="tx-date" type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="tx-reason">Reason</Label>
            <Textarea id="tx-reason" value={form.reason} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!form.quantity || form.reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Recording…" : "Record change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
