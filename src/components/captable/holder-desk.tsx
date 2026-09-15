import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  decideCapExercise,
  getCapHolderDesk,
  saveHolderPermissions,
  setHolderEmail,
} from "@/lib/captable-equity.functions";
import { computeVesting } from "@/lib/vesting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { fmtDate, fmtMoney, fmtNumber, useCapTable } from "./captable-context";
import { CapTableEmpty, CapTableSection } from "./captable-states";

type Audience = "employee" | "investor";

const PERMISSION_FIELDS = [
  { key: "canViewHoldings", label: "Their own holdings" },
  { key: "canViewVesting", label: "Vesting progress" },
  { key: "canViewTransactions", label: "Their transaction history" },
  { key: "canViewDocuments", label: "Documents on their records" },
  { key: "canViewCompanySummary", label: "Company ownership summary" },
  { key: "canViewValuations", label: "Valuations" },
  { key: "canViewTaxDocuments", label: "Tax records" },
  { key: "canRequestExercise", label: "Can request an exercise" },
] as const;

type PermissionKey = (typeof PERMISSION_FIELDS)[number]["key"];

export function HolderDesk({ audience }: { audience: Audience }) {
  return (
    <CapTableSection>
      <HolderDeskInner audience={audience} />
    </CapTableSection>
  );
}

function HolderDeskInner({ audience }: { audience: Audience }) {
  const { workspace } = useCapTable();
  const companyId = workspace?.company?.id as string;
  const load = useServerFn(getCapHolderDesk);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["captable-holder-desk", companyId, audience],
    queryFn: () => load({ data: { companyId, audience } }),
    enabled: Boolean(companyId),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["captable-holder-desk", companyId, audience] });

  const isEmployee = audience === "employee";
  const pending = (data?.exerciseRequests ?? []).filter((r) => r.status === "pending");

  if (isLoading) {
    return (
      <CapTableEmpty title="Loading" body="Fetching the records for this company." />
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isEmployee ? "Employee equity" : "Investor management"}
          </CardTitle>
          <CardDescription>
            {isEmployee
              ? "Every grant, its vesting, whether the holder has accepted it and what they can see in their own portal."
              : "Every investor position, the documents behind it and exactly what each investor can see in their own portal."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat label={isEmployee ? "People with equity" : "Investors"} value={fmtNumber(data?.holders.length ?? 0)} />
          <Stat
            label={isEmployee ? "Grants recorded" : "Positions recorded"}
            value={fmtNumber((data?.holders ?? []).reduce((sum, h) => sum + h.grants.length, 0))}
          />
          <Stat label="Portal accounts linked" value={fmtNumber((data?.holders ?? []).filter((h) => h.linked).length)} />
        </CardContent>
      </Card>

      <Tabs defaultValue="holders">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="holders">{isEmployee ? "People" : "Investors"}</TabsTrigger>
          {isEmployee ? (
            <TabsTrigger value="requests">
              Exercise requests{pending.length ? ` (${pending.length})` : ""}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="holders" className="mt-4 space-y-4">
          {(data?.holders ?? []).length === 0 ? (
            <CapTableEmpty
              title={isEmployee ? "No employee equity yet" : "No investors recorded yet"}
              body={
                isEmployee
                  ? "Add people and issue their grants from the Securities page; they appear here with their vesting."
                  : "Add investors and record their holdings from the Securities page; they appear here with their positions."
              }
            />
          ) : (
            (data?.holders ?? []).map((holder) => (
              <HolderCard
                key={holder.id}
                holder={holder}
                companyId={companyId}
                canManage={Boolean(data?.canManage)}
                onChanged={refresh}
              />
            ))
          )}
        </TabsContent>

        {isEmployee ? (
          <TabsContent value="requests" className="mt-4">
            <ExerciseQueue
              requests={data?.exerciseRequests ?? []}
              canManage={Boolean(data?.canManage)}
              onChanged={refresh}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

type Holder = Awaited<ReturnType<typeof getCapHolderDesk>>["holders"][number];

function HolderCard({
  holder,
  companyId,
  canManage,
  onChanged,
}: {
  holder: Holder;
  companyId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [permsOpen, setPermsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const totals = useMemo(() => {
    let vested = 0;
    let unvested = 0;
    let quantity = 0;
    for (const grant of holder.grants) {
      const v = computeVesting(grant.quantity, grant.schedule);
      vested += v.vested;
      unvested += v.unvested;
      quantity += grant.quantity;
    }
    return { vested, unvested, quantity };
  }, [holder.grants]);

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {holder.name}
              <Badge variant="outline" className="capitalize">
                {holder.stakeholderType.replace(/_/g, " ")}
              </Badge>
              {holder.linked ? (
                <Badge variant="secondary">Portal linked</Badge>
              ) : holder.email ? (
                <Badge variant="outline">Invited</Badge>
              ) : (
                <Badge variant="outline">No portal access</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {[holder.title, holder.entityName, holder.email].filter(Boolean).join(" · ") ||
                "No contact details recorded"}
            </CardDescription>
          </div>
          {canManage ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
                Portal access
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPermsOpen(true)}>
                What they can see
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total granted" value={fmtNumber(totals.quantity)} />
          <Stat label="Vested" value={fmtNumber(totals.vested)} />
          <Stat label="Unvested" value={fmtNumber(totals.unvested)} />
        </div>

        {holder.grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No securities recorded for this person yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Security</th>
                  <th className="py-2 pr-3">Quantity</th>
                  <th className="py-2 pr-3">Vested</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Issued</th>
                  <th className="py-2">Accepted</th>
                </tr>
              </thead>
              <tbody>
                {holder.grants.map((grant) => {
                  const v = computeVesting(grant.quantity, grant.schedule);
                  return (
                    <tr key={grant.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium capitalize">
                          {grant.securityType.replace(/_/g, " ")}
                        </span>
                        {grant.label ? (
                          <span className="block text-xs text-muted-foreground">{grant.label}</span>
                        ) : null}
                        {grant.roundName ? (
                          <span className="block text-xs text-muted-foreground">{grant.roundName}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">{fmtNumber(grant.quantity)}</td>
                      <td className="py-2 pr-3">
                        {grant.schedule ? (
                          <>
                            {fmtNumber(v.vested)}
                            <span className="block text-xs text-muted-foreground">
                              {v.percent.toFixed(0)}% · {grant.schedule.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">No vesting</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {grant.exercisePrice !== null
                          ? fmtMoney(grant.exercisePrice, 4)
                          : grant.purchasePrice !== null
                            ? fmtMoney(grant.purchasePrice, 4)
                            : "—"}
                      </td>
                      <td className="py-2 pr-3">{fmtDate(grant.issueDate)}</td>
                      <td className="py-2">
                        {grant.acceptedAt ? (
                          <span className="text-xs">
                            {fmtDate(grant.acceptedAt)}
                            <span className="block text-muted-foreground">{grant.acceptanceName}</span>
                          </span>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <PermissionsDialog
        open={permsOpen}
        onOpenChange={setPermsOpen}
        holder={holder}
        companyId={companyId}
        onSaved={onChanged}
      />
      <PortalAccessDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        holder={holder}
        companyId={companyId}
        onSaved={onChanged}
      />
    </Card>
  );
}

function PermissionsDialog({
  open,
  onOpenChange,
  holder,
  companyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  holder: Holder;
  companyId: string;
  onSaved: () => void;
}) {
  const save = useServerFn(saveHolderPermissions);
  const [values, setValues] = useState<Record<PermissionKey, boolean>>(() => {
    const base = {} as Record<PermissionKey, boolean>;
    for (const field of PERMISSION_FIELDS) base[field.key] = holder.permissions[field.key];
    return base;
  });
  const [notes, setNotes] = useState(holder.permissions.notes ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          stakeholderId: holder.id,
          notes: notes || null,
          ...values,
        },
      }),
    onSuccess: () => {
      toast.success("Saved what this person can see.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What {holder.name} can see</DialogTitle>
          <DialogDescription>
            These settings control their own portal only. They never see anyone else's position.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {PERMISSION_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <Label htmlFor={`perm-${field.key}`} className="text-sm font-normal">
                {field.label}
              </Label>
              <Switch
                id={`perm-${field.key}`}
                checked={values[field.key]}
                onCheckedChange={(checked) =>
                  setValues((prev) => ({ ...prev, [field.key]: checked }))
                }
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="perm-notes">Note for the record</Label>
            <Textarea
              id="perm-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Why these settings were chosen"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PortalAccessDialog({
  open,
  onOpenChange,
  holder,
  companyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  holder: Holder;
  companyId: string;
  onSaved: () => void;
}) {
  const save = useServerFn(setHolderEmail);
  const [email, setEmail] = useState(holder.email ?? "");

  const mutation = useMutation({
    mutationFn: () => save({ data: { companyId, stakeholderId: holder.id, email } }),
    onSuccess: () => {
      toast.success("Saved. They will see their equity when they sign in with that address.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Portal access for {holder.name}</DialogTitle>
          <DialogDescription>
            Record the email address they sign in with. Their own equity page opens automatically
            once they sign in with that address.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="holder-email">Email address</Label>
          <Input
            id="holder-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !email}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Request = Awaited<ReturnType<typeof getCapHolderDesk>>["exerciseRequests"][number];

function ExerciseQueue({
  requests,
  canManage,
  onChanged,
}: {
  requests: Request[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const decide = useServerFn(decideCapExercise);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "declined" }) =>
      decide({ data: { ...input, note: note || null } }),
    onSuccess: () => {
      toast.success("Decision recorded.");
      setNote("");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not record the decision."),
  });

  if (requests.length === 0) {
    return (
      <CapTableEmpty
        title="No exercise requests"
        body="When an employee asks to exercise vested options, the request waits here for a decision."
      />
    );
  }

  return (
    <div className="space-y-3">
      {canManage ? (
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note kept with the next decision you record"
        />
      ) : null}
      {requests.map((request) => (
        <Card key={request.id}>
          <CardHeader className="gap-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {request.stakeholder}
              <Badge variant={request.status === "pending" ? "outline" : "secondary"} className="capitalize">
                {request.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              {fmtNumber(request.quantity)} shares · {request.method} · requested{" "}
              {fmtDate(request.createdAt)}
              {request.totalCost !== null ? ` · ${fmtMoney(request.totalCost)}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {request.note ? <p className="text-sm text-muted-foreground">{request.note}</p> : null}
            {request.decisionNote ? (
              <p className="text-sm text-muted-foreground">Decision note: {request.decisionNote}</p>
            ) : null}
            {canManage && request.status === "pending" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => mutation.mutate({ id: request.id, decision: "approved" })}
                  disabled={mutation.isPending}
                >
                  Approve and record
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mutation.mutate({ id: request.id, decision: "declined" })}
                  disabled={mutation.isPending}
                >
                  Decline
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export { Progress };
