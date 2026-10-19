import { Button } from "@/components/ui/button";

/** True only when the server actually refused access (not timeouts or data errors). */
export function isAccessDenied(e: unknown) {
  const m = String((e as any)?.message ?? e ?? "").toLowerCase();
  const s = (e as any)?.status;
  return s === 401 || s === 403 || /unauthori|forbidden|access is required|not allowed|staff only|operations access/.test(m);
}

export function LoadError({ error, what, onRetry }: { error: unknown; what: string; onRetry: () => void }) {
  if (isAccessDenied(error)) return <p className="text-sm text-muted-foreground">Harmonious operations access is required.</p>;
  return (
    <div className="space-y-2 p-4 text-sm">
      <p className="text-destructive">{what} couldn't load. Please try again.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}
