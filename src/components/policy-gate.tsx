import type { ReactNode } from "react";
import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { acceptPolicies, getPolicyStatus } from "@/lib/policies.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PRIVACY_POLICY, TERMS_OF_SERVICE, legalPlainText } from "@/lib/legal-content";

/** Privacy and terms are authored in code, so the gate shows exactly what /privacy and /terms show. */
const FULL_TEXT: Record<string, string> = {
  privacy: legalPlainText(PRIVACY_POLICY),
  terms: legalPlainText(TERMS_OF_SERVICE),
};

const LEGAL_LINKS: Record<string, string> = { privacy: "/privacy", terms: "/terms" };

/** Nobody reaches the platform until the current policies are accepted. */
export function PolicyGate({
  children,
  onSignOut,
}: {
  children: ReactNode;
  onSignOut: () => void | Promise<void>;
}) {
  const fetchStatus = useServerFn(getPolicyStatus);
  const accept = useServerFn(acceptPolicies);
  const qc = useQueryClient();

  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");

  const { data, isPending, isError } = useQuery({
    queryKey: ["policy-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
    retry: 1,
  });

  const save = useMutation({
    mutationFn: (payload: { documentIds: string[]; signerName: string }) =>
      accept({ data: payload }),
    onSuccess: async () => {
      toast.success("Thank you — your acceptance is recorded.");
      await qc.invalidateQueries({ queryKey: ["policy-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record your acceptance."),
  });

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const outstanding = (data?.outstanding ?? []) as any[];
  if (isError || outstanding.length === 0) return <>{children}</>;

  const allOpened = outstanding.every((d) => opened[d.id]);
  const ready = allOpened && agreed && name.trim().length > 1;

  return (
    <div className="flex min-h-[80vh] items-start justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <Logo variant="navy" className="h-7 w-auto" />
        <h1 className="mt-6 text-2xl">Before you continue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please read each document below and confirm you accept them. You only need to do this
          once, and again if a document is later updated.
        </p>

        <div className="mt-6 space-y-3">
          {outstanding.map((doc) => (
            <div key={doc.id} className="rounded-md border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setOpened((o) => ({ ...o, [doc.id]: !o[doc.id] }))}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{doc.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    Version {doc.version} · in effect {doc.effective_date}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {opened[doc.id] ? "Hide" : "Read"}
                </span>
              </button>
              {opened[doc.id] && (
                <ScrollArea className="max-h-64 border-t px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {FULL_TEXT[doc.kind as string] ?? doc.body}
                  </p>
                  {LEGAL_LINKS[doc.kind as string] ? (
                    <a
                      href={LEGAL_LINKS[doc.kind as string]}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-xs underline underline-offset-4"
                    >
                      Open this document in a new tab
                    </a>
                  ) : null}
                </ScrollArea>
              )}
            </div>
          ))}
        </div>

        {!allOpened && (
          <p className="mt-4 text-xs text-muted-foreground">Open each document to continue.</p>
        )}

        <div className="mt-6 space-y-4 rounded-md border p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="policy-agree"
              checked={agreed}
              disabled={!allOpened}
              onCheckedChange={(v) => setAgreed(v === true)}
            />
            <Label htmlFor="policy-agree" className="text-sm font-normal leading-relaxed">
              I have read and accept the documents above, and I agree that typing my name below has
              the same effect as signing it.
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="policy-name">Your full name</Label>
            <Input
              id="policy-name"
              value={name}
              disabled={!allOpened}
              placeholder="Type your full name"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!ready || save.isPending}
              onClick={() =>
                save.mutate({
                  documentIds: outstanding.map((d) => d.id),
                  signerName: name.trim(),
                })
              }
            >
              {save.isPending ? "Recording…" : "I agree"}
            </Button>
            <Button variant="outline" onClick={() => void onSignOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
