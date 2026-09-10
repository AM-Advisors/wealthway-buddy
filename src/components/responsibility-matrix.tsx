import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScopeService } from "@/components/service-gate";
import { statusLabel, statusTone } from "@/components/service-gate";

/**
 * Who does what for one service. Read from the recorded scope, never written
 * into a page, so the interface can't claim more than the agreement allows.
 */
export function ResponsibilityMatrix({ service }: { service: ScopeService }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{service.name}</CardTitle>
            {service.description ? <CardDescription>{service.description}</CardDescription> : null}
          </div>
          <Badge variant={statusTone(service.status)}>{statusLabel(service.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <Column title="Harmonious handles" body={service.harmoniousHandles ?? null} />
        <Column title="You handle" body={service.clientHandles ?? null} />
        <Column
          title="Third party handles"
          body={service.thirdPartyHandles ?? null}
          footnote={
            service.thirdPartyDependency
              ? `Depends on ${service.thirdPartyDependency}. Timing and outcome are theirs, not ours.`
              : null
          }
        />
        {service.requiredDocuments?.length ? (
          <List title="Documents needed" items={service.requiredDocuments} />
        ) : null}
        {service.requiredApprovals?.length ? (
          <List title="Approvals needed" items={service.requiredApprovals} />
        ) : null}
        {service.requiredChecks?.length ? (
          <List title="Checks needed" items={service.requiredChecks} />
        ) : null}
        {service.note ? (
          <p className="md:col-span-3 text-xs text-muted-foreground">{service.note}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Column({
  title,
  body,
  footnote,
}: {
  title: string;
  body?: string | null;
  footnote?: string | null;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm">{body || "Not applicable."}</p>
      {footnote ? <p className="mt-2 text-xs text-muted-foreground">{footnote}</p> : null}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 list-disc pl-4 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
