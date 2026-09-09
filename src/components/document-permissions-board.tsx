import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  listInvestorPermissions,
  setCapTableVisibility,
  setDocumentAccess,
  setDocumentAccessForAll,
  setDocumentVisibility,
} from "@/lib/diligence-permissions.functions";
import { listCapTableFunds } from "@/lib/cap-table.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type BackTo = "/admin" | "/manager";

export function DocumentPermissionsBoard({ backTo }: { backTo: BackTo }) {
  const loadFunds = useServerFn(listCapTableFunds);
  const loadPermissions = useServerFn(listInvestorPermissions);
  const saveAccess = useServerFn(setDocumentAccess);
  const saveAccessAll = useServerFn(setDocumentAccessForAll);
  const saveVisibility = useServerFn(setDocumentVisibility);
  const saveCapTable = useServerFn(setCapTableVisibility);
  const queryClient = useQueryClient();

  const [fundId, setFundId] = useState("");
  const [search, setSearch] = useState("");

  const fundsQuery = useQuery({ queryKey: ["cap-table-funds"], queryFn: () => loadFunds() });
  const funds = fundsQuery.data?.funds ?? [];

  useEffect(() => {
    if (!fundId && funds.length > 0) setFundId(funds[0]!.id as string);
  }, [funds, fundId]);

  const permQuery = useQuery({
    queryKey: ["diligence-permissions", fundId],
    queryFn: () => loadPermissions({ data: { offeringId: fundId } }),
    enabled: Boolean(fundId),
  });

  const investors = permQuery.data?.investors ?? [];
  const documents = permQuery.data?.documents ?? [];

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.file_name.toLowerCase().includes(q),
    );
  }, [documents, search]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["diligence-permissions", fundId] });
  }

  const accessMutation = useMutation({
    mutationFn: (input: {
      documentId: string;
      investorUserId: string;
      allowed: boolean;
    }) => saveAccess({ data: { offeringId: fundId, ...input } }),
    onSuccess: refresh,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const bulkMutation = useMutation({
    mutationFn: (input: { documentId: string; allowed: boolean }) =>
      saveAccessAll({
        data: {
          offeringId: fundId,
          documentId: input.documentId,
          allowed: input.allowed,
          investorUserIds: investors.map((i) => i.user_id),
        },
      }),
    onSuccess: (_r, v) => {
      toast.success(v.allowed ? "Shared with everyone." : "Removed from everyone.");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const visibilityMutation = useMutation({
    mutationFn: (input: { documentId: string; visibility: "all" | "restricted" }) =>
      saveVisibility({ data: { offeringId: fundId, ...input } }),
    onSuccess: refresh,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const capTableMutation = useMutation({
    mutationFn: (input: { investorUserId: string; visible: boolean }) =>
      saveCapTable({ data: { offeringId: fundId, ...input } }),
    onSuccess: refresh,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Document permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Decide which diligence documents each investor can open, one document at a time.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={backTo}>{backTo === "/admin" ? "Back to admin" : "Back to panel"}</Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="fund">Fund</Label>
          <select
            id="fund"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={fundId}
            onChange={(e) => setFundId(e.target.value)}
          >
            {funds.map((f: { id: string; name: string }) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="search">Find a document</Label>
          <Input
            id="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, category or file"
            className="w-64"
          />
        </div>
      </div>

      {permQuery.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : investors.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No investors have access to this fund's room yet.
        </p>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Who sees what</CardTitle>
              <CardDescription>
                Documents marked “Everyone” are open to all invited investors. Switch one to
                “Chosen investors” and tick only the people who should see it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents match.</p>
              ) : (
                shown.map((doc) => {
                  const restricted = doc.visibility === "restricted";
                  return (
                    <div key={doc.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.category} · {doc.file_name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={restricted ? "default" : "outline"}>
                            {restricted ? "Chosen investors" : "Everyone"}
                          </Badge>
                          <Switch
                            checked={restricted}
                            onCheckedChange={(checked) =>
                              visibilityMutation.mutate({
                                documentId: doc.id,
                                visibility: checked ? "restricted" : "all",
                              })
                            }
                            aria-label="Limit to chosen investors"
                          />
                        </div>
                      </div>

                      {restricted ? (
                        <div className="mt-4 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                bulkMutation.mutate({ documentId: doc.id, allowed: true })
                              }
                            >
                              Tick everyone
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                bulkMutation.mutate({ documentId: doc.id, allowed: false })
                              }
                            >
                              Clear all
                            </Button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {investors.map((investor) => {
                              const allowed = investor.allowed_document_ids.includes(doc.id);
                              return (
                                <label
                                  key={investor.user_id}
                                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                >
                                  <Checkbox
                                    checked={allowed}
                                    onCheckedChange={(checked) =>
                                      accessMutation.mutate({
                                        documentId: doc.id,
                                        investorUserId: investor.user_id,
                                        allowed: checked === true,
                                      })
                                    }
                                  />
                                  <span className="truncate">
                                    {investor.name ?? investor.email ?? "Investor"}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Investors</CardTitle>
              <CardDescription>
                How many limited documents each person can open, and whether they see the cap
                table.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {investors.map((investor) => (
                <div
                  key={investor.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {investor.name ?? investor.email ?? "Investor"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {investor.email ?? "—"} · {investor.allowed_document_ids.length} limited
                      document{investor.allowed_document_ids.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Cap table</span>
                    <Switch
                      checked={investor.cap_table_visible}
                      onCheckedChange={(checked) =>
                        capTableMutation.mutate({
                          investorUserId: investor.user_id,
                          visible: checked === true,
                        })
                      }
                      aria-label="Show cap table"
                    />
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
