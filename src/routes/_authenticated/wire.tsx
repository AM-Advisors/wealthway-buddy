import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPortal } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/wire")({
  head: () => ({
    meta: [
      { title: "Wire instructions — Harmonious investor portal" },
      {
        name: "description",
        content:
          "View your fund's verified bank details, reference code and funding amount for your subscription.",
      },
      { property: "og:title", content: "Wire instructions — Harmonious investor portal" },
      {
        property: "og:description",
        content: "Fund bank details and reference code for your subscription.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WirePage,
});

const WIRE_LABEL: Record<string, string> = {
  bank_name: "Bank name",
  bank_address: "Bank address",
  account_name: "Account name",
  account_number: "Account number",
  routing_number: "Routing number (ABA)",
  swift: "SWIFT / BIC",
  reference: "Reference",
  memo: "Memo",
};

const FIELD_ORDER = Object.keys(WIRE_LABEL);

function money(cents?: number | null) {
  if (cents == null) return null;
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function WirePage() {
  const load = useServerFn(getPortal);
  const { data, isLoading } = useQuery({ queryKey: ["portal"], queryFn: () => load() });

  const wire = data?.wireInstructions ?? {};
  const entries = FIELD_ORDER.filter((k) => wire[k]).map((k) => [k, String(wire[k])] as const);
  const reference = data?.payment?.reference_code ?? null;
  const commitment = money(data?.subscription?.commitment_cents ?? null);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy — please select the text manually.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Harmonious investor portal</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">Wire instructions</h1>
        <p className="text-muted-foreground">
          {data?.offering?.name
            ? `Bank details for ${data.offering.name}.`
            : "Bank details for your fund."}{" "}
          Always confirm these by phone with Harmonious before sending money.
        </p>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-muted-foreground">Loading your fund details…</CardContent>
        </Card>
      ) : !data?.application ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-muted-foreground">
              You don't have an active application yet, so there are no bank details to show.
            </p>
            <Button asChild>
              <Link to="/dashboard">Go to your dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-muted-foreground">
            Bank details for this fund haven't been published yet. Your Harmonious contact will let
            you know as soon as they're available.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-lg">Bank details</CardTitle>
              {data?.offering?.reg_type ? (
                <Badge variant="secondary">{String(data.offering.reg_type).toUpperCase()}</Badge>
              ) : null}
            </CardHeader>
            <CardContent className="divide-y">
              {entries.map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {WIRE_LABEL[key]}
                    </p>
                    <p className="break-words font-medium text-foreground">{value}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Copy ${WIRE_LABEL[key]}`}
                    onClick={() => copy(value, WIRE_LABEL[key])}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {(commitment || reference) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your transfer</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {commitment ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Amount to send
                    </p>
                    <p className="text-xl font-semibold text-foreground">{commitment}</p>
                  </div>
                ) : null}
                {reference ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Reference code
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-semibold text-foreground">{reference}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Copy reference code"
                        onClick={() => copy(reference, "Reference code")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Include this on your transfer so we can match your funds.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card className="border-destructive/40">
            <CardContent className="flex gap-3 p-6">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">Beware of wire fraud</p>
                <p className="text-muted-foreground">
                  Harmonious will never email you changed bank details. If you receive a message
                  asking you to send funds elsewhere, stop and call your Harmonious contact using a
                  number you already have on file.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/onboarding/funding">Confirm your transfer</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
