import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PageLoading } from "@/components/page-loading";

/** Presentation only; the destination still performs its original server checks. */
export function PlanAccessContent({ loading, allowed, children }: { loading: boolean; allowed: boolean; children: ReactNode }) {
  if (loading) return <PageLoading />;
  if (allowed) return <>{children}</>;
  return <div className="mx-auto max-w-2xl px-4 py-16">
    <h1 className="text-3xl">Not in your plan</h1>
    <p className="mt-3 text-sm text-muted-foreground">This area isn't part of the services you've purchased.</p>
    <Link to="/plan/start" className="mt-6 inline-block text-sm font-medium text-primary underline">Add to plan</Link>
  </div>;
}