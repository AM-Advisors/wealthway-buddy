import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readOfferingDocument } from "@/lib/offering-documents.functions";
import { LoadError } from "@/components/load-error";
import { OfferingDocumentContent } from "@/components/offering-document-content";

export function OfferingDocumentReader({ documentId, onboardingId, title, onReachedEnd }: { documentId: string; onboardingId?: string; title: string; onReachedEnd: () => void }) {
  const load = useServerFn(readOfferingDocument);
  const query = useQuery({ queryKey: ["offering-document-read", documentId, onboardingId ?? null], queryFn: () => load({ data: { document_id: documentId, onboarding_id: onboardingId } }), retry: false, staleTime: 0 });
  const doc = query.data;
  if (query.isPending) return <p className="text-sm text-muted-foreground">Opening the document…</p>;
  if (query.error) return <div className="space-y-2"><p className="text-sm text-destructive">{query.error.message}</p><LoadError error={query.error} what={title} audience="account" onRetry={() => void query.refetch()} /></div>;
  if (!doc) return null;
  return <OfferingDocumentContent key={`${documentId}:${onboardingId ?? ""}:${doc.url ?? doc.body}`} doc={doc} title={title} onReachedEnd={onReachedEnd} />;
}