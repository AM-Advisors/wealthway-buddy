import { Badge } from "@/components/ui/badge";
import type { ComplianceTrailRow } from "@/lib/kyc-aml.functions";

const CHECK_WORDS: Record<string, string> = {
  kyc: "Identity",
  aml: "Screening",
  accreditation: "Accreditation",
  documents: "Documents",
};

const ACTION_WORDS: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  declined: "Declined",
  info_requested: "More information requested",
  document_added: "Document added",
};

function tone(action: string) {
  if (action === "approved") return "default" as const;
  if (action === "declined" || action === "info_requested") return "destructive" as const;
  return "secondary" as const;
}

function who(row: ComplianceTrailRow) {
  const name = row.actorName ?? null;
  const role =
    row.actorRole === "investor"
      ? "investor"
      : row.actorRole === "fund_manager"
        ? "fund team"
        : "Harmonious";
  return name ? `${name} (${role})` : role;
}

export function ComplianceTrail({ rows }: { rows: ComplianceTrailRow[] }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has been submitted yet.</p>;
  }

  return (
    <ol className="divide-y rounded-md border">
      {rows.map((row) => {
        const file = (row.payload as any)?.file_name as string | undefined;
        return (
          <li key={row.id} className="space-y-1 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={tone(row.action)}>{ACTION_WORDS[row.action] ?? row.action}</Badge>
              <span className="text-sm font-medium">
                {CHECK_WORDS[row.checkKind] ?? row.checkKind}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.createdAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · {who(row)}
              </span>
            </div>
            {file ? <p className="text-sm">{file}</p> : null}
            {row.note ? <p className="text-sm text-muted-foreground">{row.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
