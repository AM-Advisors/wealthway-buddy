import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  LEAD_STATUSES,
  getCapTableLeads,
  providerLabel,
  updateCapTableLead,
} from "@/lib/captable-leads.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const FILTERS = [{ value: "all", label: "All" }, ...LEAD_STATUSES];

function statusTone(status: string) {
  if (status === "converted") return "default" as const;
  if (status === "declined") return "outline" as const;
  if (status === "contacted") return "secondary" as const;
  return "destructive" as const;
}

function when(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Staff board for founders asking to move their cap table to Harmonious. */
export function CapTableRequestsBoard() {
  const queryClient = useQueryClient();
  const load = useServerFn(getCapTableLeads);
  const save = useServerFn(updateCapTableLead);
  const [filter, setFilter] = useState("all");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = useQuery({ queryKey: ["cap-table-leads"], queryFn: () => load() });

  const mutation = useMutation({
    mutationFn: (input: {
      id: string;
      status?: "new" | "contacted" | "converted" | "declined";
      internalNote?: string | null;
      assignToMe?: boolean;
      unassign?: boolean;
    }) => save({ data: input }),
    onSuccess: () => {
      toast.success("Request updated.");
      void queryClient.invalidateQueries({ queryKey: ["cap-table-leads"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update that request."),
  });

  const leads = query.data?.leads ?? [];
  const canManage = query.data?.canManage ?? false;

  const shown = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => l.status === filter)),
    [leads, filter],
  );
  const newCount = leads.filter((l) => l.status === "new").length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl">Cap table requests</h1>
        <p className="text-sm text-muted-foreground">
          Founders who asked to move their cap table across from the website. Contact them, then send
          the portal invitation from client onboarding — an account is never created automatically.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {newCount} new · {leads.length} in total
        </span>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link to="/admin/onboarding">Send a portal invitation</Link>
        </Button>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading requests…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Could not load requests."}
        </p>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No requests here yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {shown.map((lead) => (
            <Card key={lead.id}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{lead.companyName}</CardTitle>
                    <CardDescription>
                      {lead.fullName} ·{" "}
                      <a href={`mailto:${lead.email}`} className="underline underline-offset-4">
                        {lead.email}
                      </a>
                    </CardDescription>
                  </div>
                  <Badge variant={statusTone(lead.status)}>
                    {LEAD_STATUSES.find((s) => s.value === lead.status)?.label ?? lead.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <dl className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Coming from
                    </dt>
                    <dd>{providerLabel(lead.sourceProvider)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Shareholders
                    </dt>
                    <dd>{lead.shareholderCount ?? "Not stated"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Received</dt>
                    <dd>{when(lead.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">With</dt>
                    <dd>{lead.assignedToName ?? "Nobody yet"}</dd>
                  </div>
                </dl>

                {lead.note ? (
                  <p className="rounded-md bg-muted/50 p-3 text-muted-foreground">{lead.note}</p>
                ) : null}

                {canManage ? (
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={lead.status}
                        onValueChange={(status) =>
                          mutation.mutate({ id: lead.id, status: status as any })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {lead.assignedTo ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => mutation.mutate({ id: lead.id, unassign: true })}
                        >
                          Release
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => mutation.mutate({ id: lead.id, assignToMe: true })}
                        >
                          Assign to me
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        maxLength={2000}
                        placeholder="Internal note — not shown to the founder."
                        value={notes[lead.id] ?? lead.internalNote ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutation.mutate({
                            id: lead.id,
                            internalNote: notes[lead.id] ?? lead.internalNote ?? "",
                          })
                        }
                      >
                        Save note
                      </Button>
                    </div>
                  </div>
                ) : lead.internalNote ? (
                  <p className="border-t pt-4 text-muted-foreground">{lead.internalNote}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
