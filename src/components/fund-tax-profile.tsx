import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  FUND_TAX_DOC_TYPES,
  getFundTaxProfile,
  getFundTaxUrl,
  listTaxProfileFunds,
  removeFundTaxDocument,
  uploadFundTaxDocument,
} from "@/lib/fund-tax.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { statusTone } from "@/lib/status";

function when(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function FundTaxProfile() {
  const queryClient = useQueryClient();
  const fundsFn = useServerFn(listTaxProfileFunds);
  const profileFn = useServerFn(getFundTaxProfile);
  const uploadFn = useServerFn(uploadFundTaxDocument);
  const urlFn = useServerFn(getFundTaxUrl);
  const removeFn = useServerFn(removeFundTaxDocument);

  const [offeringId, setOfferingId] = useState("");
  const [docType, setDocType] = useState<string>("w9");
  const [taxYear, setTaxYear] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const funds = useQuery({ queryKey: ["tax-profile-funds"], queryFn: () => fundsFn() });
  const fundList = funds.data?.funds ?? [];
  const selected = offeringId || (fundList[0]?.id as string | undefined) || "";

  const profile = useQuery({
    queryKey: ["fund-tax-profile", selected],
    queryFn: () => profileFn({ data: { offeringId: selected } }),
    enabled: Boolean(selected),
  });

  const grouped = useMemo(() => {
    const docs = profile.data?.documents ?? [];
    return FUND_TAX_DOC_TYPES.map((type) => ({
      ...type,
      rows: docs.filter((d) => d.docType === type.value),
    })).filter((group) => group.rows.length > 0);
  }, [profile.data]);

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Choose a file first.");
      if (!selected) throw new Error("Choose a fund first.");
      if (file.size > 20 * 1024 * 1024) throw new Error("That file is larger than 20 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      return uploadFn({
        data: {
          offeringId: selected,
          docType: docType as any,
          taxYear: taxYear ? Number(taxYear) : null,
          note,
          fileName: file.name,
          contentBase64: btoa(binary),
        },
      });
    },
    onSuccess: () => {
      toast.success("Filed. The operations team has been notified.");
      setNote("");
      setTaxYear("");
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["fund-tax-profile", selected] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not upload that file."),
  });

  const open = useMutation({
    mutationFn: (id: string) => urlFn({ data: { offeringId: selected, id } }),
    onSuccess: (res: any) => {
      if (res?.url) window.open(res.url, "_blank", "noopener");
      else toast.error("That file is not available.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open that file."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { offeringId: selected, id } }),
    onSuccess: () => {
      toast.success("Removed");
      queryClient.invalidateQueries({ queryKey: ["fund-tax-profile", selected] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that document."),
  });

  if (funds.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading your funds…</div>;
  }

  if (fundList.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Fund tax profile</CardTitle>
            <CardDescription>
              You are not approved on any fund yet, so there is nothing to show here.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const counts = profile.data?.counts;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Fund tax profile</h1>
        <p className="text-sm text-muted-foreground">
          The fund's W-9, W-8 and K-1 paperwork, stored privately. Only managers approved on this
          fund and the Harmonious team can open these files.
        </p>
      </header>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-lg">Fund</CardTitle>
          <Select value={selected} onValueChange={setOfferingId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose a fund" />
            </SelectTrigger>
            <SelectContent>
              {fundList.map((f: any) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {profile.data?.fund && (
            <CardDescription>
              {profile.data.fund.legalEntityName ?? profile.data.fund.name}
              {profile.data.fund.entityType ? ` · ${profile.data.fund.entityType}` : ""}
              {profile.data.fund.stateFormed ? ` · ${profile.data.fund.stateFormed}` : ""}
            </CardDescription>
          )}
        </CardHeader>
        {counts && (
          <CardContent className="grid gap-3 sm:grid-cols-4">
            {[
              ["On file", counts.total],
              ["Approved", counts.approved],
              ["Waiting on review", counts.pending],
              ["Sent back", counts.rejected],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value as number}</p>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5" /> Add a tax document
          </CardTitle>
          <CardDescription>
            PDF up to 20 MB. The operations team reviews it before it counts as approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Document</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUND_TAX_DOC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax-year">Tax year (optional)</Label>
            <Input
              id="tax-year"
              inputMode="numeric"
              placeholder="2026"
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax-file">File</Label>
            <Input id="tax-file" type="file" ref={fileRef} accept="application/pdf" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax-note">Note (optional)</Label>
            <Textarea
              id="tax-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the operations team should know"
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => upload.mutate()} disabled={upload.isPending || !selected}>
              {upload.isPending ? "Uploading…" : "Upload document"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" /> On file
          </CardTitle>
          <CardDescription>
            {profile.isLoading
              ? "Loading…"
              : grouped.length === 0
                ? "Nothing filed for this fund yet."
                : "Grouped by form. Links expire after five minutes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {grouped.map((group) => (
            <div key={group.value} className="space-y-2">
              <p className="text-sm font-medium">{group.label}</p>
              <div className="divide-y rounded-lg border">
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.taxYear ? `Tax year ${row.taxYear} · ` : ""}
                        Added {when(row.createdAt)}
                        {row.forInvestor ? " · investor copy" : ""}
                        {row.reviewedAt ? ` · reviewed ${when(row.reviewedAt)}` : ""}
                      </p>
                      {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
                      {row.reviewNote && (
                        <p className="text-xs text-muted-foreground">
                          Operations note: {row.reviewNote}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusTone(row.reviewStatus)}>
                        {row.reviewStatus === "pending"
                          ? "Waiting on review"
                          : row.reviewStatus === "approved"
                            ? "Approved"
                            : "Sent back"}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => open.mutate(row.id)}>
                        <Download className="mr-1 h-4 w-4" /> Open
                      </Button>
                      {row.mine && row.reviewStatus === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove.mutate(row.id)}
                          aria-label="Remove document"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
