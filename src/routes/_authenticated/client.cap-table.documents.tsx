import { createFileRoute } from "@tanstack/react-router";

import { DocumentsScreen } from "@/components/captable/company-360-screens";

export const Route = createFileRoute("/_authenticated/client/cap-table/documents")({
  head: () => ({ meta: [{ title: "Company Documents — Harmonious" }, { name: "description", content: "Company documents grouped by purpose." }] }),
  component: DocumentsScreen,
});
