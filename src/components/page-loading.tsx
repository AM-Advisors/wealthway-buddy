import { Skeleton } from "@/components/ui/skeleton";

/**
 * One loading look for every signed-in check and page, so a person sees the
 * outline of their page straight away instead of a run of changing messages.
 */
export function PageLoading({ label = "Loading your page" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <span className="sr-only">{label}</span>
      <div className="space-y-3">
        <Skeleton className="h-8 w-56 max-w-[70%]" />
        <Skeleton className="h-4 w-80 max-w-[90%]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
    </div>
  );
}

/** Whole signed-in frame (menu, top bar, page), drawn before the app code has even arrived. */
export function AppShellLoading() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border p-4 md:block" aria-hidden="true">
        <Skeleton className="h-7 w-32" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center justify-between border-b border-border px-4" aria-hidden="true">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <PageLoading />
      </div>
    </div>
  );
}
