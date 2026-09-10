import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { clearHold, HOLD_REASONS, HOLD_SCOPES, listHolds, placeHold } from "@/lib/compliance-holds.functions";

const scopeLabel = (v: string) => HOLD_SCOPES.find((s) => s.value === v)?.label ?? v.replace(/_/g, " ");
const reasonLabel = (v: string) => HOLD_REASONS.find((s) => s.value === v)?.label ?? v.replace(/_/g, " ");
const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

type Draft = {
  clientId: string;
  offeringId: string;
  scope: string;
  reason: string;
  internalNote: string;
  clientExplanation: string;
  remediation: string;
};

const emptyDraft: Draft = {
  clientId: "none",
  offeringId: "none",
  scope: HOLD_SCOPES[0].value,
  reason: HOLD_REASONS[0].value,
  internalNote: "",
  clientExplanation: "",
  remediation: "",
};

/** Compliance holds: what Harmonious has paused pending review, and why. */
export function HoldsBoard({
  clients,
  funds,
  canManage,
}: {
  clients: { id: string; name: string }[];
  funds: { id: string; name: string; client_id?: string | null }[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listHolds);
  const place = useServerFn(placeHold);
  const clear = useServerFn(clearHold);

  const [includeCleared, setIncludeCleared] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [clearNote, setClearNote] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance-holds", includeCleared],
    queryFn: () => load({ data: { includeCleared } }),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["compliance-holds"] });

  const placeMutation = useMutation({
    mutationFn: (input: Draft) =>
      place({
        data: {
          clientId: input.clientId === "none" ? null : input.clientId,
          offeringId: input.offeringId === "none" ? null : input.offeringId,
          scope: input.scope,
          reason: input.reason,
          internalNote: input.internalNote,
          clientExplanation: input.clientExplanation,
          remediation: input.remediation,
        },
      }),
    onSuccess: () => {
      toast.success("Hold placed. The affected activity is paused.");
      setDraft(emptyDraft);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That hold couldn't be placed."),
  });

  const clearMutation = useMutation({
    mutationFn: (input: { id: string; note: string }) => clear({ data: input }),
    onSuccess: () => {
      toast.success("Hold cleared.");
      setClearingId(null);
      setClearNote("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That hold couldn't be cleared."),
  });

  const holds = (data?.holds ?? []) as any[];
  const active = holds.filter((h) => h.status === "active");
  const cleared = holds.filter((h) => h.status !== "active");

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Place a hold</CardTitle>
            <CardDescription>
              A hold pauses Harmonious activity while a review is completed. It is an operational
              pause, not a finding or a legal determination.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select
                  value={draft.clientId}
                  onValueChange={(v) => setDraft({ ...draft, clientId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No specific client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific client</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fund</Label>
                <Select
                  value={draft.offeringId}
                  onValueChange={(v) => setDraft({ ...draft, offeringId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No specific fund" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific fund</SelectItem>
                    {funds.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>What is paused</Label>
                <Select value={draft.scope} onValueChange={(v) => setDraft({ ...draft, scope: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOLD_SCOPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={draft.reason} onValueChange={(v) => setDraft({ ...draft, reason: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOLD_REASONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Internal note (staff only)</Label>
              <Textarea
                value={draft.internalNote}
                onChange={(e) => setDraft({ ...draft, internalNote: e.target.value })}
                placeholder="Context for the Harmonious team."
              />
            </div>
            <div className="space-y-2">
              <Label>What the client sees</Label>
              <Textarea
                value={draft.clientExplanation}
                onChange={(e) => setDraft({ ...draft, clientExplanation: e.target.value })}
                placeholder="This activity is on hold while Harmonious completes a review."
              />
            </div>
            <div className="space-y-2">
              <Label>What would resolve it</Label>
              <Input
                value={draft.remediation}
                onChange={(e) => setDraft({ ...draft, remediation: e.target.value })}
                placeholder="e.g. Updated beneficial-owner documentation"
              />
            </div>
            <Button
              onClick={() => placeMutation.mutate(draft)}
              disabled={placeMutation.isPending}
            >
              {placeMutation.isPending ? "Placing…" : "Place hold"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Live holds</CardTitle>
            <CardDescription>Activity currently paused pending Harmonious review.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIncludeCleared(!includeCleared)}>
            {includeCleared ? "Hide history" : "Show cleared holds"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading holds…</p> : null}
          {error ? (
            <p className="text-sm text-muted-foreground">
              {(error as any)?.message ?? "Holds aren't available to you."}
            </p>
          ) : null}
          {!isLoading && !error && active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is on hold right now.</p>
          ) : null}

          {active.map((h) => (
            <div key={h.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{scopeLabel(h.scope)}</Badge>
                <Badge variant="outline">{reasonLabel(h.reason)}</Badge>
                <span className="text-sm font-medium">
                  {h.clientName ?? "All clients"}
                  {h.fundName ? ` · ${h.fundName}` : ""}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Placed {when(h.placed_at)}
                </span>
              </div>
              {h.client_explanation ? (
                <p className="text-sm text-muted-foreground">Client sees: {h.client_explanation}</p>
              ) : null}
              {h.remediation ? (
                <p className="text-sm text-muted-foreground">Resolves with: {h.remediation}</p>
              ) : null}
              {h.internal_note ? (
                <p className="text-sm text-muted-foreground">Internal: {h.internal_note}</p>
              ) : null}

              {canManage ? (
                clearingId === h.id ? (
                  <div className="space-y-2 pt-1">
                    <Label>Closing note</Label>
                    <Textarea
                      value={clearNote}
                      onChange={(e) => setClearNote(e.target.value)}
                      placeholder="What resolved this hold."
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={clearMutation.isPending}
                        onClick={() => clearMutation.mutate({ id: h.id, note: clearNote })}
                      >
                        {clearMutation.isPending ? "Clearing…" : "Confirm clear"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setClearingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setClearingId(h.id);
                      setClearNote("");
                    }}
                  >
                    Clear hold
                  </Button>
                )
              ) : null}
            </div>
          ))}

          {includeCleared && cleared.length > 0 ? (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium">History</p>
              {cleared.map((h) => (
                <div key={h.id} className="rounded-lg border border-dashed p-3 text-sm">
                  <span className="font-medium">{scopeLabel(h.scope)}</span> ·{" "}
                  {reasonLabel(h.reason)} · {h.clientName ?? "All clients"}
                  {h.fundName ? ` · ${h.fundName}` : ""}
                  <span className="ml-2 text-xs text-muted-foreground">
                    Cleared {when(h.cleared_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
