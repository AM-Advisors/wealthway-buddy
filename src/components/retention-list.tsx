import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { markRetentionReviewed, saveRetentionRecord } from "@/lib/offboarding.functions";

const CATEGORIES = [
  "Investor records",
  "Fund records",
  "Payment records",
  "Signed agreements",
  "Compliance records",
  "Correspondence",
];

const CLASSIFICATIONS = ["Personal data", "Financial", "Confidential", "Public"];

const STATUSES = [
  { value: "retained", label: "Retained" },
  { value: "scheduled", label: "Scheduled for release" },
  { value: "released", label: "Released" },
];

type Record_ = {
  id: string;
  label: string;
  classification: string;
  category: string;
  status: string;
  retainUntil: string | null;
  legalHold: boolean;
  holdReason: string | null;
  note: string | null;
};

/** Records Harmonious keeps after the engagement ends. */
export function RetentionList({
  caseId,
  clientId,
  records,
  reviewedAt,
  canManage,
}: {
  caseId: string;
  clientId: string;
  records: Record_[];
  reviewedAt: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveRetentionRecord);
  const review = useServerFn(markRetentionReviewed);

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [classification, setClassification] = useState(CLASSIFICATIONS[0]!);
  const [status, setStatus] = useState("retained");
  const [retainUntil, setRetainUntil] = useState("");
  const [legalHold, setLegalHold] = useState(false);
  const [holdReason, setHoldReason] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["offboarding-case", caseId] });

  const add = useMutation({
    mutationFn: () =>
      save({
        data: {
          caseId,
          clientId,
          label,
          category,
          classification,
          status,
          retainUntil: retainUntil || null,
          legalHold,
          holdReason: holdReason.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Record added.");
      setLabel("");
      setRetainUntil("");
      setLegalHold(false);
      setHoldReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That could not be saved."),
  });

  const confirm = useMutation({
    mutationFn: () => review({ data: { id: caseId } }),
    onSuccess: () => {
      toast.success("Retained records reviewed.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That could not be saved."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retained records</CardTitle>
        <CardDescription>
          What Harmonious continues to hold after the engagement ends. Records may be kept for
          legal, regulatory, audit or claims reasons. This list is a record of what is held, not
          legal advice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing listed yet.</p>
        ) : null}
        {records.map((r) => (
          <div key={r.id} className="rounded-lg border p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.label}</span>
              <Badge variant="outline">{r.category}</Badge>
              <Badge variant="secondary">{r.classification}</Badge>
              {r.legalHold ? <Badge variant="destructive">On hold</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {r.status}
              {r.retainUntil ? ` · held until ${r.retainUntil}` : ""}
              {r.legalHold && r.holdReason ? ` · ${r.holdReason}` : ""}
            </p>
          </div>
        ))}

        {canManage ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>What is held</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sensitivity</Label>
                <Select value={classification} onValueChange={setClassification}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>State</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Held until</Label>
                <Input
                  type="date"
                  value={retainUntil}
                  onChange={(e) => setRetainUntil(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Reason for hold</Label>
                <Input
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="Required when on hold"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={legalHold}
                onCheckedChange={(v) => setLegalHold(v === true)}
              />
              This record is on hold and cannot be released
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!label.trim() || add.isPending} onClick={() => add.mutate()}>
                Add record
              </Button>
              <Button
                variant="outline"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                {reviewedAt ? "Re-confirm list" : "Confirm this list is complete"}
              </Button>
            </div>
            {reviewedAt ? (
              <p className="text-xs text-muted-foreground">
                Last confirmed {new Date(reviewedAt).toLocaleString("en-US")}.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
