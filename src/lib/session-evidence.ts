/** Only route shapes and fixed error categories belong in security evidence. */
export function evidencePath(value: string): string {
  const path = value.split(/[?#]/, 1)[0] ?? "/";
  return path.split("/").map((part, index, parts) => {
    if (["invite", "join", "shares", "onboard", "invest", "prepare", "cap-claim", "report-card-share", "packet"].includes(parts[index - 1] ?? "") || /^[a-f\d]{8}-[a-f\d-]{27,}$/i.test(part) || part.length > 48 || part.includes("@")) return ":record";
    return part;
  }).join("/").slice(0, 400);
}

export function browserErrorCategory(kind: "error" | "rejection", name?: unknown): string {
  const allowed = ["TypeError", "RangeError", "ReferenceError", "SyntaxError", "AbortError", "NetworkError"];
  return `Browser-reported ${kind === "rejection" ? "unhandled rejection" : "runtime error"}${typeof name === "string" && allowed.includes(name) ? ` (${name})` : ""}`;
}

export function signInEvidenceKey(userId: string, sessionId: string | null): string | null {
  return sessionId ? `${userId}:${sessionId}:sign_in` : null;
}