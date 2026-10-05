import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function PendingScreen() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-background">
      <div className="label-caps animate-pulse text-muted-foreground">Hair by Bhargav</div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: PendingScreen,
    defaultPendingMs: 400,
  });

  return router;
};
