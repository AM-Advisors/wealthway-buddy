import { createFileRoute } from "@tanstack/react-router";
import { PeopleDirectory } from "@/components/people-directory";

const T = "Test & Demo users - Harmonious operations";
const D = "People, invitations and clients marked as test or demo, kept out of dashboard totals.";
export const Route = createFileRoute("/_authenticated/ops/people_/test-demo")({
  head: () => ({ meta: [{ title: T }, { name: "description", content: D }, { property: "og:title", content: T }, { property: "og:description", content: D }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <PeopleDirectory initial="test" />,
});
