import { useMemo, useState } from "react";
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
  listClientBankAccounts,
  removeClientBankAccount,
  saveClientBankAccount,
} from "@/lib/client-bank-accounts.functions";

type Draft = {
  id?: string;
  label: string;
  institutionName: string;
  accountHolder: string;
  accountType: "checking" | "savings" | "other";
  accountNumber: string;
  routingNumber: string;
  referenceHint: string;
  isPrimary: boolean;
  notes: string;
};

const emptyDraft: Draft = {
  label: "",
  institutionName: "",
  accountHolder: "",
  accountType: "checking",
  accountNumber: "",
  routingNumber: "",
  referenceHint: "",
  isPrimary: false,
  notes: "",
};

/**
 * Staff keep each client's paying account on file here. Once the bank name,
 * account holder and last four digits are recorded, deposits that carry those
 * details settle the client's declared invoice payments without staff matching
 * them by hand.
 */
export function ClientBankAccountsBoard() {
  const load = useServerFn(listClientBankAccounts);
  const save = useServerFn(saveClientBankAccount);
  const remove = useServerFn(removeClientBankAccount);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const query = useQuery({
    queryKey: ["client-bank-accounts"],
    queryFn: () => load(),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["client-bank-accounts"] });

  const saving = useMutation({
    mutationFn: (input: Draft & { clientId: string }) =>
      save({
        data: {
          id: input.id,
          clientId: input.clientId,
          label: input.label || undefined,
          institutionName: input.institutionName,
          accountHolder: input.accountHolder,
          accountType: input.accountType,
          accountNumber: input.accountNumber || undefined,
          routingNumber: input.routingNumber || undefined,
          referenceHint: input.referenceHint || undefined,
          isPrimary: input.isPrimary,
          status: "active",
          notes: input.notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Bank details saved.");
      setEditingClient(null);
      setDraft(emptyDraft);
      void refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const removing = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Bank details removed.");
      void refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove."),
  });

  const clients = query.data?.clients ?? [];
  const canManage = query.data?.canManage ?? false;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter(
      (client) =>
        client.legalName.toLowerCase().includes(term) ||
        client.accounts.some(
          (a) =>
            a.institutionName.toLowerCase().includes(term) ||
            a.accountHolder.toLowerCase().includes(term),
        ),
    );
  }, [clients, search]);

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading client bank details…</p>;
  }
  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : "Could not load bank details."}
      </p>
    );
  }

  const onFile = clients.filter((c) => c.accounts.length > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clients</CardDescription>
            <CardTitle className="text-2xl">{clients.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bank details on file</CardDescription>
            <CardTitle className="text-2xl">{onFile}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Payments waiting to match</CardDescription>
            <CardTitle className="text-2xl">
              {clients.reduce((sum, c) => sum + c.awaitingMatch, 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by client, bank or account holder"
        className="max-w-md"
      />

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          You can view these details. Adding or changing them needs operations, fund
          administration, finance or admin authority.
        </p>
      ) : null}

      <div className="space-y-3">
        {filtered.map((client) => (
          <Card key={client.id}>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base break-words">{client.legalName}</CardTitle>
                <CardDescription>
                  {client.accounts.length
                    ? `${client.accounts.length} account${client.accounts.length === 1 ? "" : "s"} on file`
                    : "No bank details on file yet"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {client.awaitingMatch > 0 ? (
                  <Badge variant="secondary">{client.awaitingMatch} payment(s) to match</Badge>
                ) : null}
                {canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingClient(client.id);
                      setDraft(emptyDraft);
                    }}
                  >
                    Add account
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {client.accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-medium break-words">
                      {account.institutionName}
                      {account.label ? ` — ${account.label}` : ""}
                      {account.isPrimary ? (
                        <Badge className="ml-2" variant="secondary">
                          Main
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground break-words">
                      {account.accountHolder} · {account.accountType}
                      {account.accountLast4 ? ` · account ••••${account.accountLast4}` : ""}
                      {account.routingLast4 ? ` · routing ••••${account.routingLast4}` : ""}
                    </p>
                    {account.referenceHint ? (
                      <p className="text-muted-foreground break-words">
                        Usual reference: {account.referenceHint}
                      </p>
                    ) : null}
                    {account.notes ? (
                      <p className="text-muted-foreground break-words">{account.notes}</p>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingClient(client.id);
                          setDraft({
                            id: account.id,
                            label: account.label ?? "",
                            institutionName: account.institutionName,
                            accountHolder: account.accountHolder,
                            accountType: (account.accountType as Draft["accountType"]) ?? "checking",
                            accountNumber: "",
                            routingNumber: "",
                            referenceHint: account.referenceHint ?? "",
                            isPrimary: account.isPrimary,
                            notes: account.notes ?? "",
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={removing.isPending}
                        onClick={() => removing.mutate(account.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}

              {canManage && editingClient === client.id ? (
                <form
                  className="grid gap-3 rounded-md border p-3 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saving.mutate({ ...draft, clientId: client.id });
                  }}
                >
                  <div className="space-y-1">
                    <Label>Bank name</Label>
                    <Input
                      required
                      value={draft.institutionName}
                      onChange={(e) => setDraft({ ...draft, institutionName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Account holder</Label>
                    <Input
                      required
                      value={draft.accountHolder}
                      onChange={(e) => setDraft({ ...draft, accountHolder: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Account number</Label>
                    <Input
                      value={draft.accountNumber}
                      placeholder={draft.id ? "Leave blank to keep" : "Only the last 4 are stored"}
                      onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Routing number</Label>
                    <Input
                      value={draft.routingNumber}
                      placeholder="Only the last 4 are stored"
                      onChange={(e) => setDraft({ ...draft, routingNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Label</Label>
                    <Input
                      value={draft.label}
                      placeholder="Operating account"
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Usual payment reference</Label>
                    <Input
                      value={draft.referenceHint}
                      placeholder="Text that appears on their wires"
                      onChange={(e) => setDraft({ ...draft, referenceHint: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={draft.isPrimary}
                      onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })}
                    />
                    Main account for this client
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Button type="submit" size="sm" disabled={saving.isPending}>
                      Save details
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingClient(null);
                        setDraft(emptyDraft);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {!filtered.length ? (
          <p className="text-sm text-muted-foreground">No clients match that search.</p>
        ) : null}
      </div>
    </div>
  );
}
