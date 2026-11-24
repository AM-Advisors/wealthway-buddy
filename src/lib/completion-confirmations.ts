/** Detects items that just became complete so screens can confirm them. Display only. */
export type CompletionItem = { key: string; label: string; done: boolean };

export function newlyCompleted(prev: Map<string, boolean> | null, items: CompletionItem[]): CompletionItem[] {
  if (!prev) return []; // first load: never re-announce past work
  return items.filter((i) => i.done && prev.get(i.key) === false);
}

export function completionMessage(label: string, remaining: number): string {
  return remaining > 0
    ? `${label} is done and saved. ${remaining} item${remaining === 1 ? "" : "s"} left.`
    : `${label} is done and saved. Nothing else is needed from you here.`;
}
