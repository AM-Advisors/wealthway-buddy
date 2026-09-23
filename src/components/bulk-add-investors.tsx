import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { inviteInvestorFn } from "@/lib/investor-onboarding.functions";
import { parseInvestorCsv, type InvestorRow } from "@/lib/self-service-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Sent = Record<number, "sending" | "sent" | string>;

/**
 * Fund → Investors → Add Multiple Investors. Upload or paste rows, review,
 * then send each invitation individually through the same email-bound
 * invitation used for single investors. Nothing is sent on upload.
 */
export function BulkAddInvestors({ fundId, existingEmails = [] }: { fundId: string; existingEmails?: string[] }) {
  const qc = useQueryClient();
  const invite = useServerFn(inviteInvestorFn);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<InvestorRow[] | null>(null);
  const [sent, setSent] = useState<Sent>({});

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) return setText("");
    setText(await file.text());
  };

  const send = async (row: InvestorRow) => {
    setSent((s) => ({ ...s, [row.line]: "sending" }));
    try {
      await invite({
        data: {
          offeringId: fundId,
          email: row.email,
          name: row.name || null,
          intendedAmountCents: row.amountCents,
          source: row.investorType === "unknown" ? "manager" : `manager:${row.investorType}`,
        },
      });
      setSent((s) => ({ ...s, [row.line]: "sent" }));
      void qc.invalidateQueries({ queryKey: ["fund-investor-progress", fundId] });
    } catch (e) {
      setSent((s) => ({ ...s, [row.line]: e instanceof Error ? e.message.replace(/^Forbidden:\s*/, "") : "Failed" }));
    }
  };

  const valid = (rows ?? []).filter((r) => !r.errors.length && sent[r.line] !== "sent");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Multiple Investors</CardTitle>
        <CardDescription>Upload a CSV or paste rows: name, email, amount, investor type. You'll review everything before any invitation is sent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!rows ? (
          <>
            <input type="file" accept=".csv,text/csv,text/plain" aria-label="Upload investor spreadsheet" className="block w-full text-sm" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"name,email,amount,type\nJane Doe,jane@example.com,250000,individual"} />
            <Button disabled={!text.trim()} onClick={() => setRows(parseInvestorCsv(text, existingEmails))}>Review investors</Button>
          </>
        ) : (
          <>
            <ul className="divide-y rounded-md border">
              {rows.map((r) => {
                const st = sent[r.line];
                return (
                  <li key={r.line} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name || r.email || `Row ${r.line}`}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.email} {r.amountCents ? `· $${(r.amountCents / 100).toLocaleString()}` : ""}</p>
                      {r.errors.map((e) => <p key={e} className="text-xs text-destructive">Row {r.line}: {e}</p>)}
                      {st && st !== "sending" && st !== "sent" && <p className="text-xs text-destructive">{st}</p>}
                    </div>
                    {st === "sent" ? <Badge>Invitation sent</Badge> : r.errors.length ? <Badge variant="outline">Fix and re-upload</Badge> : (
                      <Button size="sm" variant="outline" disabled={st === "sending"} onClick={() => void send(r)}>{st && st !== "sending" ? "Retry" : "Send Invitation"}</Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => { setRows(null); setSent({}); }}>Start over</Button>
              <Button disabled={!valid.length} onClick={async () => { for (const r of valid) await send(r); }}>Send {valid.length} invitation{valid.length === 1 ? "" : "s"}</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
