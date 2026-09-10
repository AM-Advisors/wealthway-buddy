import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { listOffboardingCases, openOffboardingCase } from "@/lib/offboarding.functions";

const STAGE: Record<string, string> = {
  open: "Notice received",
  winding_down: "Winding down",
  settlement: "Final settlement",
  data_delivered: "Data delivered",
  closed: "Closed",
};

/** Termination cases across all clients, plus the form to log a new notice. */
export function OffboardingBoard() {
  const queryClient = useQueryClient();
  const load = useServerFn(listOffboardingCases);
  const open = useServerFn(openOffboardingCase);

  const { data, isLoading } = useQuery({
    queryKey: ["offboarding-cases"],
    queryFn: () => load(),
    retry: false,
  });

  const [clientId, setClientId] = useState("");
  const [sowId, setSowId] = useState("none");
  const [initiatedBy, setInitiatedBy] = useState("client");
  const [noticeOn, setNoticeOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: () =>
      open({
        data: {
          clientId,
          sowId: sowId === "none" ? null : sowId,
          initiatedBy: initiatedBy as "client" | "harmonious",
          noticeReceivedOn: noticeOn,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Termination notice recorded.");
      setClientId("");
      setSowId("none");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["offboarding-cases"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That could not be saved."),
  });

  const cases = data?.cases ?? [];
  const canManage = data?.canManage ?? false;

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Record a termination notice</CardTitle>
            <CardDescription>
              The end date is calculated from the notice date and the notice period on the chosen
              statement of work, defaulting to 60 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Statement of work</Label>
              <Select value={sowId} onValueChange={setSowId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Whole engagement</SelectItem>
                  {(data?.sows ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Who gave notice</Label>
              <Select value={initiatedBy} onValueChange={setInitiatedBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">The client</SelectItem>
                  <SelectItem value="harmonious">Harmonious</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notice received on</Label>
              <Input type="date" value={noticeOn} onChange={(e) => setNoticeOn(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <div>
              <Button
                disabled={!clientId || !noticeOn || create.isPending}
                onClick={() => create.mutate()}
              >
                Record notice
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Terminations</CardTitle>
          <CardDescription>
            Every wind-down in progress, with the end date and what is still holding it open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!isLoading && cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No terminations recorded.</p>
          ) : null}
          {cases.map((c) => (
            <div key={c.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.clientName}</span>
                <Badge variant={c.status === "closed" ? "secondary" : "default"}>
                  {STAGE[c.status] ?? c.status}
                </Badge>
                {c.sowTitle ? <Badge variant="outline">{c.sowTitle}</Badge> : null}
                <Link
                  to="/admin/offboarding/$caseId"
                  params={{ caseId: c.id }}
                  className="ml-auto text-sm underline"
                >
                  Open
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                Notice {c.noticeReceivedOn ?? "—"} · ends {c.effectiveEndDate ?? "—"}
                {c.status !== "closed" && c.daysRemaining !== null
                  ? c.daysRemaining >= 0
                    ? ` · ${c.daysRemaining} days remaining`
                    : ` · ended ${Math.abs(c.daysRemaining)} days ago`
                  : ""}
              </p>
              {c.blockers.length ? (
                <p className="text-sm text-muted-foreground">Waiting on: {c.blockers.join("; ")}</p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
