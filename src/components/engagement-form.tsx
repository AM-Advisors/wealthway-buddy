import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BILLING_FREQUENCIES,
  DELIVERY_STATUSES,
  listLinkableSows,
  saveEngagement,
} from "@/lib/engagements.functions";

/** Creates a new engagement for a client, optionally tied to one entity. */
export function EngagementForm({
  clientId,
  entityId,
  defaultTitle,
  defaultFrequency,
  onDone,
}: {
  clientId: string;
  entityId: string | null;
  defaultTitle: string;
  defaultFrequency: string;
  onDone: () => void;
}) {
  const save = useServerFn(saveEngagement);
  const loadSows = useServerFn(listLinkableSows);
  const { data: sows } = useQuery({
    queryKey: ["linkable-sows", clientId],
    queryFn: () => loadSows({ data: { clientId } }),
  });

  const [form, setForm] = useState({
    title: defaultTitle,
    billingFrequency: defaultFrequency,
    sowId: "none",
    effectiveDate: "",
    deliveryStatus: "not_started",
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          clientId,
          entityId,
          sowId: form.sowId === "none" ? null : form.sowId,
          title: form.title,
          billingFrequency: form.billingFrequency as any,
          effectiveDate: form.effectiveDate || null,
          deliveryStatus: form.deliveryStatus as any,
        },
      }),
    onSuccess: () => {
      toast.success("Engagement created.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the engagement."),
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label className="text-xs">Title</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Billing frequency</Label>
        <Select
          value={form.billingFrequency}
          onValueChange={(v) => setForm({ ...form, billingFrequency: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILLING_FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Statement of work</Label>
        <Select value={form.sowId} onValueChange={(v) => setForm({ ...form, sowId: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None yet</SelectItem>
            {(sows ?? [])
              .filter((s) => !s.linked)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Effective date</Label>
        <Input
          type="date"
          value={form.effectiveDate}
          onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Delivery status</Label>
        <Select
          value={form.deliveryStatus}
          onValueChange={(v) => setForm({ ...form, deliveryStatus: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELIVERY_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Button
          size="sm"
          disabled={mutation.isPending || form.title.trim().length < 2}
          onClick={() => mutation.mutate()}
        >
          Create engagement
        </Button>
      </div>
    </div>
  );
}
