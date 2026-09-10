import { AlertTriangle } from "lucide-react";

type Hold = {
  id: string;
  scope: string;
  reason: string;
  client_explanation?: string | null;
  remediation?: string | null;
};

const SCOPE_LABELS: Record<string, string> = {
  investor_onboarding: "Investor onboarding",
  banking: "Bank activity",
  wires: "Wires",
  distributions: "Distributions",
  filings: "Regulatory filings",
  entity_actions: "Entity actions",
  document_execution: "Document execution",
  account_activity: "Account activity",
  service_delivery: "Service delivery",
};

/** Shown wherever an activity is paused, with the client-safe explanation only. */
export function HoldBanner({ holds }: { holds: Hold[] }) {
  if (!holds?.length) return null;
  return (
    <div className="space-y-2">
      {holds.map((hold) => (
        <div
          key={hold.id}
          className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium">
              {SCOPE_LABELS[hold.scope] ?? hold.scope} is on hold
            </p>
            <p className="mt-1 text-muted-foreground">
              {hold.client_explanation ||
                "Harmonious has paused this activity while a compliance review is completed."}
            </p>
            {hold.remediation ? (
              <p className="mt-1 text-muted-foreground">To clear it: {hold.remediation}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
