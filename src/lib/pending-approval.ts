/** Undo cancels only an unsubmitted action; completed decisions are never erased. */
export function pendingApproval(submit: () => void, delayMs = 5000) {
  let state: "waiting" | "canceled" | "submitted" = "waiting";
  const timer = setTimeout(() => {
    if (state !== "waiting") return;
    state = "submitted";
    submit();
  }, delayMs);
  return () => {
    if (state !== "waiting") return false;
    state = "canceled";
    clearTimeout(timer);
    return true;
  };
}