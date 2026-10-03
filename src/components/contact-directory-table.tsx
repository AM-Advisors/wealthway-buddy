import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  assignContactToCapTableFn, assignContactToFundFn, ensureFounderContactFn,
  listFounderContactsFn, listFundManagerContactsFn,
} from "@/lib/client-directory.functions";
import { inviteToFund } from "@/lib/invitations.functions";
import { inviteClientContact } from "@/lib/client-contacts.functions";
import { AccessBadge, PeopleActions, useAccessStatus } from "@/components/people-actions";
import { filterDirectory, INVITE_LABEL, type DirectoryRow } from "@/lib/client-directory-model";

type Kind = "fund_managers" | "founders";
type Target = { id: string; name: string; clientId: string | null; clientName: string | null };
type DialogState = { mode: "assign" | "add"; row?: DirectoryRow } | null;

export function ContactDirectoryTable({ kind }: { kind: Kind }) {
  const isFund = kind === "fund_managers";
  const listFm = useServerFn(listFundManagerContactsFn);
  const listFo = useServerFn(listFounderContactsFn);
  const assignFund = useServerFn(assignContactToFundFn);
  const assignCap = useServerFn(assignContactToCapTableFn);
  const ensureFounder = useServerFn(ensureFounderContactFn);
  const sendFundInvite = useServerFn(inviteToFund);
  const sendContactInvite = useServerFn(inviteClientContact);
  const qc = useQueryClient();
  const key = ["client-directory", kind];
  const q = useQuery({ queryKey: key, queryFn: () => (isFund ? listFm() : listFo()), retry: false });
  const [search, setSearch] = useState("");
  const [client, setClient] = useState("all");
  const [status, setStatus] = useState("all");
  const [dialog, setDialog] = useState<DialogState>(null);
  const access = useAccessStatus(((q.data?.rows ?? []) as DirectoryRow[]).map((r) => r.email));
  const acc = (e: string) => access.data?.[e.toLowerCase()];
  const rows = useMemo(() => {
    const base = filterDirectory((q.data?.rows ?? []) as DirectoryRow[], search, client, ["revoked", "archived", "test"].includes(status) ? "all" : status);
    return base.filter((r) => {
      const a = access.data?.[r.email.toLowerCase()];
      if (status === "revoked") return a?.status === "revoked" || (a?.scoped ?? 0) > 0;
      if (status === "archived") return a?.status === "archived";
      if (status === "test") return !!a?.isTestDemo;
      return a?.status !== "archived";
    });
  }, [q.data, search, client, status, access.data]);
  const targets = (q.data?.targets ?? []) as Target[];
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const invite = useMutation({
    mutationFn: async (r: DirectoryRow) => {
      if (isFund) {
        if (!r.assignments.length) throw new Error("Assign them to a fund first.");
        await sendFundInvite({ data: { offeringIds: r.assignments.map((a) => a.id), email: r.email, name: r.name, role: "fund_manager", sendEmail: true } });
      } else {
        const clientId = r.clientIds[0];
        if (!r.contactId && !clientId) throw new Error("Assign them to a cap table first.");
        const id = r.contactId ?? (await ensureFounder({ data: { email: r.email, name: r.name, clientId: clientId! } })).id;
        await sendContactInvite({ data: { id } });
      }
    },
    onSuccess: () => { toast.success("Invitation sent"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.error) return <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search name, email, company…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search contacts" />
        <Select value={client} onValueChange={setClient}>
          <SelectTrigger className="w-48" aria-label="Filter by client"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {(q.data?.clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="not_invited">Not invited</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="test">Test/Demo</SelectItem>
            <SelectItem value="active">Active</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{rows.length} shown</span>
        <Button className="ml-auto" size="sm" onClick={() => setDialog({ mode: "add" })}>Add contact</Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>{isFund ? "Funds" : "Cap tables"}</TableHead>
              <TableHead>Invite</TableHead>
              <TableHead>Identity</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {!q.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No contacts match.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.email}</div></TableCell>
                <TableCell className="text-sm">{r.companies.join(", ") || "—"}</TableCell>
                <TableCell className="text-sm">{r.assignments.length ? r.assignments.map((a) => a.name).join(", ") : <span className="text-muted-foreground">None</span>}</TableCell>
                <TableCell><Badge variant={r.invite === "active" ? "default" : r.invite === "invited" ? "secondary" : "outline"}>{INVITE_LABEL[r.invite]}</Badge> <AccessBadge info={acc(r.email)} /></TableCell>
                <TableCell className="text-sm">{r.verified ? "Verified" : <span className="text-muted-foreground">Not yet</span>}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ mode: "assign", row: r })}>Assign</Button>
                  {r.invite !== "active" && <Button size="sm" variant="outline" disabled={invite.isPending} onClick={() => invite.mutate(r)}>{r.invite === "invited" ? "Resend" : "Invite"}</Button>}
                  {access.data && <PeopleActions email={r.email} name={r.name} info={acc(r.email)}
                    context={isFund ? (r.assignments.length === 1 ? { kind: "offering", id: r.assignments[0]!.id, label: r.assignments[0]!.name } : null)
                      : (r.clientIds.length === 1 ? { kind: "client", id: r.clientIds[0]!, label: r.companies[0] ?? "this client" } : null)} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {dialog && (
        <AssignDialog
          isFund={isFund}
          state={dialog}
          targets={targets}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            if (isFund) await assignFund({ data: { email: v.email, name: v.name, offeringId: v.targetId, teamRole: v.role as "manager" | "member" } });
            else await assignCap({ data: { email: v.email, name: v.name, companyId: v.targetId, title: v.role || undefined } });
            if (v.invite) {
              if (isFund) await sendFundInvite({ data: { offeringIds: [v.targetId], email: v.email, name: v.name, role: "fund_manager", sendEmail: true } });
              else {
                const clientId = targets.find((t) => t.id === v.targetId)?.clientId;
                if (!clientId) throw new Error("This cap table isn't linked to a client, so no invite was sent.");
                const { id } = await ensureFounder({ data: { email: v.email, name: v.name, clientId } });
                await sendContactInvite({ data: { id } });
              }
            }
            toast.success(v.invite ? "Assigned and invited" : "Assigned");
            setDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AssignDialog({ isFund, state, targets, onClose, onSubmit }: {
  isFund: boolean; state: NonNullable<DialogState>; targets: Target[]; onClose: () => void;
  onSubmit: (v: { email: string; name: string; targetId: string; role: string; invite: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(state.row?.name ?? "");
  const [email, setEmail] = useState(state.row?.email ?? "");
  const [targetId, setTargetId] = useState("");
  const [role, setRole] = useState(isFund ? "member" : "Founder");
  const [invite, setInvite] = useState(state.mode === "add");
  const [busy, setBusy] = useState(false);
  const taken = new Set(state.row?.assignments.map((a) => a.id) ?? []);
  const options = targets.filter((t) => !taken.has(t.id));
  const submit = async () => {
    setBusy(true);
    try { await onSubmit({ name: name.trim(), email: email.trim(), targetId, role, invite }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{state.mode === "add" ? (isFund ? "Add fund manager" : "Add founder") : `Assign ${state.row?.name}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {state.mode === "add" && <>
            <div><Label htmlFor="dir-name">Full name</Label><Input id="dir-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="dir-email">Email</Label><Input id="dir-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </>}
          <div>
            <Label>{isFund ? "Fund" : "Cap table"}</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue placeholder={isFund ? "Choose a fund" : "Choose a cap table"} /></SelectTrigger>
              <SelectContent>
                {options.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.clientName ? ` — ${t.clientName}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isFund ? (
            <div>
              <Label>Team role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Team member</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Gets view, edit, documents and investors access. GP, signatory and banking authority are confirmed separately on the fund.</p>
            </div>
          ) : (
            <div><Label htmlFor="dir-title">Title</Label><Input id="dir-title" value={role} onChange={(e) => setRole(e.target.value)} /></div>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} /> Send invitation email now</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !targetId || !name.trim() || !/^\S+@\S+\.\S+$/.test(email)} onClick={submit}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
