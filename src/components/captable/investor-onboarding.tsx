import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getInvestorOnboarding,
  inviteCapInvestor,
  previewInvestorPortal,
} from "@/lib/captable-investors.functions";
import { saveHolderPermissions } from "@/lib/captable-equity.functions";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Investor = Awaited<ReturnType<typeof getInvestorOnboarding>>["investors"][number];

const numFmt = (value: number) => Number(value ?? 0).toLocaleString("en-US");
const dateFmt = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";

const STAGES: Record<Investor["stage"], { label: string; hint: string }> = {
  needs_email: { label: "Needs an email", hint: "Add the investor's email to invite them." },
  needs_invite: { label: "Ready to invite", hint: "Send their invitation to the portal." },
  awaiting_sign_in: { label: "Invited", hint: "Waiting for them to set a password and sign in." },
  needs_permissions: { label: "Set what they see", hint: "Choose what this investor can view." },
  live: { label: "In the portal", hint: "They can sign in and see their position." },
};

const PERMISSION_FIELDS = [
  { key: "canViewHoldings", label: "Their holdings" },
  { key: "canViewVesting", label: "Vesting" },
  { key: "canViewDocuments", label: "Documents" },
  { key: "canViewTransactions", label: "Their transactions" },
  { key: "canViewCompanySummary", label: "Company summary and ownership %" },
  { key: "canViewValuations", label: "Valuations and rounds" },
  { key: "canViewTaxDocuments", label: "Tax documents" },
  { key: "canRequestExercise", label: "Request an exercise" },
] as const;

export function InvestorOnboarding({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getInvestorOnboarding);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cap-investor-onboarding", companyId],
    queryFn: () => load({ data: { companyId } }),
  });

  const [inviting, setInviting] = useState<Investor | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<Investor | null>(null);
  const [previewFor, setPreviewFor] = useState<Investor | null>(null);

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["cap-investor-onboarding", companyId] });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading investors…</p>;
  if (error) {
    return (
      <Card role="alert" className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">We could not load the investors</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const investors = data?.investors ?? [];
  const readOnly = !data?.canManage || Boolean(data?.isDemo);
  const live = investors.filter((i) => i.stage === "live").length;
  const waiting = investors.filter((i) => i.stage === "awaiting_sign_in").length;
  const todo = investors.filter((i) => i.stage === "needs_email" || i.stage === "needs_invite").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Investor onboarding</CardTitle>
        <CardDescription>
          Invite each investor, decide what they can see, then look at their portal the way they
          will see it before you tell them it is ready.
          {data?.isDemo ? " The demo company is read-only." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Tally label="In the portal" value={numFmt(live)} />
          <Tally label="Invited, not signed in" value={numFmt(waiting)} />
          <Tally label="Still to invite" value={numFmt(todo)} />
        </div>

        {investors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No investors on this cap table yet. Once the records are in, they appear here.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {investors.map((investor) => (
              <li
                key={investor.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{investor.entityName || investor.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {investor.email ?? "No email on file"} · {numFmt(investor.shares)} shares across{" "}
                    {numFmt(investor.holdings)} holdings
                    {investor.invitedAt ? ` · invited ${dateFmt(investor.invitedAt)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{STAGES[investor.stage].hint}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={investor.stage === "live" ? "secondary" : "outline"}>
                    {STAGES[investor.stage].label}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={readOnly}
                    onClick={() => setInviting(investor)}
                  >
                    {investor.invitedAt ? "Resend invite" : "Invite"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={readOnly}
                    onClick={() => setPermissionsFor(investor)}
                  >
                    Permissions
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPreviewFor(investor)}>
                    View their portal
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {inviting ? (
        <InviteDialog
          companyId={companyId}
          investor={inviting}
          onClose={() => setInviting(null)}
          onDone={refresh}
        />
      ) : null}
      {permissionsFor ? (
        <PermissionsDialog
          companyId={companyId}
          investor={permissionsFor}
          onClose={() => setPermissionsFor(null)}
          onDone={refresh}
        />
      ) : null}
      {previewFor ? (
        <PreviewDialog
          companyId={companyId}
          investor={previewFor}
          onClose={() => setPreviewFor(null)}
        />
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ invite */

function InviteDialog({
  companyId,
  investor,
  onClose,
  onDone,
}: {
  companyId: string;
  investor: Investor;
  onClose: () => void;
  onDone: () => void;
}) {
  const invite = useServerFn(inviteCapInvestor);
  const [email, setEmail] = useState(investor.email ?? "");

  const mutation = useMutation({
    mutationFn: (input: { companyId: string; stakeholderId: string; email: string }) =>
      invite({ data: input }),
    onSuccess: (result: any) => {
      toast.success(
        result?.delivery === "sent"
          ? "Invitation sent. They will set their own password."
          : "Invitation recorded, but the email could not be delivered.",
      );
      onDone();
      onClose();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not send that invitation."),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite {investor.entityName || investor.name}</DialogTitle>
          <DialogDescription>
            We email them a link to set their own password. Passwords are never sent by email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="investor-invite-email">Email</Label>
          <Input
            id="investor-invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="investor@example.com"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!email.trim() || mutation.isPending}
            onClick={() =>
              mutation.mutate({ companyId, stakeholderId: investor.id, email: email.trim() })
            }
          >
            {mutation.isPending ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- permissions */

function PermissionsDialog({
  companyId,
  investor,
  onClose,
  onDone,
}: {
  companyId: string;
  investor: Investor;
  onClose: () => void;
  onDone: () => void;
}) {
  const save = useServerFn(saveHolderPermissions);
  const [values, setValues] = useState(() => ({
    canViewHoldings: investor.permissions.canViewHoldings,
    canViewVesting: investor.permissions.canViewVesting,
    canViewDocuments: investor.permissions.canViewDocuments,
    canViewTransactions: investor.permissions.canViewTransactions,
    canViewCompanySummary: investor.permissions.canViewCompanySummary,
    canViewValuations: investor.permissions.canViewValuations,
    canViewTaxDocuments: investor.permissions.canViewTaxDocuments,
    canRequestExercise: investor.permissions.canRequestExercise,
  }));
  const [notes, setNotes] = useState(investor.permissions.notes ?? "");

  const mutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => save({ data: input as never }),
    onSuccess: () => {
      toast.success("Saved. This investor now sees exactly these sections.");
      onDone();
      onClose();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not save those permissions."),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What {investor.entityName || investor.name} can see</DialogTitle>
          <DialogDescription>
            Investors only ever see their own position. These switches decide which sections of
            their portal are shown.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {PERMISSION_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center justify-between gap-4">
              <Label htmlFor={`perm-${field.key}`} className="font-normal">
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
            <Label htmlFor="perm-notes">Note (internal)</Label>
            <Textarea
              id="perm-notes"
              value={notes}
              rows={2}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Why this investor sees more or less than the default."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                companyId,
                stakeholderId: investor.id,
                ...values,
                notes: notes.trim() || null,
              })
            }
          >
            {mutation.isPending ? "Saving…" : "Save permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- portal preview */

function PreviewDialog({
  companyId,
  investor,
  onClose,
}: {
  companyId: string;
  investor: Investor;
  onClose: () => void;
}) {
  const preview = useServerFn(previewInvestorPortal);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cap-investor-preview", companyId, investor.id],
    queryFn: () => preview({ data: { companyId, stakeholderId: investor.id } }),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Their portal: {investor.entityName || investor.name}</DialogTitle>
          <DialogDescription>
            This is exactly what this investor sees when they sign in. Nothing here is changed by
            looking at it.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading their view…</p> : null}
        {error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "We could not load their view."}
          </p>
        ) : null}

        {data ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Tally
                label="Shares held"
                value={data.permissions.canViewHoldings ? numFmt(data.myShares) : "Hidden"}
              />
              <Tally
                label="Ownership"
                value={data.ownership === null ? "Hidden" : `${data.ownership.toFixed(2)}%`}
              />
              <Tally label="Company" value={data.companyName} />
            </div>

            <Section title="Holdings" hidden={!data.permissions.canViewHoldings}>
              {data.holdings.length === 0 ? (
                <Empty>No holdings recorded yet.</Empty>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.holdings.map((h) => (
                    <li key={h.id} className="flex justify-between gap-4">
                      <span className="truncate">
                        {h.label || h.securityType} · issued {dateFmt(h.issueDate)}
                      </span>
                      <span className="tabular-nums">{numFmt(h.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Transactions" hidden={!data.permissions.canViewTransactions}>
              {data.transactions.length === 0 ? (
                <Empty>No transactions on their holdings.</Empty>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.transactions.map((t) => (
                    <li key={t.id} className="flex justify-between gap-4">
                      <span className="truncate">
                        {t.type} · {dateFmt(t.effectiveDate)}
                      </span>
                      <span className="tabular-nums">{numFmt(t.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Documents" hidden={!data.permissions.canViewDocuments}>
              {data.documents.length === 0 ? (
                <Empty>No documents shared yet.</Empty>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex justify-between gap-4">
                      <span className="truncate">{d.title}</span>
                      <span className="text-muted-foreground">{dateFmt(d.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Valuations and rounds" hidden={!data.permissions.canViewValuations}>
              {data.valuations.length === 0 ? (
                <Empty>No rounds recorded.</Empty>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.valuations.map((v) => (
                    <li key={v.id} className="flex justify-between gap-4">
                      <span className="truncate">
                        {v.name} · {dateFmt(v.closedOn)}
                      </span>
                      <span className="tabular-nums">
                        {v.pricePerShare === null ? "—" : `$${v.pricePerShare.toLocaleString()}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <p className="text-xs text-muted-foreground">
              {data.holder.linked
                ? "They have an account and can sign in now."
                : "They have not signed in yet, so this is what will greet them when they do."}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  hidden,
  children,
}: {
  title: string;
  hidden: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        {hidden ? <Badge variant="outline">Hidden from them</Badge> : null}
      </div>
      {hidden ? (
        <Empty>Turned off in their permissions.</Empty>
      ) : (
        <div className="rounded-md border p-3">{children}</div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Tally({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
    </div>
  );
}
