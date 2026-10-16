import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Any fund-related query refreshes after any successful save, so a value entered on one tab shows on Fund Setup and Readiness too. */
const isFundKey = (k: unknown) => typeof k === "string" && /fund|readiness|launch|setup|offering/i.test(k);

export const getRouter = () => {
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: () => { void queryClient.invalidateQueries({ predicate: (q) => isFundKey(q.queryKey[0]) }); },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
