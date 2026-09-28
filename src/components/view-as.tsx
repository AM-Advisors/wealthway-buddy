import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, LogOut, Pencil } from "lucide-react";
import { toast } from "sonner";
import { activeViewAsFn, beginEditAsHarmoniousFn, endViewAsFn, listPerspectivesFn, startViewAsFn } from "@/lib/view-as.functions";
import { PERSPECTIVE_LABEL, VIEW_AS_COPY } from "@/lib/view-as";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Lists only perspectives the server confirms exist; staff never type IDs or roles. */
export function ViewAsPicker({ onboardingId, offeringId, label = "View as…" }: { onboardingId?: string; offeringId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const list = useServerFn(listPerspectivesFn);
  const start = useServerFn(startViewAsFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["view-as-perspectives", onboardingId ?? null, offeringId ?? null],
    queryFn: () => list({ data: { onboardingId: onboardingId ?? null, offeringId: offeringId ?? null } }),
    enabled: open,
    retry: false,
  });
  const go = async (p: any) => {
    try {
      await start({ data: { perspective: p.perspective, subjectUserId: p.subjectUserId, offeringId: p.offeringId, onboardingId: p.onboardingId } });
      qc.removeQueries({ queryKey: ["view-as"] });
      setOpen(false);
      navigate({ to: "/view-as" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open client view.");
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0"><Eye className="mr-1 h-3.5 w-3.5" />{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">View client perspective</p>
        {q.isPending ? <p className="text-sm">Loading…</p> : q.isError ? <p className="text-sm text-destructive">Harmonious staff access is required.</p> : !(q.data ?? []).length ? (
          <div><p className="text-sm font-medium">No client perspective is available yet</p><p className="text-xs text-muted-foreground">This record does not currently have an investor or fund manager relationship that can be viewed.</p></div>
        ) : (
          (q.data as any[]).map((p) => (
            <button key={`${p.perspective}-${p.subjectUserId}`} type="button" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => go(p)}>
              <span className="block text-xs text-muted-foreground">{PERSPECTIVE_LABEL[p.perspective as keyof typeof PERSPECTIVE_LABEL]}</span>
              <span className="text-sm font-medium">{p.name}</span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

export function useActiveViewAs() {
  const load = useServerFn(activeViewAsFn);
  return useQuery({ queryKey: ["view-as", "active"], queryFn: () => load(), retry: false });
}

/** Persistent banner. Makes clear the staff member is still signed in as themselves. */
export function ViewAsBanner({ ctx }: { ctx: any }) {
  const end = useServerFn(endViewAsFn);
  const edit = useServerFn(beginEditAsHarmoniousFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const exit = async (to: "/ops" | "edit") => {
    if (to === "edit") {
      const r = await edit();
      qc.removeQueries({ queryKey: ["view-as"] });
      toast.message(VIEW_AS_COPY.editNotice);
      // Existing Operations screens and their canonical save paths; edits are recorded under the staff account.
      if (r.onboardingId) navigate({ to: "/admin/investor-onboarding" });
      else navigate({ to: "/manager/fund/$fundId", params: { fundId: r.offeringId } });
      return;
    }
    await end();
    qc.removeQueries({ queryKey: ["view-as"] });
    navigate({ to: "/ops" });
  };
  const amount = ctx.amountCents ? ` · $${(ctx.amountCents / 100).toLocaleString("en-US")}` : "";
  return (
    <div role="status" className="sticky top-0 z-40 border-b-2 border-accent bg-primary px-4 py-2 text-primary-foreground shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-foreground"><Eye className="mr-1 inline h-3 w-3" />Client View</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">Viewing as {ctx.subjectName} · {ctx.roleLabel}</p>
            <p className="truncate text-xs opacity-80">{ctx.fundName}{amount} · Read-only · {VIEW_AS_COPY.signedInAs}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => exit("edit")}><Pencil className="mr-1 h-3.5 w-3.5" />Edit as Harmonious</Button>
          <Button size="sm" variant="outline" className="border-primary-foreground/60 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => exit("/ops")}><LogOut className="mr-1 h-3.5 w-3.5" />Exit Client View</Button>
        </div>
      </div>
    </div>
  );
}

export function NoActiveViewAs() {
  return (
    <div className="mx-auto max-w-xl space-y-3 p-8 text-center">
      <p className="font-heading font-semibold">No client view is active</p>
      <p className="text-sm text-muted-foreground">Start one from an investment, a fund's Readiness tab or the readiness queue. Client views end on sign-out, after 60 minutes, or when you switch to another record.</p>
      <Link to="/ops" className="text-primary underline">Return to Harmonious Operations</Link>
    </div>
  );
}
