import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { askDiligenceAssistant, type AssistantAnswer } from "@/lib/diligence-assistant.functions";
import { getDiligenceFileForViewing } from "@/lib/diligence.functions";

const SUGGESTIONS = [
  "What are the fees and how are they charged?",
  "How and when can I get my money back?",
  "What are the main risks the fund discloses?",
  "Who manages the fund and what is their track record?",
];

export function DiligenceAssistant({ offeringId }: { offeringId: string }) {
  const ask = useServerFn(askDiligenceAssistant);
  const view = useServerFn(getDiligenceFileForViewing);

  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<{ question: string; result: AssistantAnswer }[]>([]);
  const [viewer, setViewer] = useState<{ title: string; src: string | null; url: string } | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (viewer?.src?.startsWith("blob:")) URL.revokeObjectURL(viewer.src);
    };
  }, [viewer?.src]);

  const askMutation = useMutation({
    mutationFn: async (q: string) =>
      ({ q, result: (await ask({ data: { offering_id: offeringId, question: q } })) as AssistantAnswer }),
    onSuccess: ({ q, result }) => {
      setThread((prev) => [{ question: q, result }, ...prev]);
      setQuestion("");
    },
    onError: (e: any) => toast.error(e?.message ?? "The assistant could not answer that."),
  });

  const openMutation = useMutation({
    mutationFn: async (doc: { id: string; title: string }) => ({
      res: (await view({ data: { id: doc.id } })) as any,
      title: doc.title,
    }),
    onSuccess: ({ res, title }: any) => {
      let src: string | null = null;
      if (res.inline && res.base64) {
        const raw = atob(res.base64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
        src = URL.createObjectURL(new Blob([bytes], { type: res.content_type }));
      }
      setViewer({ title, src, url: res.url });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open that document."),
  });

  function submit(q: string) {
    const value = q.trim();
    if (value.length < 3) {
      toast.error("Please write a slightly longer question.");
      return;
    }
    askMutation.mutate(value);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ask about this fund</CardTitle>
          <CardDescription>
            Answers come only from the documents you are allowed to read in this room, and every
            answer points to the passage it came from so you can check it yourself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="For example: what is the management fee and when is it charged?"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(question);
            }}
          />
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                type="button"
                variant="outline"
                size="sm"
                disabled={askMutation.isPending}
                onClick={() => {
                  setQuestion(s);
                  submit(s);
                }}
              >
                {s}
              </Button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => submit(question)} disabled={askMutation.isPending}>
              {askMutation.isPending ? "Reading the documents…" : "Ask"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {thread.map((entry, i) => (
        <Card key={`${entry.question}-${i}`}>
          <CardHeader>
            <CardTitle className="text-base">{entry.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.result.answer}</p>
            {entry.result.citations.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Where this comes from
                </p>
                {entry.result.citations.map((c, idx) => (
                  <div key={`${c.document_id}-${idx}`} className="rounded-md border p-3">
                    <p className="text-sm italic text-muted-foreground">“{c.quote}”</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        disabled={openMutation.isPending}
                        onClick={() => openMutation.mutate({ id: c.document_id, title: c.title })}
                      >
                        Open {c.title}
                      </Button>
                      {c.page ? (
                        <span className="text-xs text-muted-foreground">page {c.page}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No passage was cited for this answer — please confirm it with the fund team in the
                Questions tab.
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{viewer?.title}</DialogTitle>
            <DialogDescription>
              Confidential — for your evaluation only. Please do not redistribute.
            </DialogDescription>
          </DialogHeader>
          {viewer?.src ? (
            <iframe
              title={viewer.title}
              src={viewer.src}
              className="h-[70vh] w-full rounded-md border bg-muted"
            />
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              This file can't be read in the browser. Use the button below to download it.
            </p>
          )}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewer && window.open(viewer.url, "_blank", "noopener,noreferrer")}
            >
              Open in a new tab
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
