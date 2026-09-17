import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  generateStatementForApplication,
  listStatementsForApplication,
} from "@/lib/capital-statements.functions";
import { capitalStatementPdfSpec } from "@/components/capital-statement-document";
import { downloadPdfDoc, openPdfDoc } from "@/lib/pdf-render";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

export async function openStatement(statement: any) {
  const opened = await openPdfDoc(capitalStatementPdfSpec(statement));
  if (!opened) toast.error("Allow pop-ups to view the statement.");
}

export async function downloadStatement(statement: any) {
  await downloadPdfDoc(capitalStatementPdfSpec(statement));
}

/** Statement history for one investor, with a view, download and — for staff —
 *  a way to produce a fresh one after the fund's records change. */
export function CapitalStatementPanel({
  applicationId,
  canRegenerate = false,
}: {
  applicationId: string;
  canRegenerate?: boolean;
}) {
  const queryClient = useQueryClient();
  const list = useServerFn(listStatementsForApplication);
  const regenerate = useServerFn(generateStatementForApplication);

  const { data, isLoading } = useQuery({
    queryKey: ["capital-statements", applicationId],
    queryFn: () => list({ data: { application_id: applicationId } }),
    retry: false,
  });

  const rows = (data?.rows ?? []) as any[];

  const mutation = useMutation({
    mutationFn: () => regenerate({ data: { application_id: applicationId } }),
    onSuccess: () => {
      toast.success("A new capital account statement is ready.");
      queryClient.invalidateQueries({ queryKey: ["capital-statements", applicationId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not produce the statement."),
  });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Capital account statement</p>
          <p className="text-xs text-muted-foreground">
            Produced from the fund's records at the closing. Not a valuation, audit or tax document.
          </p>
        </div>
        {canRegenerate ? (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Producing…" : rows.length ? "Produce a new one" : "Produce"}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canRegenerate
            ? "No statement yet for this investor."
            : "Your statement will appear here shortly."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {new Date(`${s.statement_date}T00:00:00`).toLocaleDateString()} ·{" "}
                {money(s.snapshot?.contributedCents)} contributed
                {s.superseded ? null : null}
              </span>
              <span className="flex items-center gap-2">
                {s.superseded ? (
                  <Badge variant="outline">Replaced</Badge>
                ) : (
                  <Badge variant="secondary">Current</Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => void openStatement(s)}>
                  View
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void downloadStatement(s)}>
                  Download
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
