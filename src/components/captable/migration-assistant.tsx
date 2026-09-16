/**
 * The migration assistant. A specialist walks through three steps — who the
 * client is, which files we were sent, then a read-back of everything found —
 * and drops in several exports at once: shareholders, grants, rounds and a list
 * of documents. Each file is read in the browser, sorted by what it looks like,
 * and can be re-labelled by hand before anything is sent.
 *
 * Nothing reaches the live cap table here. Each file becomes a reviewable batch
 * on one concierge case, and the founder still approves the prepared work.
 */
import { useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getConciergeCompanies,
  startMigrationAssistant,
} from "@/lib/captable-concierge.functions";

import { Badge } from "@/components/ui/badge";
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

type FileKind = "shareholders" | "grants" | "rounds" | "documents";

const KIND_LABEL: Record<FileKind, string> = {
  shareholders: "Shareholders",
  grants: "Grants and options",
  rounds: "Funding rounds",
  documents: "Documents",
};

type ReadFile = {
  id: string;
  fileName: string;
  kind: FileKind;
  headers: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
};

const norm = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

/** What does this file look like, judging by its column headings? */
function guessKind(fileName: string, headers: string[]): FileKind {
  const hay = [fileName, ...headers].map(norm).join(" ");
  const has = (...words: string[]) => words.some((w) => hay.includes(w));

  if (has("vesting", "cliff", "strikeprice", "exerciseprice", "optiongrant", "grantdate"))
    return "grants";
  if (has("premoney", "postmoney", "amountraised", "roundname", "leadinvestor", "closedate"))
    return "rounds";
  if (has("documenttype", "documentname", "fileurl", "agreement", "documents"))
    return "documents";
  return "shareholders";
}

export function MigrationAssistant({ onStarted }: { onStarted: (caseId: string) => void }) {
  const loadCompanies = useServerFn(getConciergeCompanies);
  const start = useServerFn(startMigrationAssistant);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [companyId, setCompanyId] = useState("");
  const [priority, setPriority] = useState<"standard" | "urgent">("standard");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<ReadFile[]>([]);
  const [reading, setReading] = useState(false);

  const companies = useQuery({
    queryKey: ["cap-concierge-companies"],
    queryFn: () => loadCompanies(),
  });
  const list = companies.data?.companies ?? [];
  const company = list.find((c) => c.id === companyId);

  const importable = files.filter((f) => f.kind !== "documents");
  const documents = files.filter((f) => f.kind === "documents");

  const totals = useMemo(
    () => ({
      lines: files.reduce((sum, f) => sum + f.rows.length, 0),
      documents: documents.reduce((sum, f) => sum + f.rows.length, 0),
    }),
    [files, documents],
  );

  const create = useMutation({
    mutationFn: () =>
      start({
        data: {
          companyId,
          priority,
          note: note.trim() || null,
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          files: files.map((f) => ({
            kind: f.kind,
            fileName: f.fileName,
            headers: f.headers,
            rows: f.rows as Record<string, unknown>[],
          })),
        },
      }),
    onSuccess: async (result) => {
      toast.success(
        `${result.batches.length} file${result.batches.length === 1 ? "" : "s"} read. Case opened and assigned to you.`,
      );
      setFiles([]);
      setNote("");
      setContactName("");
      setContactEmail("");
      setStep(1);
      await queryClient.invalidateQueries({ queryKey: ["cap-concierge-queue"] });
      onStarted(result.caseId);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "We could not start that migration."),
  });

  async function readFiles(selected: File[]) {
    setReading(true);
    try {
      const XLSX = await import("xlsx");
      const next: ReadFile[] = [];
      for (const file of selected) {
        const buffer = await file.arrayBuffer();
        const book = XLSX.read(buffer, { type: "array", cellDates: true });
        const firstSheet = book.SheetNames[0];
        const sheet = firstSheet ? book.Sheets[firstSheet] : undefined;
        if (!sheet) {
          toast.error(`${file.name} has no readable sheet.`);
          continue;
        }
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: null,
          raw: false,
        });
        if (!rows.length) {
          toast.error(`${file.name} has no rows under the headings.`);
          continue;
        }
        const headers = Object.keys(rows[0]!);
        next.push({
          id: `${file.name}-${Date.now()}-${next.length}`,
          fileName: file.name,
          kind: guessKind(file.name, headers),
          headers,
          rows: rows.slice(0, 5000),
          truncated: rows.length > 5000,
        });
      }
      if (next.length) setFiles((current) => [...current, ...next].slice(0, 8));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not read those files.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const steps = ["Client", "Files", "Review and import"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Migration assistant</CardTitle>
        <CardDescription>
          Bring in the client's own Carta, Pulley, AngelList or spreadsheet exports — shareholders,
          grants, rounds and their document list — in one pass. Each file is sorted for you and can
          be re-labelled before it is sent. The founder still approves everything before it is
          recorded.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          {steps.map((label, index) => {
            const number = index + 1;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(number)}
                disabled={number > 1 && !companyId}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  step === number
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                } disabled:opacity-50`}
              >
                {number}. {label}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {step === 1 ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="assistant-company">Client company</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger id="assistant-company">
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
                    {list.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.client ? ` — ${item.client}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assistant-priority">Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as "standard" | "urgent")}
                >
                  <SelectTrigger id="assistant-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="urgent">Time sensitive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assistant-contact">Founder contact name</Label>
                <Input
                  id="assistant-contact"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="Who we speak to about these files"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assistant-email">Founder contact email</Label>
                <Input
                  id="assistant-email"
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="name@company.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assistant-note">What the client told us</Label>
              <Textarea
                id="assistant-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Where the files came from, anything they flagged, what they expect to see."
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!companyId}>
                Next: add their files
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                if (selected.length) void readFiles(selected);
              }}
            />
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm font-medium">Add the client's export files</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                CSV or Excel, up to 5,000 lines each and eight files in total. We sort each one into
                shareholders, grants, rounds or documents — change any of them below if we got it
                wrong.
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                disabled={reading}
              >
                {reading ? "Reading files…" : "Choose files"}
              </Button>
            </div>

            {files.length ? (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{file.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.rows.length} lines · {file.headers.length} columns
                        {file.truncated ? " · first 5,000 lines only" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={file.kind}
                        onValueChange={(value) =>
                          setFiles((current) =>
                            current.map((f) =>
                              f.id === file.id ? { ...f, kind: value as FileKind } : f,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="w-[190px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(KIND_LABEL) as FileKind[]).map((kind) => (
                            <SelectItem key={kind} value={kind}>
                              {KIND_LABEL[kind]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFiles((current) => current.filter((f) => f.id !== file.id))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!importable.length}>
                Next: review what we found
              </Button>
            </div>
            {files.length && !importable.length ? (
              <p className="text-xs text-muted-foreground">
                Add a shareholders, grants or rounds file too — a document list on its own has
                nothing to reconcile.
              </p>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{company?.name ?? "Client company"}</p>
              <p className="text-xs text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"} · {totals.lines} lines
                {totals.documents ? ` · ${totals.documents} documents listed` : ""} ·{" "}
                {priority === "urgent" ? "Time sensitive" : "Standard"}
              </p>
            </div>

            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{file.fileName}</p>
                    <Badge variant="secondary">{KIND_LABEL[file.kind]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {file.rows.length} lines · columns: {file.headers.slice(0, 6).join(", ")}
                    {file.headers.length > 6 ? `, +${file.headers.length - 6} more` : ""}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Shareholders, grants and rounds each become their own batch on one case, ready to map
              and reconcile. A document list is recorded as items to collect. Nothing is written to
              the cap table until the founder approves the prepared work.
            </p>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Reading the files…" : "Start the migration"}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
