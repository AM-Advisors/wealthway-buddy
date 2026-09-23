import { CapTableSetup } from "@/components/captable/cap-table-setup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

import { useCapTable } from "./captable-context";

export function CapTableLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function CapTableError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong loading your records.";
  return (
    <Card role="alert" className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base">We could not load this page</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function CapTableEmpty({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** Wraps a section: shows loading, error and no-company states consistently. */
export function CapTableSection({ children }: { children: React.ReactNode }) {
  const { isLoading, error, workspace } = useCapTable();
  if (isLoading) return <CapTableLoading />;
  if (error) return <CapTableError error={error} />;
  if (!workspace?.company) {
    return <CapTableSetup />;
  }
  return <>{children}</>;
}

export function DemoBadge() {
  const { workspace } = useCapTable();
  if (!workspace?.company?.isDemo) return null;
  return (
    <Badge variant="secondary" className="uppercase tracking-wide">
      Demo data
    </Badge>
  );
}

export function PhasePlaceholder({
  title,
  body,
  description,
  phase,
  items = [],
}: {
  title: string;
  body?: string;
  description?: string;
  phase?: string;
  items?: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description ?? body}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {items.map((item) => (
              <li key={item} className="rounded-md border bg-muted/30 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
        {phase ? (
          <p className="text-sm text-muted-foreground">
            Coming in {phase} of the Harmonious CapTable rollout.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

}
