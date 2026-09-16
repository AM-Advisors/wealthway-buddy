import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgreementsHome, getMsaWorkspace, signMsa } from "@/lib/agreements.functions";

export const Route = createFileRoute("/_authenticated/client/agreements/msa")({
  component: MsaPage,
});

function MsaPage() {
  const home = useServerFn(getAgreementsHome);
  const loadMsa = useServerFn(getMsaWorkspace);
  const sign = useServerFn(signMsa);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: homeData } = useQuery({
    queryKey: ["agreements-home"],
    queryFn: () => home({ data: {} }),
  });
  const clientId = homeData?.clientId ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["msa-workspace", clientId],
    queryFn: () => loadMsa({ data: { clientId: clientId! } }),
    enabled: Boolean(clientId),
  });

  const [read, setRead] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [signature, setSignature] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      sign({
        data: {
          clientId: clientId!,
          signerName: name.trim(),
          signerTitle: title.trim(),
          typedSignature: signature.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Master services agreement executed.");
      queryClient.invalidateQueries({ queryKey: ["agreements-home"] });
      queryClient.invalidateQueries({ queryKey: ["msa-workspace", clientId] });
      navigate({ to: "/client/agreements" });
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not record the signature."),
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const executed = Boolean(data.agreement?.executedAt);
  const allRead = data.sections.every((s) => read[s.id]);
  const canSign =
    allRead && confirmed && name.trim().length > 1 && title.trim() && signature.trim().length > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/client/agreements">
              <ArrowLeft className="mr-1 h-4 w-4" /> Agreements
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Master Services Agreement</h1>
          <p className="text-sm text-muted-foreground">
            Version {data.version.version} · effective{" "}
            {new Date(data.version.effectiveDate).toLocaleDateString("en-US")}
          </p>
        </div>
        <Badge variant={executed ? "secondary" : "default"}>
          {executed ? "Executed" : "Review needed"}
        </Badge>
      </div>

      {data.version.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What changed in this version</CardTitle>
            <CardDescription>{data.version.summary}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-4">
        {data.sections.map((section) => (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {section.no}. {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {section.body}
              </p>
              {!executed && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(read[section.id])}
                    onCheckedChange={(v) => setRead((prev) => ({ ...prev, [section.id]: v === true }))}
                  />
                  I have read this section
                </label>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {data.signatures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signature history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.signatures.map((s, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {s.name}
                {s.title ? `, ${s.title}` : ""} · {s.side === "client" ? "Client" : "Harmonious"} ·{" "}
                {new Date(s.signedAt).toLocaleString("en-US")}
                {s.version ? ` · ${s.version}` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {data.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Earlier versions</CardTitle>
            <CardDescription>Executed versions stay on record exactly as signed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.history.map((h) => (
              <p key={h.id} className="text-sm text-muted-foreground">
                {h.version} · executed {new Date(h.executedAt).toLocaleDateString("en-US")}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {!executed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign</CardTitle>
            <CardDescription>
              Typing your name below is your electronic signature and binds your organisation to
              this agreement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="msa-name">Full legal name</Label>
                <Input id="msa-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="msa-title">Title</Label>
                <Input id="msa-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="msa-sign">Type your name to sign</Label>
              <Input
                id="msa-sign"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                className="font-serif text-lg"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
              <span>
                I have authority to sign for my organisation and I accept this agreement as written.
              </span>
            </label>
            {!allRead && (
              <p className="text-xs text-muted-foreground">
                Confirm you've read every section before signing.
              </p>
            )}
            <Button disabled={!canSign || mutation.isPending} onClick={() => mutation.mutate()}>
              <Check className="mr-2 h-4 w-4" />
              {mutation.isPending ? "Recording…" : "Sign agreement"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
