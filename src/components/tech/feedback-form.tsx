import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedback } from "@/lib/tech.functions";

const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });

/** Report a problem or suggest an idea. Page and browser are attached automatically; typed values elsewhere are never captured. */
export function FeedbackForm({ fromPage, onSent }: { fromPage?: string | undefined; onSent?: () => void }) {
  const [kind, setKind] = useState<"bug" | "idea">("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const send = useServerFn(submitFeedback);
  const m = useMutation({
    mutationFn: async () => send({ data: { kind, title, details, page: fromPage ?? null, browser: typeof navigator !== "undefined" ? navigator.userAgent : null,
      screenshot: file ? { name: file.name, type: file.type, base64: await toBase64(file) } : null } }),
    onSuccess: () => { toast.success("Thanks. We got it, and you can follow it under My reports."); setTitle(""); setDetails(""); setFile(null); onSent?.(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What is it?">
        {([["bug", "Something isn't working", "Report a problem"], ["idea", "Something could be better", "Suggest an idea"]] as const).map(([k, hint, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`rounded-lg border p-4 text-left ${kind === k ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
            <span className="block text-base font-medium">{label}</span><span className="block text-sm text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
      <div className="space-y-1"><Label htmlFor="fb-title">Short title</Label><Input id="fb-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "bug" ? "e.g. Save button does nothing on my tax form" : "e.g. Let me download all my documents at once"} /></div>
      <div className="space-y-1"><Label htmlFor="fb-details">{kind === "bug" ? "What happened, and what did you expect?" : "What would you like, and why would it help?"}</Label>
        <Textarea id="fb-details" rows={5} value={details} maxLength={4000} onChange={(e) => setDetails(e.target.value)} />
        <p className="text-xs text-muted-foreground">Please don't include tax ID, bank or account numbers, or passwords.</p></div>
      <div className="space-y-1"><Label htmlFor="fb-shot">Screenshot (optional, up to 5 MB)</Label><Input id="fb-shot" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      {fromPage && <p className="text-sm text-muted-foreground">We'll include the page you were on ({fromPage.split("?")[0]}) and your browser.</p>}
      <Button size="lg" disabled={m.isPending || title.trim().length < 3 || details.trim().length < 5} onClick={() => m.mutate()}>{m.isPending ? "Sending…" : "Send"}</Button>
    </div>
  );
}
