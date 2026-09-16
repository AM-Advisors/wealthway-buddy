import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  addActivityCaseNote,
  getCapExposure,
  updateActivityCase,
} from "@/lib/captable-exposure.functions";

import { fmtDate, fmtNumber } from "./captable-context";

type Data = Awaited<ReturnType<typeof getCapExposure>>;
type Case = Data["cases"][number];

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "destructive",
  investigating: "secondary",
  resolved: "default",
  closed: "outline",
};

export function CasesPanel({
  companyId,
  cases,
  canManage,
  onChanged,
}: {
  companyId: string;
  cases: Case[];
  canManage: boolean;
  onChanged: () => void;
}) {
  if (!cases.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No cases open</CardTitle>
          <CardDescription>
            When a claim does not match the register you can raise a case from the claim, and track it here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {cases.map((row) => (
        <CaseCard
          key={row.id}
          companyId={companyId}
          item={row}
          canManage={canManage}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function CaseCard({
  companyId,
  item,
  canManage,
  onChanged,
}: {
  companyId: string;
  item: Case;
  canManage: boolean;
  onChanged: () => void;
}) {
  const update = useServerFn(updateActivityCase);
  const addNote = useServerFn(addActivityCaseNote);
  const [status, setStatus] = useState(item.status);
  const [resolution, setResolution] = useState(item.resolution ?? "");
  const [note, setNote] = useState("");

  const saving = useMutation({
    mutationFn: () =>
      update({ data: { companyId, caseId: item.id, status: status as any, resolution: resolution || null } }),
    onSuccess: () => {
      toast.success("Case updated.");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not update that case."),
  });

  const noting = useMutation({
    mutationFn: () => addNote({ data: { companyId, caseId: item.id, note } }),
    onSuccess: () => {
      setNote("");
      toast.success("Note added.");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not add that note."),
  });

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{item.title}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{item.severity} severity</Badge>
            <Badge variant={STATUS_TONE[item.status] ?? "secondary"}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Badge>
          </div>
        </div>
        <CardDescription>
          Opened {fmtDate(item.openedAt)}
          {item.claimedQuantity !== null
            ? ` · claimed ${fmtNumber(item.claimedQuantity)} against ${fmtNumber(item.recordQuantity ?? 0)} on the register`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {item.summary ? <p className="text-sm text-muted-foreground">{item.summary}</p> : null}
        {item.resolution ? (
          <p className="text-sm">
            <span className="font-medium">Resolution: </span>
            {item.resolution}
          </p>
        ) : null}

        {item.notes.length ? (
          <ul className="space-y-2 border-l pl-4">
            {item.notes.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="text-muted-foreground">{fmtDate(entry.createdAt)} — </span>
                {entry.note}
              </li>
            ))}
          </ul>
        ) : null}

        {canManage ? (
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Resolution (needed to resolve or close)</Label>
              <Textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button size="sm" onClick={() => saving.mutate()} disabled={saving.isPending}>
                Save case
              </Button>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Add a note</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button
                size="sm"
                variant="outline"
                className="justify-self-start"
                disabled={!note.trim() || noting.isPending}
                onClick={() => noting.mutate()}
              >
                Add note
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
