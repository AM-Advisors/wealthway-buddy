import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getSowDocumentUrl,
  sendBackClientSow,
  signClientSow,
} from "@/lib/client-portal.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Sow = {
  id: string;
  title: string;
  status: string | null;
  effective_date: string | null;
  notice_days: number | null;
  notes: string | null;
  document_path: string | null;
  approval_status: string | null;
  client_status: string | null;
  client_signature_name: string | null;
  client_signature_title: string | null;
  client_signed_at: string | null;
  client_sent_back_reason: string | null;
  client_sent_back_at: string | null;
};

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US") : "—";

const stamp = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-US") : "—";

type State = {
  label: string;
  tone: "default" | "secondary" | "destructive" | "outline";
  detail: string;
  canAct: boolean;
};

function stateFor(sow: Sow): State {
  if (sow.approval_status === "approved")
    return {
      label: "Approved and in force",
      tone: "default",
      detail: "You signed this agreement and Harmonious has approved it. It governs your services.",
      canAct: false,
    };
  if (sow.status === "draft")
    return {
      label: "Draft — not ready yet",
      tone: "outline",
      detail: "Your Harmonious contact is still preparing this agreement. Nothing to sign yet.",
      canAct: false,
    };
  if (sow.client_status === "sent_back")
    return {
      label: "Sent back for changes",
      tone: "destructive",
      detail: `You sent this back on ${date(sow.client_sent_back_at)}. Harmonious will revise it and re-issue it for signature.`,
      canAct: false,
    };
  if (sow.client_status === "signed")
    return {
      label: "Signed by you — waiting on Harmonious approval",
      tone: "secondary",
      detail: `Signed ${stamp(sow.client_signed_at)} by ${sow.client_signature_name ?? "you"}${sow.client_signature_title ? `, ${sow.client_signature_title}` : ""}. An administrator reviews it before it takes effect.`,
      canAct: false,
    };
  if (sow.approval_status === "rejected")
    return {
      label: "Withdrawn in review",
      tone: "destructive",
      detail: "Harmonious pulled this agreement back in review. Your contact will re-issue it.",
      canAct: false,
    };
  return {
    label: "Awaiting your signature",
    tone: "default",
    detail: "Read the agreement, then sign it here or send it back with a question.",
    canAct: true,
  };
}

export function ClientSowPanel({ sows }: { sows: Sow[] }) {
  const queryClient = useQueryClient();
  const sign = useServerFn(signClientSow);
  const sendBack = useServerFn(sendBackClientSow);
  const docUrl = useServerFn(getSowDocumentUrl);

  const [signing, setSigning] = useState<Sow | null>(null);
  const [returning, setReturning] = useState<Sow | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["client-portal"] });

  const signMutation = useMutation({
    mutationFn: (v: { sowId: string; name: string; title: string }) => sign({ data: v }),
    onSuccess: () => {
      toast.success("Agreement signed. Harmonious will confirm approval.");
      setSigning(null);
      setName("");
      setTitle("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That signature could not be recorded."),
  });

  const sendBackMutation = useMutation({
    mutationFn: (v: { sowId: string; reason: string }) => sendBack({ data: v }),
    onSuccess: () => {
      toast.success("Sent back to Harmonious with your note.");
      setReturning(null);
      setReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That could not be sent back."),
  });

  const openDocument = async (sowId: string, download: boolean) => {
    try {
      const res = await docUrl({ data: { sowId, download } });
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer");
      else toast.error("No document is available for this agreement.");
    } catch (e: any) {
      toast.error(e?.message ?? "That document could not be opened.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Statements of work</CardTitle>
        <CardDescription>
          Your master service agreement plus these statements of work control which services
          Harmonious provides, on what terms and at what fees. Sign here when one is ready, or send
          it back with a question.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No statement of work is recorded yet. Your Harmonious contact can share one for
            signature.
          </p>
        )}
        {sows.map((s) => {
          const state = stateFor(s);
          return (
            <div key={s.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Effective {date(s.effective_date)}
                    {s.notice_days ? ` · ${s.notice_days}-day notice period` : ""}
                  </p>
                </div>
                <Badge variant={state.tone}>{state.label}</Badge>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">{state.detail}</p>
              {s.client_sent_back_reason && (
                <p className="mt-2 text-sm">Your note: {s.client_sent_back_reason}</p>
              )}
              {s.notes && <p className="mt-2 text-sm">{s.notes}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {s.document_path ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openDocument(s.id, false)}>
                      View document
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openDocument(s.id, true)}>
                      Download
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No document uploaded yet — ask your Harmonious contact for a copy.
                  </span>
                )}
                {state.canAct && (
                  <>
                    <Button size="sm" onClick={() => setSigning(s)}>
                      Sign this agreement
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setReturning(s)}>
                      Send back with a question
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={!!signing} onOpenChange={(o) => !o && setSigning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign {signing?.title}</DialogTitle>
            <DialogDescription>
              Typing your full legal name below is your signature on this statement of work. The
              name, date, time and device details are kept with the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sow-sign-name">Full legal name</Label>
              <Input
                id="sow-sign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Vale"
              />
            </div>
            <div>
              <Label htmlFor="sow-sign-title">Title (optional)</Label>
              <Input
                id="sow-sign-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Managing Member"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSigning(null)}>
              Cancel
            </Button>
            <Button
              disabled={name.trim().length < 2 || signMutation.isPending}
              onClick={() =>
                signing &&
                signMutation.mutate({ sowId: signing.id, name: name.trim(), title: title.trim() })
              }
            >
              Sign agreement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!returning} onOpenChange={(o) => !o && setReturning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back {returning?.title}</DialogTitle>
            <DialogDescription>
              Tell Harmonious what needs to change or what you'd like clarified. The agreement goes
              back to your Harmonious team and won't take effect until it's re-issued and signed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="What needs to change?"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturning(null)}>
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length < 3 || sendBackMutation.isPending}
              onClick={() =>
                returning &&
                sendBackMutation.mutate({ sowId: returning.id, reason: reason.trim() })
              }
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
