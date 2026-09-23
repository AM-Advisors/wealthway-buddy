import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { createCapCompany } from "@/lib/captable.functions";
import { useCapTable } from "@/components/captable/captable-context";
import { useOptionalClientPortal } from "@/components/client-portal-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Company → Cap Table when no cap table exists yet. Creates the company record
 * for the founder's own company only (the server/database refuse any other
 * company). No ownership is created here — that comes from issued securities.
 */
export function CapTableSetup() {
  const portal = useOptionalClientPortal();
  const { setCompanyId, refetch } = useCapTable();
  const create = useServerFn(createCapCompany);
  const [mode, setMode] = useState<"choose" | "new">("choose");
  const [form, setForm] = useState({ name: "", legalName: "", entityType: "C corporation", jurisdiction: "Delaware", authorizedShares: "" });

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          clientId: portal!.clientId!,
          name: form.name.trim(),
          legalName: form.legalName.trim() || null,
          entityType: form.entityType || null,
          jurisdiction: form.jurisdiction || null,
          authorizedShares: Number(form.authorizedShares.replace(/[,\s]/g, "")) || 0,
        },
      }),
    onSuccess: (r: any) => {
      toast.success("Cap table started. Next, add stakeholders and issue securities.");
      setCompanyId(r.companyId);
      refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not start the cap table"),
  });

  if (!portal?.clientId) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">No cap table yet</CardTitle>
          <CardDescription>Open your company workspace to set up a cap table.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (mode === "choose") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Set Up Your Cap Table</CardTitle>
          <CardDescription>
            Record who owns your company. Ownership is always calculated from the shares and securities you record.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button size="lg" onClick={() => setMode("new")}>Start a New Cap Table</Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/client/cap-table/migration">Import Existing Cap Table</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Step 1 of 5 — Confirm your company</CardTitle>
        <CardDescription>Then: share classes → stakeholders → securities → review ownership.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ct-name">Company name</Label><Input id="ct-name" value={form.name} onChange={set("name")} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ct-legal">Legal name</Label><Input id="ct-legal" value={form.legalName} onChange={set("legalName")} placeholder="As on your formation documents" /></div>
        <div className="space-y-1.5"><Label htmlFor="ct-type">Entity type</Label><Input id="ct-type" value={form.entityType} onChange={set("entityType")} /></div>
        <div className="space-y-1.5"><Label htmlFor="ct-jur">State / jurisdiction</Label><Input id="ct-jur" value={form.jurisdiction} onChange={set("jurisdiction")} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ct-auth">Authorized shares</Label><Input id="ct-auth" inputMode="numeric" value={form.authorizedShares} onChange={set("authorizedShares")} /></div>
        <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setMode("choose")}>Back</Button>
          <Button disabled={!form.name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
