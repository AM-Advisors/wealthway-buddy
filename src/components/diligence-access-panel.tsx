import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  listInvestorPermissions,
  setCapTableVisibility,
  setDocumentAccess,
  setDocumentVisibility,
} from "@/lib/diligence-permissions.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Manager-only controls: who sees the cap table, and which restricted
 * documents each investor may open in this fund's room.
 */
export function DiligenceAccessPanel({ offeringId }: { offeringId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listInvestorPermissions);
  const saveCap = useServerFn(setCapTableVisibility);
  const saveDocVisibility = useServerFn(setDocumentVisibility);
  const saveDocAccess = useServerFn(setDocumentAccess);

  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["diligence-permissions", offeringId],
    queryFn: () => load({ data: { offeringId } }),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["diligence-permissions", offeringId] });

  const capMutation = useMutation({
    mutationFn: (v: { investorUserId: string; visible: boolean; note?: string }) =>
      saveCap({ data: { offeringId, ...v } }),
    onSuccess: () => {
      toast.success("Saved");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const visibilityMutation = useMutation({
    mutationFn: (v: { documentId: string; visibility: "all" | "restricted" }) =>
      saveDocVisibility({ data: { offeringId, ...v } }),
    onSuccess: () => {
      toast.success("Document visibility updated");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const accessMutation = useMutation({
    mutationFn: (v: { documentId: string; investorUserId: string; allowed: boolean }) =>
      saveDocAccess({ data: { offeringId, ...v } }),
    onSuccess: refresh,
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading people…</p>;

  const investors = q.data?.investors ?? [];
  const documents = q.data?.documents ?? [];
  const restricted = documents.filter((d) => d.visibility === "restricted");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Which documents are limited</CardTitle>
          <CardDescription>
            Everything is shared with the whole room unless you mark it limited. Limited files are
            only visible to the people you pick below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents in this room yet.</p>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.category.replace(/_/g, " ")} · {doc.file_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={doc.visibility === "restricted" ? "secondary" : "outline"}>
                    {doc.visibility === "restricted" ? "Limited" : "Whole room"}
                  </Badge>
                  <Switch
                    checked={doc.visibility === "restricted"}
                    onCheckedChange={(checked) =>
                      visibilityMutation.mutate({
                        documentId: doc.id,
                        visibility: checked ? "restricted" : "all",
                      })
                    }
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">People in this room</CardTitle>
          <CardDescription>
            Turn the cap table on or off per person, and choose which limited documents they can
            open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {investors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No investors have been invited to this fund yet.
            </p>
          ) : (
            investors.map((inv) => {
              const expanded = open === inv.user_id;
              return (
                <div key={inv.user_id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm">{inv.name ?? inv.email ?? "Investor"}</p>
                      <p className="text-xs text-muted-foreground">{inv.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Cap table</span>
                      <Switch
                        checked={inv.cap_table_visible}
                        onCheckedChange={(checked) =>
                          capMutation.mutate({
                            investorUserId: inv.user_id,
                            visible: checked,
                            ...(notes[inv.user_id] ? { note: notes[inv.user_id] } : {}),
                          })
                        }
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOpen(expanded ? null : inv.user_id)}
                      >
                        {expanded ? "Hide" : `Documents (${inv.allowed_document_ids.length})`}
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      {restricted.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No limited documents yet — everything above is shared with the whole room.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {restricted.map((doc) => {
                            const allowed = inv.allowed_document_ids.includes(doc.id);
                            return (
                              <li key={doc.id} className="flex items-center gap-2">
                                <Checkbox
                                  checked={allowed}
                                  onCheckedChange={(checked) =>
                                    accessMutation.mutate({
                                      documentId: doc.id,
                                      investorUserId: inv.user_id,
                                      allowed: checked === true,
                                    })
                                  }
                                />
                                <span className="text-sm">{doc.title}</span>
                                <span className="text-xs text-muted-foreground">
                                  {doc.category.replace(/_/g, " ")}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="max-w-sm"
                          placeholder="Private note about this person's access"
                          maxLength={400}
                          value={notes[inv.user_id] ?? inv.note ?? ""}
                          onChange={(e) =>
                            setNotes((n) => ({ ...n, [inv.user_id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            capMutation.mutate({
                              investorUserId: inv.user_id,
                              visible: inv.cap_table_visible,
                              note: notes[inv.user_id] ?? inv.note ?? "",
                            })
                          }
                        >
                          Save note
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
