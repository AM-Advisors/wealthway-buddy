import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDiligenceRoomTraffic,
  listManagedDiligenceRooms,
} from "@/lib/diligence.functions";

function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function daysSince(value?: string | null) {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

export function DiligenceRoomsPanel() {
  const loadRooms = useServerFn(listManagedDiligenceRooms);
  const loadTraffic = useServerFn(getDiligenceRoomTraffic);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rooms = useQuery({
    queryKey: ["manager-diligence-rooms"],
    queryFn: () => loadRooms(),
    refetchInterval: 120_000,
  });
  const traffic = useQuery({
    queryKey: ["manager-diligence-traffic"],
    queryFn: () => loadTraffic(),
    refetchInterval: 120_000,
  });

  if (rooms.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your diligence rooms…</p>;
  }
  if (rooms.error) {
    return <p className="text-sm text-muted-foreground">{(rooms.error as any)?.message}</p>;
  }

  const funds = (rooms.data?.funds ?? []) as any[];
  const trafficRows = (traffic.data?.rooms ?? []) as any[];

  if (funds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You are not assigned to any funds yet.
      </p>
    );
  }

  const totalVisitors = trafficRows.reduce((n, r) => n + r.visitorCount, 0);
  const totalDownloads = trafficRows.reduce((n, r) => n + r.downloads, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Funds", funds.length],
          ["Rooms open", funds.filter((f) => f.hasRoom).length],
          ["Investors who looked", totalVisitors],
          ["Documents downloaded", totalDownloads],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-6">
              <div className="text-2xl">{value as number}</div>
              <div className="text-xs text-muted-foreground">{label as string}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {funds.map((fund) => {
        const t = trafficRows.find((r) => r.offeringId === fund.offeringId);
        const visitors = (t?.visitors ?? []) as any[];
        const quietDays = daysSince(t?.lastActivityAt ?? null);
        const isOpen = open[fund.offeringId] ?? false;

        return (
          <Card key={fund.offeringId}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{fund.name}</CardTitle>
                  <CardDescription>
                    {fund.hasRoom
                      ? `${fund.documentCount} document${fund.documentCount === 1 ? "" : "s"} · ${fund.readiness.score}% ready`
                      : "No diligence room yet"}
                    {fund.regType ? ` · Reg D ${fund.regType}` : ""}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {fund.hasRoom ? (
                    <Badge
                      variant={
                        (t?.visitorCount ?? 0) === 0
                          ? "outline"
                          : quietDays !== null && quietDays > 14
                            ? "secondary"
                            : "default"
                      }
                    >
                      {(t?.visitorCount ?? 0) === 0
                        ? "No one has opened it"
                        : quietDays !== null && quietDays > 14
                          ? "Quiet"
                          : "Active"}
                    </Badge>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link to="/diligence/$offeringId" params={{ offeringId: fund.offeringId }}>
                      Open room
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/manager/diligence">Manage documents</Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!fund.hasRoom ? (
                <p className="text-sm text-muted-foreground">
                  Create the room on the diligence page to start sharing materials.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">
                      {t?.visitorCount ?? 0} investor{(t?.visitorCount ?? 0) === 1 ? "" : "s"} opened
                    </Badge>
                    <Badge variant="outline">{t?.opens ?? 0} room visits</Badge>
                    <Badge variant="outline">{t?.downloads ?? 0} downloads</Badge>
                    <Badge variant="outline">Last activity {when(t?.lastActivityAt)}</Badge>
                  </div>

                  {visitors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No investor has opened this room yet — a reminder may help.
                    </p>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setOpen((prev) => ({
                            ...prev,
                            [fund.offeringId]: !prev[fund.offeringId],
                          }))
                        }
                      >
                        {isOpen ? "Hide" : "Show"} who opened it ({visitors.length})
                      </Button>

                      {isOpen ? (
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2">Investor</th>
                                <th className="px-3 py-2">Visits</th>
                                <th className="px-3 py-2">Downloads</th>
                                <th className="px-3 py-2">Agreement</th>
                                <th className="px-3 py-2">Last seen</th>
                                <th className="px-3 py-2">Follow up</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visitors.map((v) => (
                                <tr key={v.actorId} className="border-t">
                                  <td className="px-3 py-2">
                                    <div>{v.name ?? v.email ?? "Investor"}</div>
                                    {v.name && v.email ? (
                                      <div className="text-xs text-muted-foreground">{v.email}</div>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2">{v.opens}</td>
                                  <td className="px-3 py-2">{v.downloads}</td>
                                  <td className="px-3 py-2 text-xs">
                                    {v.ndaAcceptedAt ? when(v.ndaAcceptedAt) : "Not signed"}
                                  </td>
                                  <td className="px-3 py-2 text-xs">{when(v.lastSeen)}</td>
                                  <td className="px-3 py-2">
                                    {v.email ? (
                                      <a
                                        className="text-xs underline"
                                        href={`mailto:${v.email}?subject=${encodeURIComponent(fund.name)}`}
                                      >
                                        Email
                                      </a>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
