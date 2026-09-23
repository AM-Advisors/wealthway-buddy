import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old path → the URL the harmonious.co site already ranks for. */
export const Route = createFileRoute("/spv")({
  beforeLoad: () => {
    throw redirect({ to: "/spvs", statusCode: 301 });
  },
});
