import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { kindLabel, longDate, statusLabel } from "@/components/fund-timeline";
import {
  TIMELINE_KINDS,
  TIMELINE_STATUSES,
  deleteTimelineEvent,
  getTimelineForEdit,
  saveTimelineEvent,
} from "@/lib/timeline.functions";

type Draft = {
  id: string | null;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  kind: string;
  status: string;
  is_published: boolean;
};

const blank: Draft = {
  id: null,
  title: "",
  description: "",
  event_date: "",
  event_time: "",
  kind: "closing",
  status: "scheduled",
  is_published: true,
};

export function FundTimelineEditor({ offeringId }: { offeringId?: string }) {
  const load = useServerFn(getTimelineForEdit);
  const save = useServerFn(saveTimelineEvent);
  const remove = useServerFn(deleteTimelineEvent);

  const [fundId, setFundId] = useState<string | null>(offeringId ?? null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["fund-timeline-edit", fundId],
    queryFn: () => load({ data: { offering_id: fundId } }),
  });

  const selectedId = data?.selected?.id ?? null;
  const events = (data?.events ?? []) as any[];

  async function submit() {
    if (!selectedId) return;
    if (!draft.title.trim() || !draft.event_date) {
      toast.error("Add a name and a date.");
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          id: draft.id,
          offering_id: selectedId,
          title: draft.title,
          description: draft.description,
          event_date: draft.event_date,
          event_time: draft.event_time,
          kind: draft.kind as any,
          status: draft.status,
          is_published: draft.is_published,
          sort_order: 0,
        },
      });
      toast.success(draft.id ? "Date updated" : "Date added");
      setDraft(blank);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that date.");
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    setBusy(true);
    try {
      await remove({ data: { id } });
      if (draft.id === id) setDraft(blank);
      toast.success("Date removed");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that date.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const funds = data?.funds ?? [];
  if (funds.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          You are not assigned to a fund yet, so there are no dates to set.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!offeringId && funds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {funds.map((fund: any) => (
            <Button
              key={fund.id}
              size="sm"
              variant={selectedId === fund.id ? "default" : "outline"}
              onClick={() => {
                setFundId(fund.id);
                setDraft(blank);
              }}
            >
              {fund.name}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{draft.id ? "Edit a date" : "Add a date"}</CardTitle>
          <CardDescription>
            Closing, wire deadline, fund launch, capital calls — anything investors should plan
            around.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tl-title">Name</Label>
              <Input
                id="tl-title"
                maxLength={200}
                placeholder="e.g. First closing"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tl-kind">Type</Label>
              <select
                id="tl-kind"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.kind}
                onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
              >
                {TIMELINE_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tl-date">Date</Label>
              <Input
                id="tl-date"
                type="date"
                value={draft.event_date}
                onChange={(e) => setDraft((d) => ({ ...d, event_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tl-time">Time (optional)</Label>
              <Input
                id="tl-time"
                maxLength={40}
                placeholder="e.g. 5:00pm ET"
                value={draft.event_time}
                onChange={(e) => setDraft((d) => ({ ...d, event_time: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tl-status">Status</Label>
              <select
                id="tl-status"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
              >
                {TIMELINE_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tl-desc">Notes for investors (optional)</Label>
            <Textarea
              id="tl-desc"
              rows={3}
              maxLength={4000}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
            <div className="flex items-center gap-3">
              <Switch
                id="tl-visible"
                checked={draft.is_published}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, is_published: Boolean(v) }))}
              />
              <Label htmlFor="tl-visible" className="text-sm font-normal">
                Show in the due diligence room
              </Label>
            </div>
            <div className="flex gap-2">
              {draft.id ? (
                <Button variant="outline" onClick={() => setDraft(blank)} disabled={busy}>
                  Cancel
                </Button>
              ) : null}
              <Button onClick={() => void submit()} disabled={busy}>
                {busy ? "Saving…" : draft.id ? "Save changes" : "Add date"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "No dates yet."
              : `${events.length} date${events.length === 1 ? "" : "s"}, earliest first.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{event.title}</span>
                  <Badge variant="outline">{kindLabel(event.kind)}</Badge>
                  {event.status !== "scheduled" ? (
                    <Badge variant="secondary">{statusLabel(event.status)}</Badge>
                  ) : null}
                  {event.is_published ? null : <Badge variant="secondary">Hidden</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {longDate(event.event_date)}
                  {event.event_time ? ` · ${event.event_time}` : ""}
                </p>
                {event.description ? <p className="text-sm">{event.description}</p> : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      id: event.id,
                      title: event.title,
                      description: event.description ?? "",
                      event_date: event.event_date,
                      event_time: event.event_time ?? "",
                      kind: event.kind,
                      status: event.status,
                      is_published: Boolean(event.is_published),
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void drop(event.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
