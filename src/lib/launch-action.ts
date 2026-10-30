/** Navigation only: launch requirements and authority remain server-side. */
export function launchAction(key: string, section?: string): { target: "setup" | "approvals" | "documents" | "banking" | "accounting"; label: string } {
  if (/economics|eligibility/.test(key)) return { target: "approvals", label: "Review approvals" };
  if (/bank/.test(key) || section === "banking") return { target: "banking", label: "Open banking" };
  if (/docs_|documents/.test(key) || section === "documents") return { target: "documents", label: "Review documents" };
  if (/accounting|tax_setup|reporting/.test(key)) return { target: "accounting", label: "Open accounting" };
  return { target: "setup", label: "Open setup" };
}