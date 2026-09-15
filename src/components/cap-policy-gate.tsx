import type { ReactNode } from "react";
import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { acceptPolicies, getCapTablePolicyStatus } from "@/lib/policies.functions";
import { CAP_TABLE_PRIVACY, CAP_TABLE_TERMS, legalPlainText } from "@/lib/legal-content";

/** Same text the public pages show, so the gate and the pages cannot drift apart. */
const FULL_TEXT: Record<string, string> = {
  cap_privacy: legalPlainText(CAP_TABLE_PRIVACY),
  cap_terms: legalPlainText(CAP_TABLE_TERMS),
};

const LINKS: Record<string, string> = {
  cap_privacy: "/cap-table-privacy",
  cap_terms: "/cap-table-terms",
};

/**
 * Founders accept the CapTable notice and terms before using the cap table,
 * and again whenever a newer version is published.
 */
export function CapPolicyGate({ children }: { children: ReactNode }) {
  const fetchStatus = useServerFn(getCapTablePolicyStatus);
  const accept = useServerFn(acceptPolicies);
  const qc = useQueryClient();

  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");

  const { data, isPending, isError } = useQuery({
    queryKey: ["cap-policy-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
    retry: 1,
  });

  const save = useMutation({
    mutationFn: (payload: { documentIds: string[]; signerName: string }) =>
      accept({ data: payload }),
    onSuccess: async () => {
      toast.success("Thank you — your acceptance is recorded.");
      await qc.invalidateQueries({ queryKey: ["cap-policy-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record your acceptance."),
  });

  if (isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const outstanding = (data?.outstanding ?? []) as any[];
  if (isError || outstanding.length === 0) return <>{children}</>;

  const allOpened = outstanding.every((d) => opened[d.id]);
  const ready = allOpened && agreed && name.trim().length > 1;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h3 className="text-lg font-semibold tracking-tight">Before you use CapTable</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        CapTable has its own privacy notice and terms. Please read each one and confirm you accept
        it. You only do this once, and again only if a document is updated.
      </p>

      <div className="mt-5 space-y-3">
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
                {LINKS[doc.kind as string] ? (
                  <a
                    href={LINKS[doc.kind as string]}
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
            id="cap-policy-agree"
            checked={agreed}
            disabled={!allOpened}
            onCheckedChange={(v) => setAgreed(v === true)}
          />
          <Label htmlFor="cap-policy-agree" className="text-sm font-normal leading-relaxed">
            I have read and accept the documents above, and I agree that typing my name below has
            the same effect as signing it.
          </Label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cap-policy-name">Your full name</Label>
          <Input
            id="cap-policy-name"
            value={name}
            disabled={!allOpened}
            placeholder="Type your full name"
            onChange={(e) => setName(e.target.value)}
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
          {save.isPending ? "Recording…" : "I agree"}
        </Button>
      </div>
    </div>
  );
}
