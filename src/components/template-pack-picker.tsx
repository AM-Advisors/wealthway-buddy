import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TEMPLATE_PACKS, applyTemplatePack } from "@/lib/document-templates.functions";

/**
 * Lets a fund manager drop a ready-made legal pack into a fund:
 * the ILPA model documents for a pooled fund, or the SPV set for a single deal.
 */
export function TemplatePackPicker({
  offeringId,
  offeringName,
  onApplied,
}: {
  offeringId: string;
  offeringName?: string;
  onApplied?: () => void;
}) {
  const apply = useServerFn(applyTemplatePack);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (pack: "ilpa" | "spv") => apply({ data: { offering_id: offeringId, pack } }),
    onMutate: (pack) => setPending(pack),
    onSettled: () => setPending(null),
    onSuccess: (res: any) => {
      const added = res?.added ?? [];
      const skipped = res?.skipped ?? [];
      if (added.length === 0) {
        toast.info("Those documents are already on this fund.");
      } else {
        toast.success(
          `Added ${added.length} document${added.length === 1 ? "" : "s"}${
            skipped.length ? `, ${skipped.length} already there` : ""
          }.`,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["managed-fund-documents"] });
      void queryClient.invalidateQueries({ queryKey: ["fund-legal-documents"] });
      onApplied?.();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not add those documents."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start from template documents</CardTitle>
        <CardDescription>
          Add a ready-made set to {offeringName ?? "this fund"}. Everything is a starting point for
          your counsel to tailor, and investors see it straight away.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {TEMPLATE_PACKS.map((pack) => (
          <div key={pack.id} className="flex flex-col justify-between rounded-lg border p-4">
            <div className="space-y-2">
              <p className="font-medium">{pack.name}</p>
              <p className="text-sm text-muted-foreground">{pack.summary}</p>
              <ul className="space-y-1 pt-1 text-sm">
                {pack.items.map((item) => (
                  <li key={item.title} className="flex items-center gap-2">
                    <span>{item.title}</span>
                    {item.requires_signature && (
                      <Badge variant="secondary" className="text-[10px]">
                        signed
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
              {pack.id === "ilpa" && (
                <p className="text-xs text-muted-foreground">
                  Published by ilpa.org and pulled in as issued.
                </p>
              )}
            </div>
            <Button
              className="mt-4"
              disabled={pending !== null}
              onClick={() => mutation.mutate(pack.id)}
            >
              {pending === pack.id ? "Adding…" : `Use ${pack.name}`}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
