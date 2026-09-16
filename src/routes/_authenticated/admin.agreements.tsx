import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, PenLine, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  countersignSow,
  createAmendment,
  getAgreementDocument,
  listAgreementQueue,
  respondToChange,
  sendSowToClient,
  updatePricingLine,
} from "@/lib/agreements-admin.functions";
import { getSowWorkspace } from "@/lib/agreements.functions";

export const Route = createFileRoute("/_authenticated/admin/agreements")({
  head: () => ({
    meta: [
      { title: "Agreements & SOW — Harmonious admin" },
      {
        name: "description",
        content:
          "Price, negotiate and countersign every client statement of work, and issue amendments against executed agreements.",
      },
      { property: "og:title", content: "Agreements & SOW — Harmonious admin" },
      {
        property: "og:description",
        content: "Client contracting queue: pricing, change requests, signatures and amendments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAgreementsPage,
});

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STAGE_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "With client",
  changes_requested: "Change requested",
  client_signed: "Awaiting countersignature",
  executed: "Executed",
};

function AdminAgreementsPage() {
  const loadQueue = useServerFn(listAgreementQueue);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["agreement-queue"],
    queryFn: () => loadQueue(),
  });

  if (isLoading || !data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl">Agreements &amp; SOW</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        Every client engagement runs on the master services agreement plus a statement of work per
        fund. Executed agreements keep the pricing they were signed on.
        {!data.access.canManage && " You have read-only access."}
      </p>

      <Tabs defaultValue="agreements">
        <TabsList>
          <TabsTrigger value="agreements">Agreements ({data.agreements.length})</TabsTrigger>
          <TabsTrigger value="changes">
            Change requests (
            {data.changes.filter((c) => !["resolved", "declined"].includes(c.status)).length})
          </TabsTrigger>
          <TabsTrigger value="requests">Fund requests ({data.requests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="agreements" className="mt-4 space-y-3">
          {data.agreements.map((a) => (
            <Card key={a.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <CardDescription>
                    {a.clientName}
                    {a.pricingVersion ? ` · pricing ${a.pricingVersion}` : ""}
                    {a.openChanges > 0 ? ` · ${a.openChanges} open change` : ""}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={a.executedAt ? "secondary" : "default"}>
                    {STAGE_LABEL[a.stage] ?? a.stage}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(selected === a.id ? null : a.id)}
                  >
                    {selected === a.id ? "Close" : "Open"}
                  </Button>
                </div>
              </CardHeader>
              {selected === a.id && (
                <CardContent>
                  <AgreementDetail
                    sowId={a.id}
                    canManage={data.access.canManage}
                    onChanged={() => queryClient.invalidateQueries({ queryKey: ["agreement-queue"] })}
                  />
                </CardContent>
              )}
            </Card>
          ))}
          {data.agreements.length === 0 && (
            <p className="text-sm text-muted-foreground">No agreements yet.</p>
          )}
        </TabsContent>

        <TabsContent value="changes" className="mt-4 space-y-3">
          {data.changes.length === 0 && (
            <p className="text-sm text-muted-foreground">No change requests.</p>
          )}
          {data.changes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">
                  {c.clientName} — {c.sectionTitle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.status} · raised {new Date(c.createdAt).toLocaleDateString("en-US")}
                </p>
              </div>
              {c.sowId && (
                <Button size="sm" variant="outline" onClick={() => setSelected(c.sowId)}>
                  Open agreement
                </Button>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="requests" className="mt-4 space-y-3">
          {data.requests.length === 0 && (
            <p className="text-sm text-muted-foreground">No fund requests yet.</p>
          )}
          {data.requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">
                  {r.fundName} — {r.clientName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.status} · {new Date(r.createdAt).toLocaleDateString("en-US")}
                </p>
              </div>
              {r.sowId && (
                <Button size="sm" variant="outline" onClick={() => setSelected(r.sowId)}>
                  Open SOW
                </Button>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-xs text-muted-foreground">
        Standard rates live in{" "}
        <Link className="underline" to="/admin/pricing">
          Pricing and agreements
        </Link>
        . Changing them there never alters an executed agreement.
      </p>
    </main>
  );
}

function AgreementDetail({
  sowId,
  canManage,
  onChanged,
}: {
  sowId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const load = useServerFn(getSowWorkspace);
  const setPrice = useServerFn(updatePricingLine);
  const answer = useServerFn(respondToChange);
  const send = useServerFn(sendSowToClient);
  const countersign = useServerFn(countersignSow);
  const amend = useServerFn(createAmendment);
  const document$ = useServerFn(getAgreementDocument);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sow-workspace", sowId],
    queryFn: () => load({ data: { sowId } }),
  });

  const [draft, setDraft] = useState<Record<string, { amount: string; reason: string }>>({});
  const [responses, setResponses] = useState<Record<string, { note: string; text: string }>>({});
  const [signer, setSigner] = useState({ name: "", title: "", signature: "" });
  const [amendment, setAmendment] = useState({
    title: "",
    existingTerms: "",
    requestedChange: "",
    newTerms: "",
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["sow-workspace", sowId] });
    onChanged();
  };

  const priceMutation = useMutation({
    mutationFn: (input: { lineId: string; finalCents: number; adjustmentReason: string }) =>
      setPrice({ data: input }),
    onSuccess: () => {
      toast.success("Price updated.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the price."),
  });

  const changeMutation = useMutation({
    mutationFn: (input: {
      changeId: string;
      decision: "approve" | "decline" | "counter";
      note?: string;
      proposedText?: string;
    }) => answer({ data: input }),
    onSuccess: () => {
      toast.success("Response sent to the client.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send the response."),
  });

  const sendMutation = useMutation({
    mutationFn: () => send({ data: { sowId } }),
    onSuccess: () => {
      toast.success("Sent to the client for review.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send it."),
  });

  const countersignMutation = useMutation({
    mutationFn: () =>
      countersign({
        data: {
          sowId,
          signerName: signer.name.trim(),
          signerTitle: signer.title.trim(),
          typedSignature: signer.signature.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Executed. Pricing is now locked to this agreement.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not countersign."),
  });

  const amendMutation = useMutation({
    mutationFn: () => amend({ data: { sowId, ...amendment } }),
    onSuccess: () => {
      toast.success("Amendment created.");
      setAmendment({ title: "", existingTerms: "", requestedChange: "", newTerms: "" });
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the amendment."),
  });

  const download = async () => {
    const result = await document$({ data: { sowId } });
    const blob = new Blob([result.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  };

  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;

  const executed = Boolean(data.sow.executedAt);
  const clientSigned = data.signatures.some((s) => s.side === "client");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="mr-2 h-4 w-4" /> Document
        </Button>
        {canManage && !executed && (
          <Button size="sm" variant="outline" onClick={() => sendMutation.mutate()}>
            <Send className="mr-2 h-4 w-4" /> Send for review
          </Button>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Pricing {data.pricing.versionLabel ?? ""}</h3>
        <div className="space-y-2">
          {data.pricing.lines.map((line) => {
            const entry = draft[line.id] ?? {
              amount: (line.finalCents / 100).toString(),
              reason: line.adjustmentReason ?? "",
            };
            return (
              <div key={line.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_2fr_auto]">
                <div>
                  <p className="text-sm font-medium">{line.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Standard {money(line.standardCents)} · {line.pricingModel.replace("_", " ")}
                  </p>
                </div>
                <Input
                  type="number"
                  value={entry.amount}
                  disabled={!canManage || data.pricing.locked}
                  onChange={(e) =>
                    setDraft({ ...draft, [line.id]: { ...entry, amount: e.target.value } })
                  }
                />
                <Input
                  placeholder="Reason for any difference"
                  value={entry.reason}
                  disabled={!canManage || data.pricing.locked}
                  onChange={(e) =>
                    setDraft({ ...draft, [line.id]: { ...entry, reason: e.target.value } })
                  }
                />
                <Button
                  size="sm"
                  disabled={!canManage || data.pricing.locked || priceMutation.isPending}
                  onClick={() =>
                    priceMutation.mutate({
                      lineId: line.id,
                      finalCents: Math.round(Number(entry.amount || 0) * 100),
                      adjustmentReason: entry.reason,
                    })
                  }
                >
                  Save
                </Button>
              </div>
            );
          })}
          {data.pricing.locked && (
            <p className="text-xs text-muted-foreground">
              Executed pricing is locked. Use an amendment to change it.
            </p>
          )}
        </div>
      </div>

      {data.changes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Change requests</h3>
          <div className="space-y-3">
            {data.changes.map((c) => {
              const entry = responses[c.id] ?? { note: "", text: c.requestedText };
              const open = !["resolved", "declined"].includes(c.status);
              return (
                <div key={c.id} className="space-y-2 rounded-md border p-3 text-sm">
                  <p className="font-medium">
                    {c.sectionTitle} — {c.status}
                  </p>
                  <p className="text-xs text-muted-foreground">Client asked for:</p>
                  <p className="whitespace-pre-line">{c.requestedText}</p>
                  {c.reason && <p className="text-xs text-muted-foreground">Why: {c.reason}</p>}
                  {canManage && open && !executed && (
                    <div className="space-y-2">
                      <Label className="text-xs">Proposed wording (for a counter)</Label>
                      <Textarea
                        rows={3}
                        value={entry.text}
                        onChange={(e) =>
                          setResponses({ ...responses, [c.id]: { ...entry, text: e.target.value } })
                        }
                      />
                      <Input
                        placeholder="Note to the client"
                        value={entry.note}
                        onChange={(e) =>
                          setResponses({ ...responses, [c.id]: { ...entry, note: e.target.value } })
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            changeMutation.mutate({
                              changeId: c.id,
                              decision: "approve",
                              note: entry.note,
                            })
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            changeMutation.mutate({
                              changeId: c.id,
                              decision: "counter",
                              note: entry.note,
                              proposedText: entry.text,
                            })
                          }
                        >
                          Counter
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            changeMutation.mutate({
                              changeId: c.id,
                              decision: "decline",
                              note: entry.note,
                            })
                          }
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Signatures</h3>
        {data.signatures.length === 0 && (
          <p className="text-sm text-muted-foreground">Nobody has signed yet.</p>
        )}
        {data.signatures.map((s) => (
          <p key={s.id} className="text-sm text-muted-foreground">
            {s.side === "client" ? "Client" : "Harmonious"} · {s.name}
            {s.title ? `, ${s.title}` : ""} · {new Date(s.signedAt).toLocaleString("en-US")}
          </p>
        ))}

        {canManage && clientSigned && !executed && (
          <div className="mt-3 space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Countersign to execute</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="Name"
                value={signer.name}
                onChange={(e) => setSigner({ ...signer, name: e.target.value })}
              />
              <Input
                placeholder="Title"
                value={signer.title}
                onChange={(e) => setSigner({ ...signer, title: e.target.value })}
              />
              <Input
                placeholder="Type to sign"
                value={signer.signature}
                onChange={(e) => setSigner({ ...signer, signature: e.target.value })}
              />
            </div>
            <Button
              size="sm"
              disabled={
                countersignMutation.isPending ||
                signer.name.trim().length < 2 ||
                !signer.title.trim() ||
                signer.signature.trim().length < 2
              }
              onClick={() => countersignMutation.mutate()}
            >
              <PenLine className="mr-2 h-4 w-4" /> Countersign and execute
            </Button>
          </div>
        )}
      </div>

      {canManage && executed && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">New amendment</p>
          <Input
            placeholder="Title"
            value={amendment.title}
            onChange={(e) => setAmendment({ ...amendment, title: e.target.value })}
          />
          <Textarea
            rows={2}
            placeholder="Existing terms"
            value={amendment.existingTerms}
            onChange={(e) => setAmendment({ ...amendment, existingTerms: e.target.value })}
          />
          <Textarea
            rows={2}
            placeholder="Requested change"
            value={amendment.requestedChange}
            onChange={(e) => setAmendment({ ...amendment, requestedChange: e.target.value })}
          />
          <Textarea
            rows={2}
            placeholder="New terms"
            value={amendment.newTerms}
            onChange={(e) => setAmendment({ ...amendment, newTerms: e.target.value })}
          />
          <Button
            size="sm"
            disabled={
              amendMutation.isPending ||
              !amendment.title.trim() ||
              !amendment.newTerms.trim() ||
              !amendment.existingTerms.trim() ||
              !amendment.requestedChange.trim()
            }
            onClick={() => amendMutation.mutate()}
          >
            Create amendment
          </Button>
        </div>
      )}
    </div>
  );
}
