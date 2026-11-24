import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { completionMessage, newlyCompleted, type CompletionItem } from "@/lib/completion-confirmations";

/** Toasts and remembers items that finish while the screen is open. */
export function useCompletionConfirmations(scope: string, items: CompletionItem[]) {
  const prev = useRef<{ scope: string; map: Map<string, boolean> } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const sig = items.map((i) => `${i.key}:${i.done ? 1 : 0}`).join("|");
  useEffect(() => {
    const before = prev.current?.scope === scope ? prev.current.map : null;
    const fresh = newlyCompleted(before, items);
    const remaining = items.filter((i) => !i.done).length;
    for (const i of fresh) toast.success(completionMessage(i.label, remaining), { duration: 6000 });
    if (fresh.length) setRecent((r) => [...fresh.map((i) => i.label), ...r.filter((l) => !fresh.some((f) => f.label === l))].slice(0, 4));
    if (prev.current?.scope !== scope) setRecent([]);
    prev.current = { scope, map: new Map(items.map((i) => [i.key, i.done])) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, sig]);
  return recent;
}

export function RecentlyCompleted({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div><p className="font-medium">Done and saved</p><p className="text-muted-foreground">{labels.join(" · ")}. These are no longer pending.</p></div>
    </div>
  );
}
