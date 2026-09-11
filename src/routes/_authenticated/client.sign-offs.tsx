import { createFileRoute, Link } from "@tanstack/react-router";

import { MyServiceRequests } from "@/components/service-request-signing";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/client/sign-offs")({
  head: () => ({
    meta: [
      { title: "Sign-offs — Harmonious" },
      {
        name: "description",
        content:
          "Documents and fee proposals awaiting your signature: policy sign-offs, service requests and amendments.",
      },
      { property: "og:title", content: "Sign-offs — Harmonious" },
      {
        property: "og:description",
        content: "Sign policy documents and approve service requests and fee proposals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientSignOffsPage,
});

function ClientSignOffsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portal policies</CardTitle>
          <CardDescription>
            Privacy, terms, fee schedule, electronic records and migration documents you sign once
            for the portal.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Button asChild size="sm">
            <Link to="/sign-off">Open policy sign-off</Link>
          </Button>
        </div>
      </Card>

      <MyServiceRequests />
    </div>
  );
}
