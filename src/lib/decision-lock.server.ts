/**
 * Single-flight guard for review decisions. Reuses the existing short-lived service-role mutex
 * (person_creation_locks: 20-second expiry, service role only) under a "decision:" namespace, so a
 * double click, a network retry or two reviewers deciding the same record at once apply it once.
 * The lock never decides anything: callers re-read the record's status inside `fn` and keep their
 * own authorization, maker-checker and apply rules.
 */
export type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export const decisionLockKey = (engine: string, recordId: string) => `decision:${engine}:${recordId}`;

export const DECISION_IN_PROGRESS = "This decision is already being saved. Refresh in a moment to see it.";

export async function withDecisionLock<T>(db: RpcClient, engine: string, recordId: string, fn: () => Promise<T>): Promise<T> {
  const key = decisionLockKey(engine, recordId);
  const token = crypto.randomUUID();
  const { data, error } = await db.rpc("acquire_person_creation_lock", { _key: key, _token: token });
  if (error) throw new Error("Couldn't start the decision. Try again.");
  if (data !== true) throw new Error(DECISION_IN_PROGRESS);
  try {
    return await fn();
  } finally {
    await db.rpc("release_person_creation_lock", { _key: key, _token: token });
  }
}
