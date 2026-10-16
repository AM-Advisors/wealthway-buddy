/**
 * Client self-serve grants. A fund manager may run a small set of Harmonious
 * workflows on their own fund (setup sections, Harmonious template documents)
 * without staff review. The grant is request-scoped (AsyncLocalStorage), bound to
 * one user + one fund + one scope, and only opened AFTER the caller was verified
 * as that fund's manager. Money, filings, identity decisions and pricing never
 * use this path.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type SelfServeScope = "fund_setup" | "template_documents";
type Grant = { userId: string; offeringId: string; scope: SelfServeScope };

const als = new AsyncLocalStorage<Grant>();

export function runSelfServe<T>(grant: Grant, fn: () => Promise<T>): Promise<T> {
  return als.run(grant, fn);
}

export function selfServeAllows(userId: string, offeringId: string | null | undefined, scope: SelfServeScope): boolean {
  const g = als.getStore();
  return !!g && !!offeringId && g.userId === userId && g.offeringId === offeringId && g.scope === scope;
}
