import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { listDiligenceRooms } from "@/lib/diligence.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/diligence/")({
  head: () => ({
    meta: [
      { title: "Due Diligence Rooms — Harmonious" },
      {
        name: "description",
        content:
          "Review fund due diligence materials — formation documents, financials, track record and team — in one secure Harmonious room per fund.",
      },
      { property: "og:title", content: "Due Diligence Rooms — Harmonious" },
      {
        property: "og:description",
        content: "Secure fund diligence materials and readiness for Harmonious investors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiligenceIndex,
});

function DiligenceIndex() {
  const list = useServerFn(listDiligenceRooms);
  const { data, isLoading } = useQuery({ queryKey: ["diligence-rooms"], queryFn: () => list() });
  const rooms = (data as any)?.rooms ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl">Due diligence</h1>
      <p className="mt-2 text-muted-foreground">
        Everything you need to review a fund before you invest, kept in one secure place.
      </p>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>No rooms yet</CardTitle>
            <CardDescription>
              Once your fund team opens a diligence room, its materials will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="mt-8 space-y-4">
          {rooms.map((room: any) => (
            <Card key={room.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>{room.name}</CardTitle>
                    <CardDescription>
                      {room.document_count} document{room.document_count === 1 ? "" : "s"} available
                    </CardDescription>
                  </div>
                  <Badge variant={room.readiness.score === 100 ? "default" : "secondary"}>
                    {room.readiness.score}% complete
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={room.readiness.score} />
                <Button asChild size="sm">
                  <Link to="/diligence/$offeringId" params={{ offeringId: room.offering_id }}>
                    Open room
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        <Link to="/dashboard" className="underline">
          Back to your dashboard
        </Link>
      </p>
    </div>
  );
}
