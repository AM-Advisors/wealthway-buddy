import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Download, Lock, MessageSquare, PenLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  decideSection,
  getSowWorkspace,
  respondToCounter,
  signSow,
} from "@/lib/agreements.functions";
import { getAgreementDocument } from "@/lib/agreements-admin.functions";

export const Route = createFileRoute("/_authenticated/client/agreements/sow/$sowId")({
  component: SowWorkspacePage,
});

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CHANGE_LABEL: Record<string, string> = {
  requested: "Requested",
  under_review: "Under review",
  countered: "Harmonious proposed different wording",
  approved: "Approved",
  declined: "Declined",
  resolved: "Agreed",
};

function SowWorkspacePage() {
  const { sowId } = Route.useParams();
  const load = useServerFn(getSowWorkspace);
  const decide = useServerFn(decideSection);
  const respond = useServerFn(respondToCounter);
  const sign = useServerFn(signSow);
  const document$ = useServerFn(getAgreementDocument);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sow-workspace", sowId],
    queryFn: () => load({ data: { sowId } }),
  });

  const [changeFor, setChangeFor] = useState<string | null>(null);
  const [changeText, setChangeText] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [signer, setSigner] = useState({ name: "", title: "", signature: "" });
  const [confirmTerms, setConfirmTerms] = useState(false);
  const [confirmPricing, setConfirmPricing] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sow-workspace", sowId] });

  const sectionMutation = useMutation({
    mutationFn: (input: {
      sectionId: string;
      decision: "approve" | "change";
      requestedText?: string;
      reason?: string;
    }) => decide({ data: { sowId, ...input } }),
    onSuccess: () => {
      setChangeFor(null);
      setChangeText("");
      setChangeReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that."),
  });

  const counterMutation = useMutation({
    mutationFn: (input: { changeId: string; action: "accept" | "revise"; requestedText?: string }) =>
      respond({ data: input }),
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e?.message ?? "Could not save that."),
  });

  const signMutation = useMutation({
    mutationFn: () =>
      sign({
        data: {
          sowId,
          signerName: signer.name.trim(),
          signerTitle: signer.title.trim(),
          typedSignature: signer.signature.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Signed. Harmonious will countersign to execute.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record the signature."),
  });

  const download = async () => {
    const result = await document$({ data: { sowId } });
    const blob = new Blob([result.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  };

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const executed = Boolean(data.sow.executedAt);
  const clientSigned = data.signatures.some((s) => s.side === "client");
  const approvedCount = data.sections.filter((s) => s.approval === "approved").length;
  const openChanges = data.changes.filter(
    (c) => !["resolved", "declined", "approved"].includes(c.status),
  );
  const total = data.pricing.lines
    .filter((l) => l.included && !l.passThrough)
    .reduce((sum, l) => sum + l.finalCents, 0);
  const canSign =
    !executed &&
    !clientSigned &&
    approvedCount === data.sections.length &&
    openChanges.length === 0 &&
    confirmTerms &&
    confirmPricing &&
    signer.name.trim().length > 1 &&
    signer.title.trim() &&
    signer.signature.trim().length > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/client/agreements">
              <ArrowLeft className="mr-1 h-4 w-4" /> Agreements
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{data.sow.title}</h1>
          <p className="text-sm text-muted-foreground">
            {data.sow.clientName}
            {data.pricing.versionLabel ? ` · pricing ${data.pricing.versionLabel}` : ""}
            {data.sow.effectiveDate
              ? ` · effective ${new Date(data.sow.effectiveDate).toLocaleDateString("en-US")}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {executed && (
            <Badge variant="secondary">
              <Lock className="mr-1 h-3 w-3" /> Executed
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="mr-2 h-4 w-4" /> Document
          </Button>
        </div>
      </div>

      {executed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This agreement is final</CardTitle>
            <CardDescription>
              Executed {new Date(data.sow.executedAt!).toLocaleDateString("en-US")}. Its wording and
              pricing stay exactly as signed — any change is made through a written amendment.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">
            Review ({approvedCount}/{data.sections.length})
          </TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="changes">Changes ({data.changes.length})</TabsTrigger>
          <TabsTrigger value="sign">Sign</TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="mt-4 space-y-4">
          {data.sections.map((section) => (
            <Card key={section.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <CardTitle className="text-base">
                  {section.no}. {section.title}
                </CardTitle>
                {section.approval === "approved" && <Badge variant="secondary">Approved</Badge>}
                {section.approval === "change_requested" && <Badge>Change requested</Badge>}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {section.body}
                </p>
                {!executed && !clientSigned && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={section.approval === "approved" ? "secondary" : "default"}
                      onClick={() =>
                        sectionMutation.mutate({ sectionId: section.id, decision: "approve" })
                      }
                    >
                      <Check className="mr-2 h-4 w-4" /> Approve section
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setChangeFor(changeFor === section.id ? null : section.id)
                      }
                    >
                      <MessageSquare className="mr-2 h-4 w-4" /> Request change
                    </Button>
                  </div>
                )}
                {changeFor === section.id && (
                  <div className="space-y-2 rounded-md border p-3">
                    <Label>Wording you would like instead</Label>
                    <Textarea
                      rows={4}
                      value={changeText}
                      onChange={(e) => setChangeText(e.target.value)}
                    />
                    <Label>Why</Label>
                    <Input
                      value={changeReason}
                      onChange={(e) => setChangeReason(e.target.value)}
                      placeholder="Our counsel asked for a shorter notice period"
                    />
                    <Button
                      size="sm"
                      disabled={changeText.trim().length < 5 || sectionMutation.isPending}
                      onClick={() =>
                        sectionMutation.mutate({
                          sectionId: section.id,
                          decision: "change",
                          requestedText: changeText,
                          reason: changeReason,
                        })
                      }
                    >
                      Send change request
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="pricing" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pricing {data.pricing.versionLabel ? `(${data.pricing.versionLabel})` : ""}
              </CardTitle>
              <CardDescription>
                These fees are fixed for this vehicle once executed. Later changes to our published
                rates do not affect them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pricing.lines.length === 0 && (
                <p className="text-sm text-muted-foreground">No priced services yet.</p>
              )}
              {data.pricing.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{line.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.pricingModel.replace("_", " ")}
                      {line.adjustmentReason ? ` · ${line.adjustmentReason}` : ""}
                      {!line.included ? " · not included" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    {line.passThrough ? (
                      <span>At cost</span>
                    ) : (
                      <>
                        {line.finalCents !== line.standardCents && (
                          <span className="mr-2 text-xs text-muted-foreground line-through">
                            {money(line.standardCents)}
                          </span>
                        )}
                        <span className="font-medium">{money(line.finalCents)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex justify-between border-t pt-3 text-sm font-medium">
                <span>Total of fixed fees</span>
                <span>{money(total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Pass-through amounts such as state, Blue Sky and third-party charges are billed at
                cost and are additional.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes" className="mt-4 space-y-4">
          {data.changes.length === 0 && (
            <p className="text-sm text-muted-foreground">No changes requested.</p>
          )}
          {data.changes.map((change) => (
            <Card key={change.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {change.sectionTitle}
                  <Badge variant={change.status === "resolved" ? "secondary" : "default"}>
                    {CHANGE_LABEL[change.status] ?? change.status}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Raised {new Date(change.createdAt).toLocaleDateString("en-US")}
                  {change.reason ? ` · ${change.reason}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-md border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Current wording</p>
                  <p className="whitespace-pre-line">{change.originalText}</p>
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {change.finalText ? "Proposed wording" : "Your requested wording"}
                  </p>
                  <p className="whitespace-pre-line">{change.finalText ?? change.requestedText}</p>
                </div>
                {change.response && (
                  <p className="text-xs text-muted-foreground">Harmonious: {change.response}</p>
                )}
                {change.messages.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    {change.messages.map((m) => (
                      <p key={m.id} className="text-xs text-muted-foreground">
                        <span className="font-medium">
                          {m.side === "client" ? "You" : "Harmonious"}
                        </span>{" "}
                        · {new Date(m.createdAt).toLocaleString("en-US")}
                        {m.body ? ` — ${m.body}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {change.status === "countered" && !executed && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        counterMutation.mutate({ changeId: change.id, action: "accept" })
                      }
                    >
                      Accept this wording
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="sign" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approve and sign</CardTitle>
              <CardDescription>
                {executed
                  ? "This agreement is executed."
                  : clientSigned
                    ? "You have signed. Harmonious will countersign to execute."
                    : "Every section must be approved and every change resolved before signing."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Sections approved: {approvedCount} of {data.sections.length}
                </p>
                <p>Open changes: {openChanges.length}</p>
                <p>Total of fixed fees: {money(total)}</p>
              </div>

              {data.signatures.length > 0 && (
                <div className="space-y-1 border-t pt-3">
                  {data.signatures.map((s) => (
                    <p key={s.id} className="text-sm text-muted-foreground">
                      {s.side === "client" ? "Client" : "Harmonious"} · {s.name}
                      {s.title ? `, ${s.title}` : ""} ·{" "}
                      {new Date(s.signedAt).toLocaleString("en-US")}
                    </p>
                  ))}
                </div>
              )}

              {!executed && !clientSigned && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Full legal name</Label>
                      <Input
                        value={signer.name}
                        onChange={(e) => setSigner({ ...signer, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Title</Label>
                      <Input
                        value={signer.title}
                        onChange={(e) => setSigner({ ...signer, title: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Type your name to sign</Label>
                    <Input
                      className="font-serif text-lg"
                      value={signer.signature}
                      onChange={(e) => setSigner({ ...signer, signature: e.target.value })}
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={confirmTerms}
                      onCheckedChange={(v) => setConfirmTerms(v === true)}
                    />
                    <span>I approve the terms of this statement of work as written.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={confirmPricing}
                      onCheckedChange={(v) => setConfirmPricing(v === true)}
                    />
                    <span>I accept the pricing shown, and understand it is fixed once executed.</span>
                  </label>
                  <Button disabled={!canSign || signMutation.isPending} onClick={() => signMutation.mutate()}>
                    <PenLine className="mr-2 h-4 w-4" />
                    {signMutation.isPending ? "Recording…" : "Sign statement of work"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {data.amendments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Amendments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.amendments.map((a) => (
              <div key={a.id} className="rounded-md border p-3">
                <p className="font-medium">
                  Amendment {a.no}: {a.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.status}
                  {a.executedAt
                    ? ` · executed ${new Date(a.executedAt).toLocaleDateString("en-US")}`
                    : ""}
                </p>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">{a.newTerms}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
