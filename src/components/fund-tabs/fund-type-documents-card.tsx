import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fundTypeTemplatesFn, generateFundTypeDocumentsFn } from "@/lib/fund-doc-templates.functions";
import { invalidateFund } from "@/lib/fund-query-keys";

/** The fund documents assigned to this fund's type, generated in one step from the fund's details. */
export function FundTypeDocumentsCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundTypeTemplatesFn);
  const gen = useServerFn(generateFundTypeDocumentsFn);
  const q = useQuery({ queryKey: ["fund-type-templates", fundId], queryFn: () => load({ data: { offeringId: fundId } }) });
  const m = useMutation({
    mutationFn: () => gen({ data: { offeringId: fundId } }),
    onSuccess: (r) => {
      const open = r.made.flatMap((x: { open: string[] }) => x.open);
      toast.success(r.made.length ? `Generated ${r.made.length} document${r.made.length === 1 ? "" : "s"}.${open.length ? " Some blanks need fund details - check each document." : ""}` : "All documents were already generated.");
      void q.refetch(); void qc.invalidateQueries({ queryKey: ["fund-template-docs", fundId] }); void invalidateFund(qc, fundId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isError) return null;
  const d = q.data;
  const pending = (d?.templates ?? []).filter((t: { generated: boolean }) => !t.generated).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fund documents{d?.fundType ? ` for a ${d.fundType}` : ""}</CardTitle>
        <CardDescription>These are the Harmonious templates assigned to this type of fund. They are filled from your fund's details. After generating, sign them below in Harmonious fund template documents.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!d ? <p className="text-muted-foreground">Loading…</p>
          : !d.fundType ? <p className="text-muted-foreground">Set the fund type in Fund Setup to see its documents.</p>
          : !d.templates.length ? <p className="text-muted-foreground">No templates are assigned to this fund type yet. Use Generate from template to pick one.</p> : (
            <>
              <ul className="divide-y rounded-md border">
                {d.templates.map((t: { id: string; title: string; generated: boolean }) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 p-2">
                    <span>{t.title}</span>
                    <Badge variant={t.generated ? "default" : "outline"}>{t.generated ? "Generated" : "Not generated"}</Badge>
                  </li>
                ))}
              </ul>
              <Button disabled={!pending || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Generating…" : pending ? `Generate ${pending} fund document${pending === 1 ? "" : "s"}` : "All generated"}</Button>
            </>
          )}
      </CardContent>
    </Card>
  );
}
