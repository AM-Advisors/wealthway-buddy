import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { getAttention } from "@/lib/attention.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KEY = "harmonious-attention-dismissed";

/** Shown once per sign-in session when real open items are waiting on the person. */
export function AttentionPopup() {
  const load = useServerFn(getAttention);
  const q = useQuery({ queryKey: ["attention", "company"], queryFn: () => load({ data: { workspace: "company" } }) as Promise<any>, retry: false });
  const items = ((q.data?.groups?.needs_you ?? []) as any[]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (items.length && sessionStorage.getItem(KEY) !== "1") setOpen(true);
  }, [items.length]);
  const close = () => { sessionStorage.setItem(KEY, "1"); setOpen(false); };
  if (!items.length) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> {items.length} {items.length === 1 ? "item needs" : "items need"} your attention</DialogTitle>
          <DialogDescription>Finish these to keep your funds moving.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{i.title}</p>
                <p className="text-xs text-muted-foreground">{i.fundName ? `${i.fundName} · ` : ""}{i.status}{i.dueDate ? ` · due ${new Date(i.dueDate).toLocaleDateString()}` : ""}</p>
              </div>
              <Button asChild size="sm" onClick={close}><Link to={i.href as any}>Go <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>
            </li>
          ))}
        </ul>
        <Button variant="outline" onClick={close}>Remind me next time</Button>
      </DialogContent>
    </Dialog>
  );
}
