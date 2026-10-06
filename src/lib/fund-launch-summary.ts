/** One fund-level setup % and launch label, shared by Fund Setup and Readiness. */
export function fundSetupSummary(d: {
  hasSetup?: boolean;
  launchState?: string | null;
  tasks?: { status: string }[];
  conditions?: { satisfied: boolean }[];
}) {
  const tasks = d.tasks ?? [];
  const conditions = d.conditions ?? [];
  const total = tasks.length + conditions.length;
  const done = tasks.filter((t) => t.status === "complete").length + conditions.filter((c) => c.satisfied).length;
  return {
    percent: total ? Math.round((done / total) * 100) : 0,
    openTasks: tasks.length - tasks.filter((t) => t.status === "complete").length,
    openConditions: conditions.length - conditions.filter((c) => c.satisfied).length,
    launchLabel: (d.launchState ?? "not ready").replaceAll("_", " "),
  };
}
