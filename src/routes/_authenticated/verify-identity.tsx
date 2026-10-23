import { createFileRoute, Navigate } from "@tanstack/react-router";

// Return address after the identity provider; the gate shows status, then this sends people home.
export const Route = createFileRoute("/_authenticated/verify-identity")({
  head: () => ({ meta: [
    { title: "Verify your identity - Harmonious" }, { name: "description", content: "Verify your identity to access the Harmonious portal." },
    { property: "og:title", content: "Verify your identity - Harmonious" }, { property: "og:description", content: "Verify your identity to access the Harmonious portal." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <Navigate to="/home" replace />,
});
