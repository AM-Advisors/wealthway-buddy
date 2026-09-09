import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  listManagedWireInstructions,
  saveManagedWireInstructions,
} from "@/lib/wire-instructions.functions";
import { WIRE_FIELDS } from "@/lib/offerings.functions";
import { FIELD_LABELS } from "@/lib/offering-audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/wire")({
  head: () => ({
    meta: [
      { title: "Wire Instructions — Harmonious Admin" },
      {
        name: "description",
        content:
          "Update each Harmonious fund's bank and wire details in one place; investors see the latest instructions in their portal immediately.",
      },
      { property: "og:title", content: "Wire Instructions — Harmonious Admin" },
      {
        property: "og:description",
        content: "One panel for fund managers and admins to keep every fund's wire details current.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WireAdminPage,
});

type WireKey = (typeof WIRE_FIELDS)[number];

const emptyWire = () => Object.fromEntries(WIRE_FIELDS.map((k) => [k, ""])) as Record<WireKey, string>;

const PLACEHOLDERS: Record<WireKey, string> = {
  bank_name: "First National Bank",
  bank_address: "123 Main St, Chicago, IL 60601",
  account_name: "Harmonious Income Fund I, LP",
  account_number: "Account number",
  routing_number: "ABA / routing number",
  swift: "SWIFT / BIC (international)",
  memo: "Reference investors should include",
};

function WireAdminPage() {
  const load = useServerFn(listManagedWireInstructions);
  const save = useServerFn(saveManagedWireInstructions);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["managed-wire"],
    queryFn: () => load(),
  });

  const [forms, setForms] = useState<Record<string, Record<WireKey, string>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.funds) return;
    const next: Record<string, Record<WireKey, string>> = {};
    for (const fund of data.funds as any[]) {
      next[fund.id] = {
        ...emptyWire(),
        ...(Object.fromEntries(
          Object.entries(fund.wire_instructions ?? {}).map(([k, v]) => [k, String(v)]),
        ) as Record<WireKey, string>),
      };
    }
    setForms(next);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (input: { offering_id: string } & Record<string, string>) => save({ data: input as any }),
    onSuccess: () => {
      toast.success("Wire instructions updated — investors see them right away.");
      queryClient.invalidateQueries({ queryKey: ["managed-wire"] });
      queryClient.invalidateQueries({ queryKey: ["offerings"] });
      setSavingId(null);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Could not save the wire details.");
      setSavingId(null);
    },
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading funds…</p>;
  }

  if (!data?.canEdit) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>No funds assigned</CardTitle>
            <CardDescription>
              You need to be an administrator or an assigned fund manager to edit wire details.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Wire instructions</h1>
        <p className="text-sm text-muted-foreground">
          Update the bank details for each fund you manage. Investors with an application see the new
          details on their wire page immediately — you never need to edit a fund page.
        </p>
      </div>

      {(data.funds as any[]).length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No funds yet. Create one in <Link className="underline" to="/admin/setup">fund setup</Link>.
          </CardContent>
        </Card>
      ) : null}

      {(data.funds as any[]).map((fund) => {
        const form = forms[fund.id] ?? emptyWire();
        const filled = WIRE_FIELDS.filter((f) => (form[f] ?? "").trim() !== "").length;
        return (
          <Card key={fund.id}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {fund.name}
                  <Badge variant={filled > 0 ? "secondary" : "outline"}>
                    {filled > 0 ? `${filled} of ${WIRE_FIELDS.length} fields set` : "Not set up"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {fund.reg_type === "506c" ? "Reg D 506(c)" : "Reg D 506(b)"} ·{" "}
                  {fund.wire_updated_at
                    ? `Last updated ${new Date(fund.wire_updated_at).toLocaleString()}`
                    : "Never updated"}
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/fund/$fundId" params={{ fundId: fund.id }}>
                  Fund page
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {WIRE_FIELDS.map((field) => (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`${fund.id}-${field}`}>{FIELD_LABELS[field] ?? field}</Label>
                    <Input
                      id={`${fund.id}-${field}`}
                      value={form[field] ?? ""}
                      placeholder={PLACEHOLDERS[field]}
                      autoComplete="off"
                      onChange={(e) =>
                        setForms((prev) => ({
                          ...prev,
                          [fund.id]: { ...(prev[fund.id] ?? emptyWire()), [field]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={savingId === fund.id}
                  onClick={() => {
                    setSavingId(fund.id);
                    mutation.mutate({ offering_id: fund.id, ...form });
                  }}
                >
                  {savingId === fund.id ? "Saving…" : "Save wire details"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setForms((prev) => ({
                      ...prev,
                      [fund.id]: {
                        ...emptyWire(),
                        ...(Object.fromEntries(
                          Object.entries(fund.wire_instructions ?? {}).map(([k, v]) => [k, String(v)]),
                        ) as Record<WireKey, string>),
                      },
                    }))
                  }
                >
                  Reset
                </Button>
                <p className="text-xs text-muted-foreground">
                  Every change is recorded in the fund's change history.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
