import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getDocumentsStep,
  saveSubscription,
  signDocument,
  getSignedDocumentUrl,
  subscriptionSchema,
} from "@/lib/documents.functions";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/onboarding/documents")({
  head: () => ({
    meta: [
      { title: "Fund Documents & E-Signature — Meridian Investor Onboarding" },
      {
        name: "description",
        content:
          "Review the private placement memorandum, operating agreement and subscription agreement, then sign electronically with a full audit trail.",
      },
      { property: "og:title", content: "Fund Documents & E-Signature — Meridian" },
      {
        property: "og:description",
        content: "Step 4 of Meridian investor onboarding: review and sign the fund documents.",
      },
    ],
  }),
  component: DocumentsPage,
});

const TAX_CLASSES = [
  ["individual", "Individual"],
  ["joint_tenants", "Joint tenants with right of survivorship"],
  ["tenants_in_common", "Tenants in common"],
  ["llc", "Limited liability company"],
  ["s_corp", "S corporation"],
  ["c_corp", "C corporation"],
  ["partnership", "Partnership"],
  ["trust", "Trust"],
  ["ira", "IRA / retirement account"],
] as const;

function formatUsd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getDocumentsStep);
  const saveSub = useServerFn(saveSubscription);
  const sign = useServerFn(signDocument);
  const downloadUrl = useServerFn(getSignedDocumentUrl);

  const { data, isLoading } = useQuery({ queryKey: ["documents-step"], queryFn: () => load() });

  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [taxClass, setTaxClass] = useState<string>("individual");
  const [savingSub, setSavingSub] = useState(false);

  const [signerName, setSignerName] = useState("");
  const [initials, setInitials] = useState("");
  const [consent, setConsent] = useState(false);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [signing, setSigning] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.subscription?.commitment_cents) {
      setAmount(String(data.subscription.commitment_cents / 100));
    }
    if (data.subscription?.ownership_title) setTitle(data.subscription.ownership_title);
    if (data.subscription?.tax_classification) setTaxClass(data.subscription.tax_classification);
    if (data.profile?.legal_name) {
      setSignerName((n) => n || data.profile!.legal_name!);
      setInitials(
        (i) =>
          i ||
          data
            .profile!.legal_name!.split(/\s+/)
            .map((p) => p[0］ ?? "")
            .join("")
            .toUpperCase(),
      );
    }
  }, [data]);

  const signedByDoc = new Map((data?.signatures ?? []).map((s) => [s.offering_document_id, s]));
  const hasSubscription = Boolean(data?.subscription?.commitment_cents);

  async function onSaveSubscription(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
    const parsed = subscriptionSchema.safeParse({
      commitment_cents: Number.isFinite(cents) ? cents : 0,
      ownership_title: title,
      tax_classification: taxClass,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your subscription details.");
      return;
    }
    setSavingSub(true);
    try {
      await saveSub({ data: parsed.data });
      toast.success("Subscription details saved.");
      queryClient.invalidateQueries({ queryKey: ["documents-step"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save subscription details");
    } finally {
      setSavingSub(false);
    }
  }

  async function onSign(docId: string) {
    if (!consent) {
      toast.error("Consent to electronic signature before signing.");
      return;
    }
    setSigning(docId);
    try {
      const res = await sign({
        data: {
          offering_document_id: docId,
          signer_name: signerName,
          signature_type: "typed",
          signature_value: signerName,
          initials,
          consent_electronic: true,
        },
      });
      toast.success("Document signed.");
      queryClient.invalidateQueries({ queryKey: ["documents-step"] });
      if (res.allSigned) navigate({ to: "/onboarding/funding" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign the document");
    } finally {
      setSigning(null);
    }
  }

  async function onDownload(signatureId: string) {
    try {
      const { url } = await downloadUrl({ data: { signature_id: signatureId } });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the document");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <OnboardingStepper current="documents" />
      <h1 className="mt-8 text-3xl">Fund documents</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Read each document in full, complete your subscription particulars, then sign
        electronically. Signed copies are stored with a tamper-evident hash and audit trail.
      </p>

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading documents…</p>
      ) : (
        <div className="mt-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscription particulars</CardTitle>
              <CardDescription>
                Minimum commitment{" "}
                {data?.offering ? formatUsd(data.offering.min_investment_cents) : "—"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSaveSubscription} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="commitment">Commitment amount (USD)</Label>
                  <Input
                    id="commitment"
                    inputMode="decimal"
                    placeholder="250000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownership_title">Title to be held as</Label>
                  <Input
                    id="ownership_title"
                    placeholder="Alyssa J. Pettit"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tax classification</Label>
                  <Select value={taxClass} onValueChange={setTaxClass}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TAX_CLASSES.map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={savingSub}>
                    {savingSub ? "Saving…" : "Save details"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Electronic signature consent</CardTitle>
              <CardDescription>
                Required once, under the U.S. E-SIGN Act, before any document can be signed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="signer_name">Full legal name (your signature)</Label>
                  <Input
                    id="signer_name"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                  <p className="font-display text-2xl">{signerName || "—"}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="initials">Initials</Label>
                  <Input
                    id="initials"
                    maxLength={8}
                    value={initials}
                    onChange={(e) => setInitials(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
                <span>
                  I agree to transact electronically and adopt the typed name above as my legally
                  binding signature and initials on these documents.
                </span>
              </label>
            </CardContent>
          </Card>

          {(data?.documents ?? []).map((doc) => {
            const signature = signedByDoc.get(doc.id);
            const isOpen = activeDoc === doc.id;
            return (
              <Card key={doc.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{doc.title}</CardTitle>
                      <CardDescription>
                        {signature
                          ? `Signed ${new Date(signature.signed_at).toLocaleString()}`
                          : doc.requires_signature
                            ? "Signature required"
                            : "Review only"}
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveDoc(isOpen ? null : doc.id)}
                    >
                      {isOpen ? "Collapse" : "Read document"}
                    </Button>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="space-y-4">
                    <ScrollDoc
                      body={doc.body}
                      onReachedEnd={() => setReviewed((r) => ({ ...r, [doc.id]: true }))}
                    />
                    {doc.requires_signature && !signature && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          {reviewed[doc.id]
                            ? "Document reviewed in full."
                            : "Scroll to the end of the document to enable signing."}
                        </p>
                        <Button
                          type="button"
                          disabled={
                            !reviewed[doc.id] ||
                            !consent ||
                            !hasSubscription ||
                            signing === doc.id ||
                            signerName.trim().length < 2 ||
                            initials.trim().length < 1
                          }
                          onClick={() => onSign(doc.id)}
                        >
                          {signing === doc.id ? "Signing…" : `Sign ${doc.title}`}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
                {signature && (
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="font-mono text-xs text-muted-foreground">
                      SHA-256 {signature.document_hash.slice(0, 24)}…
                    </p>
                    <Button variant="outline" size="sm" onClick={() => onDownload(signature.id)}>
                      Download signed PDF
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {!hasSubscription && (
            <p className="text-sm text-destructive">
              Save your subscription particulars before signing.
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate({ to: "/onboarding/accreditation" })}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={data?.application?.documents_status !== "approved"}
              onClick={() => navigate({ to: "/onboarding/funding" })}
            >
              Continue to funding
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function ScrollDoc({ body, onReachedEnd }: { body: string; onReachedEnd: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) onReachedEnd();
  }

  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight <= el.clientHeight + 24) onReachedEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-4 text-sm leading-relaxed"
    >
      {body}
    </div>
  );
}
