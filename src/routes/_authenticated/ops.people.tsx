import { createFileRoute } from "@tanstack/react-router";
import { PeopleDirectory } from "@/components/people-directory";

const T = "All users - Harmonious operations";
const D = "Every account and open invitation, with revoke, archive, restore and test/demo controls.";
export const Route = createFileRoute("/_authenticated/ops/people")({
  head: () => ({ meta: [{ title: T }, { name: "description", content: D }, { property: "og:title", content: T }, { property: "og:description", content: D }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <PeopleDirectory />,
});
