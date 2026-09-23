import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import {
  FIELD_TYPES,
  PREFILL_TOKENS,
  SIGNER_ROLES,
  defaultSize,
  fieldLabel,
  roleLabel,
  validateLayout,
  type PlacedField,
  type TemplateRole,
} from "@/lib/agreement-prep";
import {
  getPreparationContext,
  reviewPreparedAgreement,
  saveSigningTemplate,
  sendPreparedAgreement,
} from "@/lib/agreement-prep.functions";
import { getOfferingDocumentFileUrl } from "@/lib/offering-files.functions";

const ROLE_COLORS = [
  "border-sky-500 bg-sky-500/15 text-sky-700",
  "border-emerald-500 bg-emerald-500/15 text-emerald-700",
  "border-amber-500 bg-amber-500/15 text-amber-700",
  "border-violet-500 bg-violet-500/15 text-violet-700",
  "border-rose-500 bg-rose-500/15 text-rose-700",
  "border-slate-500 bg-slate-500/15 text-slate-700",
];

type SignerEntry = { roleKey: string; name: string; email: string; order: number; required: boolean };

/**
 * Prepares an agreement for signature: who must sign, in what capacity, and
 * where each Box Sign field belongs. Everything placed here is sent to Box as
 * native Box Sign configuration — Box renders the fields and runs the ceremony.
 * The investor is never shown this screen.
 */
export function AgreementPreparation({ offeringId }: { offeringId?: string }) {
  const loadContext = useServerFn(getPreparationContext);
  const saveTemplate = useServerFn(saveSigningTemplate);
  const reviewFn = useServerFn(reviewPreparedAgreement);
  const sendFn = useServerFn(sendPreparedAgreement);
  const getUrl = useServerFn(getOfferingDocumentFileUrl);

  const [fundId, setFundId] = useState<string | undefined>(offeringId);
  const [documentId, setDocumentId] = useState<string>("");
  const [applicationId, setApplicationId] = useState<string>("");
  const [roles, setRoles] = useState<TemplateRole[]>([
    { key: "investor", order: 1, required: true },
  ]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [signers, setSigners] = useState<SignerEntry[]>([]);
  const [activeRole, setActiveRole] = useState<string>("investor");
  const [tool, setTool] = useState<string>("signature");
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<{ number: number; dataUrl: string; ratio: number }[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [review, setReview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateVersionId, setTemplateVersionId] = useState<string | null>(null);
  const dragRef = useRef<{ key: string; dx: number; dy: number } | null>(null);

  const ctx = useQuery({
    queryKey: ["agreement-prep-context", fundId ?? "default"],
    queryFn: () => loadContext({ data: fundId ? { offering_id: fundId } : {} }),
    retry: false,
  });

  const data: any = ctx.data;
  const investor = useMemo(
    () => (data?.investors ?? []).find((i: any) => i.applicationId === applicationId) ?? null,
    [data, applicationId],
  );
  const document_ = useMemo(
    () => (data?.documents ?? []).find((d: any) => d.id === documentId) ?? null,
    [data, documentId],
  );

  useEffect(() => {
    if (!data?.selectedFund) return;
    setFundId((prev) => prev ?? data.selectedFund);
  }, [data?.selectedFund]);

  // Seed the signer list from the roles chosen, using the investor on record.
  useEffect(() => {
    setSigners((prev) =>
      roles.map((role, index) => {
        const existing = prev.find((s) => s.roleKey === role.key);
        if (existing) return { ...existing, order: index + 1, required: role.required };
        const seedFromInvestor = role.key === "investor" || index === 0;
        return {
          roleKey: role.key,
          name: seedFromInvestor ? (investor?.contactName ?? investor?.name ?? "") : "",
          email: seedFromInvestor ? (investor?.email ?? "") : "",
          order: index + 1,
          required: role.required,
        };
      }),
    );
  }, [roles, investor]);

  // Render the real pages of the agreement so fields are placed on the document.
  useEffect(() => {
    let cancelled = false;
    if (!open || !documentId || !document_?.hasFile) {
      setPages([]);
      return;
    }
    (async () => {
      try {
        setRendering(true);
        setRenderError(null);
        const { url } = (await getUrl({ data: { documentId } })) as any;
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const pdfjs: any = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        const out: { number: number; dataUrl: string; ratio: number }[] = [];
        const count = Math.min(pdf.numPages, 40);
        for (let i = 1; i <= count; i += 1) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 1000 / base.width });
          const canvas = window.document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const canvasContext = canvas.getContext("2d");
          await page.render({ canvas, canvasContext, viewport }).promise;
          out.push({
            number: i,
            dataUrl: canvas.toDataURL("image/png"),
            ratio: viewport.height / viewport.width,
          });
        }
        if (!cancelled) setPages(out);
      } catch (err) {
        if (!cancelled) {
          setRenderError(
            err instanceof Error ? err.message : "That agreement could not be shown as pages.",
          );
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, documentId, document_?.hasFile, getUrl]);

  const problems = validateLayout({ roles, fields });
  const colorFor = (roleKey: string) =>
    ROLE_COLORS[Math.max(0, roles.findIndex((r) => r.key === roleKey)) % ROLE_COLORS.length];

  const addField = (pageNumber: number, x: number, y: number) => {
    const size = defaultSize(tool);
    setFields((prev) => [
      ...prev,
      {
        key: `f-${Date.now()}-${prev.length}`,
        roleKey: activeRole,
        type: tool,
        pageIndex: pageNumber - 1,
        x: Math.max(0, Math.min(1 - size.width, x - size.width / 2)),
        y: Math.max(0, Math.min(1 - size.height, y - size.height / 2)),
        width: size.width,
        height: size.height,
        required: true,
        prefill: null,
      },
    ]);
  };

  const applyTemplate = (versionId: string) => {
    for (const template of data?.templates ?? []) {
      const version = template.versions.find((v: any) => v.id === versionId);
      if (!version) continue;
      setRoles(version.roles ?? []);
      setFields(version.fields ?? []);
      setTemplateVersionId(version.id);
      setActiveRole(version.roles?.[0]?.key ?? "investor");
      toast.success(`Applied ${template.name} v${version.versionNo}.`);
      return;
    }
  };

  const runReview = async () => {
    setBusy(true);
    try {
      const result = await reviewFn({
        data: {
          application_id: applicationId,
          offering_document_id: documentId,
          roles,
          fields,
          signers,
        },
      });
      setReview(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That could not be reviewed.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      const result: any = await sendFn({
        data: {
          application_id: applicationId,
          offering_document_id: documentId,
          template_version_id: templateVersionId,
          roles,
          fields,
          signers,
        },
      });
      toast.success(`Sent for signature to ${result.signerCount} signer(s).`);
      setOpen(false);
      setReview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That agreement could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const storeTemplate = async () => {
    if (!fundId) return;
    setBusy(true);
    try {
      const result: any = await saveTemplate({
        data: {
          scope: "fund",
          offering_id: fundId,
          agreement_type: document_?.docType ?? "other",
          name: `${document_?.title ?? "Agreement"} signing layout`,
          roles,
          fields,
          offering_document_id: documentId || null,
          publish: true,
        },
      });
      setTemplateVersionId(result.versionId);
      toast.success(`Saved as signing template v${result.versionNo}.`);
      void ctx.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That template could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (ctx.isLoading) return <p className="text-sm text-muted-foreground">Loading agreements…</p>;
  if (ctx.error) {
    return (
      <p className="text-sm text-muted-foreground">
        {ctx.error instanceof Error ? ctx.error.message : "Agreements are unavailable."}
      </p>
    );
  }
  if (!data?.canPrepare) {
    return (
      <p className="text-sm text-muted-foreground">
        You are not authorized to prepare agreements. Preparation is available to the Harmonious
        team and to the managers of a fund or representatives of a company.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prepare an agreement for signature</CardTitle>
        <CardDescription>
          Choose the agreement and the investor, decide who must sign, then place the signing
          fields. The investor only reviews and signs — they never place fields.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Fund</Label>
            <Select value={fundId ?? ""} onValueChange={(v) => setFundId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a fund" />
              </SelectTrigger>
              <SelectContent>
                {(data.funds ?? []).map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Agreement</Label>
            <Select value={documentId} onValueChange={setDocumentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an agreement" />
              </SelectTrigger>
              <SelectContent>
                {(data.documents ?? [])
                  .filter((d: any) => d.requiresSignature)
                  .map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Investor</Label>
            <Select value={applicationId} onValueChange={setApplicationId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an investor" />
              </SelectTrigger>
              <SelectContent>
                {(data.investors ?? []).map((i: any) => (
                  <SelectItem key={i.applicationId} value={i.applicationId}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(data.templates ?? []).length > 0 && (
          <div className="grid gap-2">
            <Label>Use a saved signing template</Label>
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="sm:w-96">
                <SelectValue placeholder="Start from a template" />
              </SelectTrigger>
              <SelectContent>
                {(data.templates ?? []).flatMap((t: any) =>
                  t.versions
                    .filter((v: any) => v.status === "published")
                    .map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {t.name} — v{v.versionNo}
                      </SelectItem>
                    )),
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          onClick={() => setOpen(true)}
          disabled={!documentId || !applicationId}
        >
          Prepare for Signature
        </Button>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setReview(null);
          }}
        >
          <DialogContent className="flex max-h-none h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-[93vh] sm:w-[95vw] sm:max-w-[1500px]">
            <DialogHeader className="border-b px-5 py-3">
              <DialogTitle>{document_?.title ?? "Agreement"}</DialogTitle>
              <DialogDescription>
                Prepare for signature — {investor?.name ?? "investor"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden lg:flex-row">
              <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-b p-4 lg:w-80 lg:border-b-0 lg:border-r">
                <section className="space-y-2">
                  <Label>Required signers</Label>
                  {roles.map((role, index) => (
                    <div
                      key={role.key}
                      className={`flex items-center justify-between gap-2 rounded-md border-2 px-2 py-1 text-xs ${ROLE_COLORS[index % ROLE_COLORS.length]}`}
                    >
                      <button
                        type="button"
                        className="truncate font-medium"
                        onClick={() => setActiveRole(role.key)}
                      >
                        {roleLabel(role.key)}
                        {activeRole === role.key ? " •" : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRoles((prev) => prev.filter((r) => r.key !== role.key));
                          setFields((prev) => prev.filter((f) => f.roleKey !== role.key));
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <Select
                    onValueChange={(key) =>
                      setRoles((prev) =>
                        prev.some((r) => r.key === key)
                          ? prev
                          : [...prev, { key, order: prev.length + 1, required: true }],
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add a signer role" />
                    </SelectTrigger>
                    <SelectContent>
                      {SIGNER_ROLES.filter((r) => !roles.some((x) => x.key === r.key)).map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>

                <section className="space-y-2">
                  <Label>Who signs</Label>
                  {signers.map((signer) => (
                    <div key={signer.roleKey} className="space-y-1 rounded-md border p-2">
                      <p className="text-xs font-medium">{roleLabel(signer.roleKey)}</p>
                      <Input
                        value={signer.name}
                        placeholder="Full name"
                        onChange={(e) =>
                          setSigners((prev) =>
                            prev.map((s) =>
                              s.roleKey === signer.roleKey ? { ...s, name: e.target.value } : s,
                            ),
                          )
                        }
                      />
                      <Input
                        value={signer.email}
                        placeholder="Email"
                        onChange={(e) =>
                          setSigners((prev) =>
                            prev.map((s) =>
                              s.roleKey === signer.roleKey ? { ...s, email: e.target.value } : s,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Signers are asked in the order shown: each one is invited once the one before
                    has signed.
                  </p>
                </section>

                <section className="space-y-2">
                  <Label>Field to place</Label>
                  <Select value={tool} onValueChange={setTool}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Placing for <strong>{roleLabel(activeRole)}</strong>. Click a page to place it,
                    then drag it into position.
                  </p>
                </section>

                {problems.length > 0 && (
                  <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                    {problems.slice(0, 5).map((p, i) => (
                      <li key={i}>{p.message}</li>
                    ))}
                  </ul>
                )}
              </aside>

              <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-4">
                {!document_?.hasFile && (
                  <p className="text-sm text-muted-foreground">
                    This agreement has no uploaded PDF yet. Upload the signed-copy PDF for this
                    fund document, then prepare it here.
                  </p>
                )}
                {rendering && <p className="text-sm text-muted-foreground">Opening the pages…</p>}
                {renderError && <p className="text-sm text-muted-foreground">{renderError}</p>}

                <div className="space-y-6">
                  {pages.map((page) => (
                    <div key={page.number} className="space-y-1">
                      <p className="text-xs text-muted-foreground">Page {page.number}</p>
                      <div
                        className="relative w-full select-none overflow-hidden rounded-md border bg-background"
                        style={{ paddingTop: `${page.ratio * 100}%` }}
                        onPointerMove={(e) => {
                          const drag = dragRef.current;
                          if (!drag) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = (e.clientX - rect.left) / rect.width - drag.dx;
                          const y = (e.clientY - rect.top) / rect.height - drag.dy;
                          setFields((prev) =>
                            prev.map((f) =>
                              f.key === drag.key
                                ? {
                                    ...f,
                                    x: Math.max(0, Math.min(1 - f.width, x)),
                                    y: Math.max(0, Math.min(1 - f.height, y)),
                                  }
                                : f,
                            ),
                          );
                        }}
                        onPointerUp={() => {
                          dragRef.current = null;
                        }}
                        onClick={(e) => {
                          if (dragRef.current) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          addField(
                            page.number,
                            (e.clientX - rect.left) / rect.width,
                            (e.clientY - rect.top) / rect.height,
                          );
                        }}
                      >
                        <img
                          src={page.dataUrl}
                          alt={`Page ${page.number} of the agreement`}
                          className="absolute inset-0 h-full w-full"
                          draggable={false}
                        />
                        {fields
                          .filter((f) => f.pageIndex === page.number - 1)
                          .map((f) => (
                            <div
                              key={f.key}
                              className={`absolute flex items-center justify-between gap-1 rounded border-2 px-1 text-[10px] ${colorFor(f.roleKey)}`}
                              style={{
                                left: `${f.x * 100}%`,
                                top: `${f.y * 100}%`,
                                width: `${f.width * 100}%`,
                                height: `${f.height * 100}%`,
                                cursor: "move",
                              }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                const rect = (
                                  e.currentTarget.parentElement as HTMLElement
                                ).getBoundingClientRect();
                                dragRef.current = {
                                  key: f.key,
                                  dx: (e.clientX - rect.left) / rect.width - f.x,
                                  dy: (e.clientY - rect.top) / rect.height - f.y,
                                };
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="truncate">
                                {roleLabel(f.roleKey)}: {fieldLabel(String(f.type))}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setFields((prev) => prev.filter((x) => x.key !== f.key))
                                }
                              >
                                ×
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>

                {fields.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <Label>Prefill from Harmonious records</Label>
                    {fields
                      .filter((f) => !["signature", "initial", "checkbox"].includes(String(f.type)))
                      .map((f) => (
                        <div key={f.key} className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline">
                            {roleLabel(f.roleKey)} · {fieldLabel(String(f.type))} · p
                            {f.pageIndex + 1}
                          </Badge>
                          <Select
                            value={f.prefill ?? "none"}
                            onValueChange={(v) =>
                              setFields((prev) =>
                                prev.map((x) =>
                                  x.key === f.key
                                    ? { ...x, prefill: v === "none" ? null : (v as any) }
                                    : x,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-60">
                              <SelectValue placeholder="Signer completes it" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Signer completes it</SelectItem>
                              {PREFILL_TOKENS.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="flex items-center gap-1">
                            <Switch
                              checked={f.required}
                              onCheckedChange={(checked) =>
                                setFields((prev) =>
                                  prev.map((x) => (x.key === f.key ? { ...x, required: checked } : x)),
                                )
                              }
                            />
                            required
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {review && (
                  <div className="mt-6 space-y-1 rounded-md border bg-background p-4 text-sm">
                    <p className="font-medium">Final review</p>
                    <p>Agreement: {review.agreement}</p>
                    <p>Investor: {review.investor}</p>
                    <p>
                      Signer: {review.primarySigner?.name} ({review.capacityLabel})
                    </p>
                    <p>Required fields: {review.requiredFieldCount}</p>
                    {review.additionalSigners?.length > 0 && (
                      <p>
                        Additional signers:{" "}
                        {review.additionalSigners
                          .map((s: any) => `${roleLabel(s.roleKey)} — ${s.name}`)
                          .join(", ")}
                      </p>
                    )}
                    {review.problems?.length > 0 && (
                      <ul className="mt-2 text-xs text-destructive">
                        {review.problems.map((p: any, i: number) => (
                          <li key={i}>{p.message}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
              <span className="text-xs text-muted-foreground">
                {fields.length} field{fields.length === 1 ? "" : "s"} · {roles.length} signer
                {roles.length === 1 ? "" : "s"} · Box Sign runs the signing ceremony
              </span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={storeTemplate} disabled={busy || problems.length > 0}>
                  Save as signing template
                </Button>
                <Button variant="outline" onClick={runReview} disabled={busy}>
                  Preview
                </Button>
                <Button
                  onClick={send}
                  disabled={busy || problems.length > 0 || !review || review.problems?.length > 0}
                >
                  Send for signature
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
