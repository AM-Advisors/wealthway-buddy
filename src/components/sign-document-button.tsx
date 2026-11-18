import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { startBoxSigning } from "@/lib/box-sign.functions";
import { prepareSubscriptionDocumentsFn } from "@/lib/investor-onboarding.functions";

/** Opens the signing session for one document of this investment, from wherever the investor is. */
export function SignDocumentButton({ onboardingId, documentId, prepared = true, label = "Review & Sign", size = "sm" }: {
  onboardingId: string; documentId: string; prepared?: boolean; label?: string; size?: "sm" | "default";
}) {
  const qc = useQueryClient();
  const prepareFn = useServerFn(prepareSubscriptionDocumentsFn);
  const signFn = useServerFn(startBoxSigning);
  const m = useMutation({
    mutationFn: async () => {
      if (!prepared) await prepareFn({ data: { onboardingId } });
      return signFn({ data: { offering_document_id: documentId, onboarding_id: onboardingId } });
    },
    onSuccess: (r: any) => {
      if (r?.url) { window.location.assign(r.url); return; }
      if (r?.sentTo) toast.success(`Sent to ${r.sentTo} to sign. They'll get an email with a secure signing link.`);
      else toast.error("The signing page couldn't open. Please try again in a minute.");
      void qc.invalidateQueries({ queryKey: ["onboarding", onboardingId] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });
  return (
    <Button size={size} disabled={m.isPending} onClick={() => m.mutate()}>
      {m.isPending ? "Opening…" : label}
    </Button>
  );
}
