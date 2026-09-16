import { useMemo, useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getMyVault, type VaultRow } from "@/lib/vault.functions";
import { getSignedDocumentUrl } from "@/lib/documents.functions";
import { getMyUploadUrl } from "@/lib/investor-uploads.functions";
import { getOfferingDocumentFileUrl } from "@/lib/offering-files.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/vault")({
  head: () => ({
    meta: [
      { title: "Document Vault — Harmonious" },
      {
        name: "description",
        content:
          "Every document on your Harmonious record: what you signed, what you sent us, your statements, agreements and invoices.",
      },
      { property: "og:title", content: "Document Vault — Harmonious" },
      {
        property: "og:description",
        content: "One place for everything you have signed, sent or received through Harmonious.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VaultPage,
});

const KINDS: { value: string; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "signed", label: "Signed" },
  { value: "fund_document", label: "Fund documents" },
  { value: "upload", label: "You sent us" },
  { value: "statement", label: "Statements" },
  { value: "agreement", label: "Agreements" },
  { value: "invoice", label: "Invoices" },
  { value: "policy", label: "Policies" },
];

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" });
}

function VaultPage() {
  const load = useServerFn(getMyVault);
  const signedUrl = useServerFn(getSignedDocumentUrl);
  const uploadUrl = useServerFn(getMyUploadUrl);
  const fundFileUrl = useServerFn(getOfferingDocumentFileUrl);

  const [kind, setKind] = useState("all");
  const [fund, setFund] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["vault"], queryFn: () => load() });
  const rows = ((data as any)?.rows ?? []) as VaultRow[];
  const funds = ((data as any)?.funds ?? []) as { id: string; name: string }[];

  const open = useMutation({
    mutationFn: async (row: VaultRow) => {
      if (row.action.type === "signature") {
        return (await signedUrl({ data: { signature_id: row.action.id } })) as any;
      }
      if (row.action.type === "upload") {
        return (await uploadUrl({ data: { id: row.action.id } })) as any;
      }
      if (row.action.type === "fundDocument") {
        return (await fundFileUrl({ data: { documentId: row.action.id } })) as any;
      }
      throw new Error("That document has no file to open.");
    },
    onSuccess: (res: any) => window.open(res.url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e?.message ?? "Could not open that document."),
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (fund !== "all" && row.fundId !== fund) return false;
      if (!term) return true;
      return (
        row.title.toLowerCase().includes(term) ||
        (row.fundName ?? "").toLowerCase().includes(term) ||
        (row.detail ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, kind, fund, search]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-3xl">Document vault</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Everything on your record with Harmonious — what you signed, what we issued to you, what you
        sent us, and your statements, agreements and invoices.
      </p>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Find a document</CardTitle>
          <CardDescription>Filter by type or fund, or search by name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Button
                key={k.value}
                size="sm"
                variant={kind === k.value ? "default" : "outline"}
                onClick={() => setKind(k.value)}
              >
                {k.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {funds.length > 0 ? (
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-64"
                value={fund}
                onChange={(e) => setFund(e.target.value)}
              >
                <option value="all">All funds</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Input
              placeholder="Search documents"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your documents…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {visible.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.fundName ? `${row.fundName} · ` : ""}
                    {when(row.date)}
                    {row.detail ? ` · ${row.detail}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{row.kindLabel}</Badge>
                  {row.action.type === "link" ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={row.action.to as never}>Open</Link>
                    </Button>
                  ) : row.action.type === "none" ? (
                    <Badge variant="outline">No file</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={open.isPending}
                      onClick={() => open.mutate(row)}
                    >
                      Open
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
