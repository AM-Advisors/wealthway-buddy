/**
 * A Harmonious specialist brings a client's actual Carta, Pulley, AngelList or
 * spreadsheet export in on their behalf. It creates the same reviewable batch a
 * founder upload creates — real rows, real column mapping, real reconciliation —
 * and opens a concierge case against it. Nothing reaches the cap table until the
 * founder approves the prepared batch.
 */
import { useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getConciergeCompanies,
  startStaffMigration,
} from "@/lib/captable-concierge.functions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function StaffMigrationIntake({ onStarted }: { onStarted: (caseId: string) => void }) {
  const loadCompanies = useServerFn(getConciergeCompanies);
  const start = useServerFn(startStaffMigration);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [companyId, setCompanyId] = useState<string>("");
  const [priority, setPriority] = useState<"standard" | "urgent">("standard");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const companies = useQuery({
    queryKey: ["cap-concierge-companies"],
    queryFn: () => loadCompanies(),
  });

  const create = useMutation({
    mutationFn: (payload: {
      fileName: string;
      headers: string[];
      rows: Record<string, unknown>[];
    }) =>
      start({
        data: {
          companyId,
          fileName: payload.fileName,
          headers: payload.headers,
          rows: payload.rows,
          priority,
          note: note.trim() || null,
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
        },
      }),
    onSuccess: async (result) => {
      toast.success(`${result.provider} export read. Case opened and assigned to you.`);
      setNote("");
      setContactName("");
      setContactEmail("");
      await queryClient.invalidateQueries({ queryKey: ["cap-concierge-queue"] });
      onStarted(result.caseId);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "We could not start that migration."),
  });

  async function handleFile(file: File) {
    if (!companyId) {
      toast.error("Choose the client company first.");
      return;
    }
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheet = book.SheetNames[0];
      const sheet = firstSheet ? book.Sheets[firstSheet] : undefined;
      if (!sheet) throw new Error("That file has no readable sheet.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
        raw: false,
      });
      if (rows.length === 0) throw new Error("That file has no rows under the headings.");
      const headers = Object.keys(rows[0]!);
      await create.mutateAsync({ fileName: file.name, headers, rows: rows.slice(0, 5000) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not read that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const list = companies.data?.companies ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Start a migration from a client file</CardTitle>
        <CardDescription>
          Upload the client's own Carta, Pulley, AngelList or spreadsheet export. It is read
          straight away and opens a case here with their real rows — the founder still approves it
          before anything is recorded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="intake-company">Client company</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger id="intake-company">
                <SelectValue
                  placeholder={
                    companies.isLoading
                      ? "Loading companies…"
                      : list.length
                        ? "Choose a company"
                        : "No client companies yet"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {list.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                    {company.client ? ` — ${company.client}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intake-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as "standard" | "urgent")}
            >
              <SelectTrigger id="intake-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="urgent">Time sensitive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intake-contact">Founder contact name</Label>
            <Input
              id="intake-contact"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Who we speak to about this file"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intake-email">Founder contact email</Label>
            <Input
              id="intake-email"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="intake-note">What the client told us</Label>
          <Textarea
            id="intake-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Where the file came from, anything they flagged, what they expect to see."
          />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={busy || create.isPending || !companyId}
          >
            {busy || create.isPending ? "Reading the file…" : "Upload the client's export"}
          </Button>
          <p className="text-xs text-muted-foreground">
            CSV or Excel, up to 5,000 lines. The demo company is not available here — sample data is
            never mixed with a client's record.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
