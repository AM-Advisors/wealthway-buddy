import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listFundBankAccounts,
  removeFundBankAccount,
  saveFundBankAccount,
} from "@/lib/bank-accounts.functions";

type Draft = { institutionName: string; accountName: string; accountMask: string };

const emptyDraft: Draft = { institutionName: "", accountName: "", accountMask: "" };

/**
 * One place for staff to see which funds have a receiving account on file and
 * to enter those details, so wires arriving for a fund line up with its
 * invoices instead of sitting unmatched.
 */
export function BankAccountsBoard() {
  const load = useServerFn(listFundBankAccounts);
  const save = useServerFn(saveFundBankAccount);
  const remove = useServerFn(removeFundBankAccount);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const query = useQuery({
    queryKey: ["fund-bank-accounts"],
    queryFn: () => load(),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["fund-bank-accounts"] });

  const saving = useMutation({
    mutationFn: (input: Draft & { fundId: string }) => save({ data: input }),
    onSuccess: () => {
      toast.success("Receiving account saved.");
      setEditing(null);
      setDraft(emptyDraft);
      void refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const removing = useMutation({
    mutationFn: (fundId: string) => remove({ data: { fundId } }),
    onSuccess: () => {
      toast.success("Account details removed.");
      void refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove."),
  });

  const funds = query.data?.funds ?? [];
  const canManage = query.data?.canManage ?? false;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return funds;
    return funds.filter((f) =>
      [f.fundName, f.clientName ?? "", f.account?.institutionName ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [funds, search]);

  const missing = funds.filter((f) => !f.account).length;
  const unmatched = funds.reduce((sum, f) => sum + f.unmatched, 0);

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading bank details…</p>;
  }
  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : "Could not load bank details."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Funds</CardDescription>
            <CardTitle className="text-2xl">{funds.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>No account on file</CardDescription>
            <CardTitle className="text-2xl">{missing}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deposits still to match</CardDescription>
            <CardTitle className="text-2xl">{unmatched}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="max-w-sm">
        <Label htmlFor="bank-search">Search</Label>
        <Input
          id="bank-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Fund, client or bank"
        />
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          You can view these details. Recording or changing an account needs operations, fund
          administration, finance or admin authority.
        </p>
      ) : null}

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No funds match that search.</p>
        ) : null}

        {filtered.map((fund) => {
          const isEditing = editing === fund.fundId;
          return (
            <Card key={fund.fundId}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base break-words">{fund.fundName}</CardTitle>
                    <CardDescription className="break-words">
                      {fund.clientName ?? "No client linked"}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {fund.account ? (
                      <Badge variant={fund.account.manual ? "secondary" : "default"}>
                        {fund.account.manual ? "Details on file" : "Bank feed connected"}
                      </Badge>
                    ) : (
                      <Badge variant="outline">No account on file</Badge>
                    )}
                    {fund.unmatched > 0 ? (
                      <Badge variant="destructive">{fund.unmatched} to match</Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {fund.account ? (
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Bank</dt>
                      <dd className="break-words">{fund.account.institutionName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Account name</dt>
                      <dd className="break-words">{fund.account.accountName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last four</dt>
                      <dd>{fund.account.accountMask ? `••••${fund.account.accountMask}` : "—"}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Wires for this fund cannot be matched until the receiving account is on file.
                  </p>
                )}

                {isEditing ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor={`bank-${fund.fundId}`}>Bank</Label>
                      <Input
                        id={`bank-${fund.fundId}`}
                        value={draft.institutionName}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, institutionName: e.target.value }))
                        }
                        placeholder="Receiving bank"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`name-${fund.fundId}`}>Account name</Label>
                      <Input
                        id={`name-${fund.fundId}`}
                        value={draft.accountName}
                        onChange={(e) => setDraft((d) => ({ ...d, accountName: e.target.value }))}
                        placeholder="Name on the account"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`mask-${fund.fundId}`}>Last four digits</Label>
                      <Input
                        id={`mask-${fund.fundId}`}
                        value={draft.accountMask}
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            accountMask: e.target.value.replace(/[^0-9]/g, ""),
                          }))
                        }
                        placeholder="1234"
                      />
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {canManage && !isEditing ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(fund.fundId);
                        setDraft({
                          institutionName: fund.account?.institutionName ?? "",
                          accountName: fund.account?.accountName ?? "",
                          accountMask: fund.account?.accountMask ?? "",
                        });
                      }}
                    >
                      {fund.account ? "Edit details" : "Add account details"}
                    </Button>
                  ) : null}

                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        disabled={draft.institutionName.trim().length < 2 || saving.isPending}
                        onClick={() => saving.mutate({ fundId: fund.fundId, ...draft })}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(null);
                          setDraft(emptyDraft);
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : null}

                  {canManage && fund.account?.manual && !isEditing ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removing.isPending}
                      onClick={() => removing.mutate(fund.fundId)}
                    >
                      Remove
                    </Button>
                  ) : null}

                  <Button asChild variant="ghost" size="sm">
                    <Link to="/admin/fund-banking/$fundId" params={{ fundId: fund.fundId }}>
                      Fund banking
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/admin/fund-payments/$fundId" params={{ fundId: fund.fundId }}>
                      Fund payments
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
