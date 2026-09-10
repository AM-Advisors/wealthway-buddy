import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listFundFeeSources, setFundFeeSource } from "@/lib/fund-fees.functions";

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function sourceText(source: string) {
  if (source === "client_rate") return "Client agreed rate";
  if (source === "standard") return "Standard rate card";
  return "Set just for this fund";
}

/** Every fund fee, where it comes from, and where it no longer matches the
 *  client's agreed rates. */
export function FeeSourcesBoard() {
  const queryClient = useQueryClient();
  const load = useServerFn(listFundFeeSources);
  const save = useServerFn(setFundFeeSource);
  const [search, setSearch] = useState("");
  const [onlyMismatch, setOnlyMismatch] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-fee-sources"],
    queryFn: () => load(),
    retry: false,
  });

  const mut = useMutation({
    mutationFn: (vars: any) => save({ data: vars }),
    onSuccess: () => {
      toast.success("Fee now follows the agreed rate.");
      queryClient.invalidateQueries({ queryKey: ["fund-fee-sources"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const rows = useMemo(() => {
    let list = data?.rows ?? [];
    if (onlyMismatch) list = list.filter((r: any) => r.matches === false);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r: any) =>
        `${r.fundName} ${r.clientName ?? ""} ${r.kindLabel}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, onlyMismatch, search]);

  const mismatches = (data?.rows ?? []).filter((r: any) => r.matches === false).length;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading fees…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as any).message}</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where fund fees come from</CardTitle>
        <CardDescription>
          Wire fees and closing costs read from the client's agreed rates, then the published rate
          card. {mismatches} fee{mismatches === 1 ? "" : "s"} differ from an agreed rate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="Search fund or client"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            variant={onlyMismatch ? "default" : "outline"}
            onClick={() => setOnlyMismatch(!onlyMismatch)}
          >
            Only differences
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fund</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>In use</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Agreed rate</TableHead>
              <TableHead>Rate card</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={`${r.offeringId}-${r.kind}`}>
                <TableCell className="font-medium">{r.fundName}</TableCell>
                <TableCell>{r.clientName ?? "—"}</TableCell>
                <TableCell>{r.kindLabel}</TableCell>
                <TableCell>{money(r.cents)}</TableCell>
                <TableCell>
                  {sourceText(r.source)}
                  {r.matches === false ? (
                    <Badge variant="destructive" className="ml-2">
                      Differs
                    </Badge>
                  ) : null}
                  {r.reason ? (
                    <p className="text-xs text-muted-foreground">{r.reason}</p>
                  ) : null}
                </TableCell>
                <TableCell>{money(r.agreedCents)}</TableCell>
                <TableCell>{money(r.standardCents)}</TableCell>
                <TableCell className="text-right">
                  {data?.canManage && r.agreedCents != null && r.matches === false ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mut.isPending}
                      onClick={() =>
                        mut.mutate({
                          offeringId: r.offeringId,
                          kind: r.kind,
                          source: "client_rate",
                        })
                      }
                    >
                      Use agreed rate
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground">
                  Nothing to show.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
