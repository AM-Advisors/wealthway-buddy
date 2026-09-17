import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty, WorkspaceSection, useProfessionalOverview } from "@/components/professional-workspace";
import { listItemsIPrepared, prepareAssistedDraft } from "@/lib/assisted.functions";
import {
  ASSISTED_FIELDS,
  CLIENT_ACTION_REQUIRED,
  DRAFT_STATUS_LABELS,
  DRAFT_TYPE_CAPABILITY,
  DRAFT_TYPE_LABELS,
  DRAFT_TYPE_TARGET,
  type AssistedDraftType,
} from "@/lib/assisted-fields";

const FIELD_LABEL = (field: string) =>
  field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function PreparePage() {
  const qc = useQueryClient();
  const { data, isPending } = useProfessionalOverview();
  const prepareFn = useServerFn(prepareAssistedDraft);
  const listFn = useServerFn(listItemsIPrepared);
  const { data: mine } = useQuery({
    queryKey: ["items-i-prepared"],
    queryFn: () => listFn(),
    staleTime: 0,
  });

  const [delegationId, setDelegationId] = useState("");
  const [draftType, setDraftType] = useState<AssistedDraftType | "">("");
  const [targetId, setTargetId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const clients = data?.clients ?? [];
  const selected = clients.find((c: any) => c.delegationId === delegationId);
  const view = (data?.views ?? []).find((v: any) => v.context.delegationId === delegationId);

  const availableTypes = useMemo(() => {
    if (!selected) return [] as AssistedDraftType[];
    return (Object.keys(DRAFT_TYPE_CAPABILITY) as AssistedDraftType[]).filter((t) =>
      selected.capabilities.includes(DRAFT_TYPE_CAPABILITY[t]),
    );
  }, [selected]);

  const fields = draftType ? ASSISTED_FIELDS[draftType] : [];
  const targetKind = draftType ? DRAFT_TYPE_TARGET[draftType] : null;

  const submit = useMutation({
    mutationFn: () =>
      prepareFn({
        data: {
          delegation_id: delegationId,
          draft_type: draftType as AssistedDraftType,
          target_id: targetKind === "person" ? null : targetId || null,
          payload: Object.fromEntries(
            Object.entries(values).filter(([, v]) => v !== "" && v !== undefined),
          ),
          note: note || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Sent to your client for review.");
      setValues({});
      setNote("");
      void qc.invalidateQueries({ queryKey: ["items-i-prepared"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That could not be prepared."),
  });

  if (isPending) return <Empty>Loading…</Empty>;

  return (
    <div className="space-y-6">
      <WorkspaceSection
        title="Prepare something for a client"
        description="You prepare; your client reviews and decides. Nothing here changes their record until they approve it, and verification results are never yours to set."
      >
        {clients.length === 0 ? (
          <Empty>No client has authorised you to prepare anything yet.</Empty>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Client</Label>
                <Select
                  value={delegationId}
                  onValueChange={(v) => {
                    setDelegationId(v);
                    setDraftType("");
                    setTargetId("");
                    setValues({});
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c: any) => (
                      <SelectItem key={c.delegationId} value={c.delegationId}>
                        {c.principalName} — {c.scopeLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>What are you preparing?</Label>
                <Select
                  value={draftType}
                  onValueChange={(v) => {
                    setDraftType(v as AssistedDraftType);
                    setValues({});
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        availableTypes.length ? "Choose" : "This client has not authorised preparing"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {DRAFT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {draftType && targetKind !== "person" && (
              <div>
                <Label>{targetKind === "investment" ? "Investment" : "Investment profile"}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetKind === "investment"
                      ? (view?.investments ?? []).map((i: any) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.fundName}
                          </SelectItem>
                        ))
                      : (view?.profiles ?? []).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {draftType && CLIENT_ACTION_REQUIRED[draftType] ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                {CLIENT_ACTION_REQUIRED[draftType]}
              </p>
            ) : null}

            {draftType && (
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field}>
                    <Label htmlFor={field}>{FIELD_LABEL(field)}</Label>
                    <Input
                      id={field}
                      value={values[field] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [field]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <Label htmlFor="note">Note for your client</Label>
                  <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
            )}

            <Button
              onClick={() => submit.mutate()}
              disabled={
                !delegationId ||
                !draftType ||
                submit.isPending ||
                (targetKind !== "person" && !targetId)
              }
            >
              {submit.isPending ? "Sending…" : "Send to client for review"}
            </Button>
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="What you have prepared">
        {(mine?.items ?? []).length === 0 ? (
          <Empty>Nothing prepared yet.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {(mine?.items ?? []).map((item: any) => (
              <li key={item.id} className="rounded-md border border-border p-3">
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {DRAFT_STATUS_LABELS[item.status] ?? item.status} —{" "}
                  {new Date(item.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/professional/prepare")({
  head: () => ({
    meta: [
      { title: "Prepare for a client — Harmonious" },
      {
        name: "description",
        content:
          "Prepare contact details, entity and ownership information, accreditation evidence and investments for a client to review and approve.",
      },
      { property: "og:title", content: "Prepare for a client — Harmonious" },
      {
        property: "og:description",
        content: "Professional preparation that always waits for the client's own approval.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreparePage,
});
