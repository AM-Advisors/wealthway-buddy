import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { WhitelabelEditor } from "@/components/client-whitelabel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyClientBranding } from "@/lib/client-branding.functions";

export const Route = createFileRoute("/_authenticated/client/setup-options")({
  head: () => ({
    meta: [
      { title: "Client setup options - Harmonious" },
      { name: "description", content: "Turn on white-labeling and set your logo, fonts, colors and web address." },
      { property: "og:title", content: "Client setup options - Harmonious" },
      { property: "og:description", content: "White-label your Harmonious portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupOptionsPage,
});

function SetupOptionsPage() {
  const fn = useServerFn(getMyClientBranding);
  const q = useQuery({ queryKey: ["my-client-branding"], queryFn: () => fn() });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Client setup options</h1>
      <Card>
        <CardHeader>
          <CardTitle>Branding{q.data?.clientName ? ` for ${q.data.clientName}` : ""}</CardTitle>
          <CardDescription>Only your company's general partners can change these settings.</CardDescription>
        </CardHeader>
        <CardContent>
          {q.isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : !q.data ? (
            <p className="text-sm text-muted-foreground">Your account isn't linked to a client yet.</p>
          ) : (
            <WhitelabelEditor clientId={q.data.clientId} branding={q.data.branding} canEdit={q.data.canEdit} queryKey={["my-client-branding"]} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
