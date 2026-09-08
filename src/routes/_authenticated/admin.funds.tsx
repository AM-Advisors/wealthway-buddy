import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getAdminAccess } from "@/lib/admin.functions";
import {
  WIRE_FIELDS,
  deleteOfferingDocument,
  listOfferings,
  saveOffering,
  saveOfferingDocument,
} from "@/lib/offerings.functions";
import { downloadOfferingDocument } from "@/lib/offering-documents.functions";
import { savePdf } from "@/lib/download-pdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/funds")({
  head: () => ({
    meta: [
      { title: "Fund Setup — Harmonious Admin" },
      {
        name: "description",
        content:
          "Configure each Harmonious fund: Reg D 506(b) or 506(c), subscription documents and wire instructions.",
      },
      { property: "og:title", content: "Fund Setup — Harmonious Admin" },
      {
        property: "og:description",
        content: "Per-fund paperwork, wire details and exemption type for investor onboarding.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundsPage,
});

type WireKey = (typeof WIRE_FIELDS)[number];

interface OfferingForm {
  id?: string;
  name: string;
  slug: string;
  summary: string;
  reg_type: "506b" | "506c";
  min_investment: string;
  target_raise: string;
  is_open: boolean;
  wire: Record<WireKey, string>;
}

const emptyWire = () =>
  Object.fromEntries(WIRE_FIELDS.map((k) => [k, ""])) as Record<WireKey, string>;

function toForm(o: any): OfferingForm {
  return {
    id: o.id,
    name: o.name ?? "",
    slug: o.slug ?? "",
    summary: o.summary ?? "",
    reg_type: o.reg_type ?? "506b",
    min_investment: o.min_investment_cents ? String(o.min_investment_cents / 100) : "",
    target_raise: o.target_raise_cents ? String(o.target_raise_cents / 100) : "",
    is_open: Boolean(o.is_open),
    wire: {
      ...emptyWire(),
      ...Object.fromEntries(
        Object.entries(o.wire_instructions ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    },
  };
}

const blankForm = (): OfferingForm => ({
  name: "",
  slug: "",
  summary: "",
  reg_type: "506b",
  min_investment: "",
  target_raise: "",
  is_open: true,
  wire: emptyWire(),
});

interface DocForm {
  id?: string;
  title: string;
  doc_type: string;
  body: string;
  requires_signature: boolean;
  sort_order: string;
}

const blankDoc = (): DocForm => ({
  title: "",
  doc_type: "agreement",
  body: "",
  requires_signature: true,
  sort_order: "0",
});

function money(cents?: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function FundsPage() {
  const qc = useQueryClient();
  const access = useServerFn(getAdminAccess);
  const load = useServerFn(listOfferings);
  const saveFund = useServerFn(saveOffering);
  const saveDoc = useServerFn(saveOfferingDocument);
  const removeDoc = useServerFn(deleteOfferingDocument);

  const accessQuery = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const isAdmin = accessQuery.data?.isAdmin;

  const fundsQuery = useQuery({
    queryKey: ["admin-offerings"],
    queryFn: () => load(),
    enabled: isAdmin === true,
  });

  const [editing, setEditing] = useState<OfferingForm | null>(null);
  const [docFor, setDocFor] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const getPdf = useServerFn(downloadOfferingDocument);

  const downloadPdf = async (documentId: string) => {
    setPdfBusy(documentId);
    try {
      const res = await getPdf({ data: { document_id: documentId } });
      savePdf(res.filename, res.base64);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not prepare the PDF.");
    } finally {
      setPdfBusy(null);
    }
  };

  const [packetBusy, setPacketBusy] = useState<string | null>(null);
  const getPacket = useServerFn(downloadOfferingPacket);

  const downloadPacket = async (offeringId: string) => {
    setPacketBusy(offeringId);
    try {
      const res = await getPacket({ data: { offering_id: offeringId } });
      savePdf(res.filename, res.base64);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not prepare the packet.");
    } finally {
      setPacketBusy(null);
    }
  };
  const [docForm, setDocForm] = useState<DocForm>(blankDoc());

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-offerings"] });
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Something went wrong");

  const fundMutation = useMutation({
    mutationFn: async (form: OfferingForm) =>
      saveFund({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name,
          slug: form.slug,
          summary: form.summary,
          reg_type: form.reg_type,
          min_investment_cents: Math.round(Number(form.min_investment || 0) * 100),
          target_raise_cents: form.target_raise
            ? Math.round(Number(form.target_raise) * 100)
            : null,
          is_open: form.is_open,
          wire_instructions: form.wire,
        },
      }),
    onSuccess: () => {
      toast.success("Fund saved");
      setEditing(null);
      invalidate();
    },
    onError,
  });

  const docMutation = useMutation({
    mutationFn: async (input: { offeringId: string; form: DocForm }) =>
      saveDoc({
        data: {
          ...(input.form.id ? { id: input.form.id } : {}),
          offering_id: input.offeringId,
          title: input.form.title,
          doc_type: input.form.doc_type,
          body: input.form.body,
          requires_signature: input.form.requires_signature,
          sort_order: Number(input.form.sort_order || 0),
        },
      }),
    onSuccess: () => {
      toast.success("Document saved");
      setDocFor(null);
      setDocForm(blankDoc());
      invalidate();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => removeDoc({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed");
      invalidate();
    },
    onError,
  });

  if (accessQuery.isLoading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Fund setup is limited to Harmonious staff.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to your application</Link>
        </Button>
      </main>
    );
  }

  const offerings = fundsQuery.data?.offerings ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Fund setup</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Each fund carries its own paperwork, wire details and Reg D exemption. Investors only ever see
            the setup for the fund they are subscribing to.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin">Back to queue</Link>
          </Button>
          <Button size="sm" onClick={() => setEditing(blankForm())}>
            New fund
          </Button>
        </div>
      </div>

      {editing && (
        <Card className="mt-8 border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">{editing.id ? "Edit fund" : "New fund"}</CardTitle>
            <CardDescription>
              The exemption type decides which accreditation path investors are asked to complete: 506(b)
              allows self-certification, 506(c) requires third-party verification evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fund_name">Fund name</Label>
                <Input
                  id="fund_name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fund_slug">Short link name</Label>
                <Input
                  id="fund_slug"
                  value={editing.slug}
                  placeholder="growth-fund-ii"
                  onChange={(e) =>
                    setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fund_summary">Summary</Label>
              <Textarea
                id="fund_summary"
                rows={2}
                value={editing.summary}
                onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Regulation D exemption</Label>
              <div className="flex flex-wrap gap-2">
                {(["506b", "506c"] as const).map((rt) => (
                  <Button
                    key={rt}
                    type="button"
                    size="sm"
                    variant={editing.reg_type === rt ? "default" : "outline"}
                    onClick={() => setEditing({ ...editing, reg_type: rt })}
                  >
                    Reg D {rt === "506b" ? "506(b)" : "506(c)"}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {editing.reg_type === "506b"
                  ? "506(b): no general solicitation; investors self-certify accreditation and confirm a pre-existing relationship."
                  : "506(c): general solicitation allowed; every investor must upload third-party verification evidence."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fund_min">Minimum investment ($)</Label>
                <Input
                  id="fund_min"
                  inputMode="numeric"
                  value={editing.min_investment}
                  onChange={(e) =>
                    setEditing({ ...editing, min_investment: e.target.value.replace(/[^0-9.]/g, "") })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fund_target">Target raise ($, optional)</Label>
                <Input
                  id="fund_target"
                  inputMode="numeric"
                  value={editing.target_raise}
                  onChange={(e) =>
                    setEditing({ ...editing, target_raise: e.target.value.replace(/[^0-9.]/g, "") })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="fund_open"
                checked={editing.is_open}
                onCheckedChange={(v) => setEditing({ ...editing, is_open: v === true })}
              />
              <Label htmlFor="fund_open" className="font-normal">
                Open to new subscriptions
              </Label>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium">Wire instructions</p>
                <p className="text-xs text-muted-foreground">
                  Shown only to investors funding this fund, alongside their own reference code.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {WIRE_FIELDS.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`wire_${key}`} className="capitalize">
                      {key.replace(/_/g, " ")}
                    </Label>
                    <Input
                      id={`wire_${key}`}
                      value={editing.wire[key]}
                      onChange={(e) =>
                        setEditing({ ...editing, wire: { ...editing.wire, [key]: e.target.value } })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => fundMutation.mutate(editing)} disabled={fundMutation.isPending}>
                {fundMutation.isPending ? "Saving…" : "Save fund"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 space-y-4">
        {fundsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading funds…</p>}

        {offerings.map((o: any) => (
          <Card key={o.id}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {o.name}
                    <span className="text-muted-foreground"> · /{o.slug}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Minimum {money(o.min_investment_cents)}
                    {o.target_raise_cents ? ` · target ${money(o.target_raise_cents)}` : ""} ·{" "}
                    {o.applicationCount} application{o.applicationCount === 1 ? "" : "s"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>Reg D {o.reg_type === "506b" ? "506(b)" : "506(c)"}</Badge>
                    <Badge variant={o.is_open ? "secondary" : "outline"}>
                      {o.is_open ? "Open" : "Closed"}
                    </Badge>
                    <Badge variant="outline">
                      {Object.keys(o.wire_instructions ?? {}).length > 0
                        ? "Wire details set"
                        : "No wire details"}
                    </Badge>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(toForm(o))}>
                  Edit fund
                </Button>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Fund documents</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDocFor(o.id);
                      setDocForm({
                        ...blankDoc(),
                        sort_order: String((o.documents?.length ?? 0) + 1),
                      });
                    }}
                  >
                    Add document
                  </Button>
                </div>

                {(o.documents ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No paperwork yet — investors will have nothing to review or sign for this fund.
                  </p>
                )}

                {(o.documents ?? []).map((d: any) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {String(d.doc_type).replace(/_/g, " ")} ·{" "}
                        {d.requires_signature ? "signature required" : "review only"} · order {d.sort_order}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pdfBusy === d.id}
                        onClick={() => downloadPdf(d.id)}
                      >
                        {pdfBusy === d.id ? "Preparing…" : "PDF"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDocFor(o.id);
                          setDocForm({
                            id: d.id,
                            title: d.title,
                            doc_type: d.doc_type,
                            body: d.body,
                            requires_signature: Boolean(d.requires_signature),
                            sort_order: String(d.sort_order ?? 0),
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(d.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}

                {docFor === o.id && (
                  <div className="space-y-3 rounded-md border border-primary/40 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="doc_title">Title</Label>
                        <Input
                          id="doc_title"
                          value={docForm.title}
                          placeholder="Subscription Agreement"
                          onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="doc_order">Order</Label>
                        <Input
                          id="doc_order"
                          inputMode="numeric"
                          value={docForm.sort_order}
                          onChange={(e) =>
                            setDocForm({ ...docForm, sort_order: e.target.value.replace(/\D/g, "") })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="doc_type">Kind</Label>
                      <Input
                        id="doc_type"
                        value={docForm.doc_type}
                        placeholder="ppm, lpa, subscription"
                        onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="doc_body">Document text</Label>
                      <Textarea
                        id="doc_body"
                        rows={10}
                        value={docForm.body}
                        onChange={(e) => setDocForm({ ...docForm, body: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="doc_sign"
                        checked={docForm.requires_signature}
                        onCheckedChange={(v) =>
                          setDocForm({ ...docForm, requires_signature: v === true })
                        }
                      />
                      <Label htmlFor="doc_sign" className="font-normal">
                        Investor must sign this document
                      </Label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => docMutation.mutate({ offeringId: o.id, form: docForm })}
                        disabled={docMutation.isPending}
                      >
                        {docMutation.isPending ? "Saving…" : "Save document"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDocFor(null);
                          setDocForm(blankDoc());
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
