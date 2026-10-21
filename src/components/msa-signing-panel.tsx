import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SignHereTag, useSignHere } from "@/components/signature-adopt-dialog";
import { getMsaWorkspace, signMsa } from "@/lib/agreements.functions";

/**
 * The MSA body, signature history and typed-signature form for one client.
 * Shared by the Agreements page and the login gate that blocks the portal
 * until the current version is signed.
 */
export function MsaSigningPanel({
  clientId,
  onSigned,
}: {
  clientId: string;
  onSigned?: () => void;
}) {
  const loadMsa = useServerFn(getMsaWorkspace);
  const sign = useServerFn(signMsa);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["msa-workspace", clientId],
    queryFn: () => loadMsa({ data: { clientId } }),
  });

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const sig = useSignHere(name);
  const [confirmed, setConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      sign({
        data: {
          clientId,
          signerName: name.trim(),
          signerTitle: title.trim(),
          typedSignature: sig.signature?.name ?? name.trim(),
          signature: sig.signature ? { method: sig.signature.method, image: sig.signature.image } : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Signed. Harmonious will countersign to make it active.");
      queryClient.invalidateQueries({ queryKey: ["agreements-home"] });
      queryClient.invalidateQueries({ queryKey: ["msa-workspace", clientId] });
      queryClient.invalidateQueries({ queryKey: ["msa-gate"] });
      onSigned?.();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not record the signature."),
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const executed = Boolean(data.agreement?.executedAt);
  const clientSigned = !executed && data.agreement?.status === "client_signed";
  const canSign =
    confirmed && name.trim().length > 1 && title.trim() && sig.signed;

  return (
    <div className="space-y-6">
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

      {!executed && !clientSigned && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign</CardTitle>
            <CardDescription>
              Click the yellow Sign here tag to type, draw or upload your signature. It binds your
              organization to this agreement.
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
              <Label>Signature</Label>
              <SignHereTag signature={sig.signature} signed={sig.signed} onClick={sig.click} />
              {sig.dialog}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
              <span>
                I have had the opportunity to review this agreement, I have authority to sign for
                my organization, and I accept this agreement as written.
              </span>
            </label>
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
