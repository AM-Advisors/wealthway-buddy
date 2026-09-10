import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  deleteComplianceItem,
  getFundCompliance,
  saveComplianceItem,
  seedComplianceChecklist,
} from "@/lib/compliance.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "filed", label: "Filed" },
  { value: "not_applicable", label: "Not applicable" },
] as const;

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

type Item = {
  id: string;
  key: string | null;
  label: string;
  category: string;
  status: string;
  due_date: string | null;
  filed_on: string | null;
  owner_name: string | null;
  reference: string | null;
  note: string | null;
};

function day(value?: string | null) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", { dateStyle: "medium" });
}

const emptyDraft = {
  id: "",
  label: "",
  category: "Other",
  status: "not_started",
  due_date: "",
  filed_on: "",
  owner_name: "",
  reference: "",
  note: "",
};

export function FundComplianceCard({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundCompliance);
  const save = useServerFn(saveComplianceItem);
  const remove = useServerFn(deleteComplianceItem);
  const reseed = useServerFn(seedComplianceChecklist);
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });

  const query = useQuery({
    queryKey: ["fund-compliance", offeringId],
    queryFn: () => load({ data: { offeringId } }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["fund-compliance", offeringId] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: typeof emptyDraft) =>
      save({
        data: {
          ...(values.id ? { id: values.id } : {}),
          offeringId,
          label: values.label.trim(),
          category: values.category.trim() || "Other",
          status: values.status as any,
          due_date: values.due_date || null,
          filed_on: values.filed_on || null,
          owner_name: values.owner_name.trim(),
          reference: values.reference.trim(),
          note: values.note.trim(),
        } as any,
      }),
    onSuccess: () => {
      toast.success("Compliance item saved.");
      setEditingId(null);
      setAdding(false);
      setDraft({ ...emptyDraft });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that item."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { offeringId, id } }),
    onSuccess: () => {
      toast.success("Item removed.");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that item."),
  });

  const seedMutation = useMutation({
    mutationFn: () => reseed({ data: { offeringId } }),
    onSuccess: () => {
      toast.success("Standard filings added.");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add the standard filings."),
  });

  const items = (query.data?.items ?? []) as Item[];
  const summary = query.data?.summary;
  const today = new Date().toISOString().slice(0, 10);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  }, [items]);

  const startEdit = (item: Item) => {
    setAdding(false);
    setEditingId(item.id);
    setDraft({
      id: item.id,
      label: item.label,
      category: item.category,
      status: item.status,
      due_date: item.due_date ?? "",
      filed_on: item.filed_on ?? "",
      owner_name: item.owner_name ?? "",
      reference: item.reference ?? "",
      note: item.note ?? "",
    });
  };

  const quickStatus = (item: Item, status: string) => {
    saveMutation.mutate({
      id: item.id,
      label: item.label,
      category: item.category,
      status,
      due_date: item.due_date ?? "",
      filed_on: item.filed_on ?? "",
      owner_name: item.owner_name ?? "",
      reference: item.reference ?? "",
      note: item.note ?? "",
    });
  };

  const form = (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Filing</Label>
          <Input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Form D — initial notice filing"
          />
        </div>
        <div className="grid gap-2">
          <Label>Category</Label>
          <Input
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            placeholder="Federal, State, Formation…"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label>Status</Label>
          <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Due date</Label>
          <Input
            type="date"
            value={draft.due_date}
            onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Filed on</Label>
          <Input
            type="date"
            value={draft.filed_on}
            onChange={(e) => setDraft({ ...draft, filed_on: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Who owns it</Label>
          <Input
            value={draft.owner_name}
            onChange={(e) => setDraft({ ...draft, owner_name: e.target.value })}
            placeholder="Fund counsel, operations…"
          />
        </div>
        <div className="grid gap-2">
          <Label>Reference number</Label>
          <Input
            value={draft.reference}
            onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
            placeholder="Filing confirmation"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Note</Label>
        <Textarea
          rows={2}
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(draft)}
          disabled={saveMutation.isPending || draft.label.trim().length < 2}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditingId(null);
            setAdding(false);
            setDraft({ ...emptyDraft });
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Compliance checklist</CardTitle>
        <CardDescription>
          Every filing this fund owes, who owns it and when it was filed. Harmonious prepares and
          submits only the filings named in the active statement of work, using information the
          client supplies; the client and its counsel remain responsible for the rest. Investors
          never see this.
        </CardDescription>

      </CardHeader>
      <CardContent className="grid gap-5">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading the checklist…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Could not load the checklist."}
          </p>
        ) : (
          <>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {summary?.filed ?? 0} of {summary?.total ?? 0} filed
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {summary?.overdue ? (
                    <Badge variant="destructive">{summary.overdue} overdue</Badge>
                  ) : null}
                  {summary?.nextDue ? (
                    <Badge variant="outline">
                      Next: {summary.nextDue.label} · {day(summary.nextDue.due_date)}
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground">{summary?.percent ?? 0}%</span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${summary?.percent ?? 0}%` }}
                />
              </div>
            </div>

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No filings tracked yet.
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-3"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                >
                  Add the standard filings
                </Button>
              </div>
            ) : (
              grouped.map(([category, list]) => (
                <div key={category} className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {category}
                  </p>
                  <div className="grid gap-2">
                    {list.map((item) => {
                      const overdue =
                        item.status !== "filed" &&
                        item.status !== "not_applicable" &&
                        item.due_date &&
                        item.due_date < today;
                      return (
                        <div key={item.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">{item.label}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Due {day(item.due_date)} · Filed {day(item.filed_on)}
                                {item.owner_name ? ` · ${item.owner_name}` : ""}
                                {item.reference ? ` · Ref ${item.reference}` : ""}
                              </p>
                              {item.note ? (
                                <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                              <Badge
                                variant={
                                  item.status === "filed"
                                    ? "default"
                                    : item.status === "not_applicable"
                                      ? "outline"
                                      : "secondary"
                                }
                              >
                                {STATUS_LABEL[item.status] ?? item.status}
                              </Badge>
                              {item.status !== "filed" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => quickStatus(item, "filed")}
                                  disabled={saveMutation.isPending}
                                >
                                  Mark filed
                                </Button>
                              ) : null}
                              <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                                Edit
                              </Button>
                              {!item.key ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeMutation.mutate(item.id)}
                                  disabled={removeMutation.isPending}
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          {editingId === item.id ? <div className="mt-3">{form}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            {adding ? (
              form
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setDraft({ ...emptyDraft });
                    setAdding(true);
                  }}
                >
                  Add a filing
                </Button>
                {items.length > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => seedMutation.mutate()}
                    disabled={seedMutation.isPending}
                  >
                    Restore standard filings
                  </Button>
                ) : null}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
