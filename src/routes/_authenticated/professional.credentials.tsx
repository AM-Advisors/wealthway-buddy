import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CREDENTIAL_LABELS, CREDENTIAL_TYPES, type CredentialType } from "@/lib/signatory-model";
import { listCredentials, upsertCredential } from "@/lib/signatory.functions";

function MyCredentials() {
  const load = useServerFn(listCredentials);
  const save = useServerFn(upsertCredential);
  const qc = useQueryClient();

  const [type, setType] = useState<CredentialType>("attorney_bar");
  const [jurisdiction, setJurisdiction] = useState("");
  const [number, setNumber] = useState("");
  const [expires, setExpires] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["my-credentials"],
    queryFn: () => load(),
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          credential_type: type,
          jurisdiction: jurisdiction || null,
          credential_number: number || null,
          expires_at: expires || null,
        },
      }),
    onSuccess: () => {
      toast.success("Sent to Harmonious for verification.");
      setJurisdiction("");
      setNumber("");
      setExpires("");
      void qc.invalidateQueries({ queryKey: ["my-credentials"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that."),
  });

  const credentials = (data?.credentials ?? []) as any[];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Your licence or registration says who you are professionally. It never creates authority over
        a client's affairs on its own.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add a credential</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CredentialType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREDENTIAL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CREDENTIAL_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="cred-jurisdiction">
              Jurisdiction
            </Label>
            <Input
              id="cred-jurisdiction"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="cred-number">
              Number
            </Label>
            <Input id="cred-number" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="cred-expires">
              Expires
            </Label>
            <Input
              id="cred-expires"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              Submit for verification
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!isPending && credentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing added yet.</p>
          ) : null}
          {credentials.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {CREDENTIAL_LABELS[c.credential_type as CredentialType] ?? c.credential_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[c.jurisdiction, c.credential_number].filter(Boolean).join(" · ") || "—"}
                  {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              <Badge variant={c.status === "verified" ? "default" : "secondary"}>{c.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/professional/credentials")({
  head: () => ({
    meta: [
      { title: "My credentials — Harmonious" },
      {
        name: "description",
        content: "Record and verify your professional licence, bar admission or registration.",
      },
      { property: "og:title", content: "My credentials — Harmonious" },
      { property: "og:description", content: "Professional credentials held with Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyCredentials,
});
