import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Clock } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { acceptPolicies, getPolicyStatus } from "@/lib/policies.functions";

export const Route = createFileRoute("/_authenticated/sign-off")({
  head: () => ({
    meta: [
      { title: "Your sign-off — Harmonious" },
      {
        name: "description",
        content:
          "Read and sign the privacy notice, platform terms, fee schedule, electronic-records consent and fund migration agreement, and see when each was signed.",
      },
      { property: "og:title", content: "Your sign-off — Harmonious" },
      {
        property: "og:description",
        content: "Sign the Harmonious platform documents and keep a record of each signature.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignOffPage,
});

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

function SignOffPage() {
  const fetchStatus = useServerFn(getPolicyStatus);
  const accept = useServerFn(acceptPolicies);
  const qc = useQueryClient();

  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");

  const { data, isPending, isError } = useQuery({
    queryKey: ["policy-status"],
    queryFn: () => fetchStatus(),
  });

  const save = useMutation({
    mutationFn: (payload: { documentIds: string[]; signerName: string }) => accept({ data: payload }),
    onSuccess: async () => {
      toast.success("Signed. Your record is saved with the date and time.");
      setAgreed(false);
      setName("");
      await qc.invalidateQueries({ queryKey: ["policy-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record your signature."),
  });

  if (isPending) return <main className="p-10 text-sm text-muted-foreground">Loading…</main>;
  if (isError)
    return <main className="p-10 text-sm text-destructive">Could not load your documents.</main>;

  const documents = (data?.documents ?? []) as any[];
  const outstanding = (data?.outstanding ?? []) as any[];
  const accepted = (data?.accepted ?? []) as any[];
  const complete = outstanding.length === 0 && documents.length > 0;
  const allOpened = outstanding.every((d) => opened[d.id]);
  const ready = allOpened && agreed && name.trim().length > 1;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">Your sign-off</h1>
        {complete ? (
          <Badge className="gap-1">
            <BadgeCheck className="h-4 w-4" aria-hidden /> Sign-off complete
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-4 w-4" aria-hidden /> {outstanding.length} still to sign
          </Badge>
        )}
      </div>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        The privacy notice, platform terms, fee schedule, electronic-records consent and fund
        migration agreement. You sign each one once, and again only if it is updated.
      </p>

      <div className="space-y-3">
        {documents.map((doc) => {
          const signed = accepted.find((a) => a.document_id === doc.id);
          const isOpen = opened[doc.id];
          return (
            <Card key={doc.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{doc.title}</CardTitle>
                    <CardDescription>
                      Version {doc.version} · in effect {doc.effective_date}
                    </CardDescription>
                  </div>
                  {signed ? (
                    <Badge variant="secondary">Signed {when(signed.accepted_at)}</Badge>
                  ) : (
                    <Badge variant="outline">Not signed yet</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpened((o) => ({ ...o, [doc.id]: !o[doc.id] }))}
                >
                  {isOpen ? "Hide" : "Read"}
                </Button>
                {isOpen ? (
                  <ScrollArea className="mt-3 h-56 rounded-md border p-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{doc.body}</p>
                  </ScrollArea>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {outstanding.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Sign the remaining documents</CardTitle>
            <CardDescription>
              Open and read each one above, then type your full name. We record your name, the date
              and time, and the device you signed from.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
              <span>
                I have read and accept the {outstanding.length} document
                {outstanding.length === 1 ? "" : "s"} still outstanding above.
              </span>
            </label>
            <div>
              <Label htmlFor="signature">Full legal name</Label>
              <Input
                id="signature"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <Button
              disabled={!ready || save.isPending}
              onClick={() =>
                save.mutate({
                  documentIds: outstanding.map((d) => d.id),
                  signerName: name.trim(),
                })
              }
            >
              Sign and record
            </Button>
            {!allOpened ? (
              <p className="text-xs text-muted-foreground">Open each outstanding document first.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Everything is signed. Nothing further is needed from you here.
        </p>
      )}
    </main>
  );
}
