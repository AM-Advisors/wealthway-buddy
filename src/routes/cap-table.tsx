import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old path → the URL the harmonious.co site already ranks for. Keeps ?move=. */
export const Route = createFileRoute("/cap-table")({
  validateSearch: (s: Record<string, unknown>) => ({
    move: s["move"] === "carta" || s["move"] === "pulley" ? s["move"] : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/cap-table-management", search: search as never, statusCode: 301 });
  },
});
