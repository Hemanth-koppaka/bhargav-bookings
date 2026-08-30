import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { BookingProvider } from "../lib/booking-store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <div className="eyebrow">404</div>
        <h1 className="mt-4 font-display text-4xl leading-tight">
          This page is
          <br />
          not on the menu.
        </h1>
        <Link
          to="/"
          className="label-caps mt-8 inline-flex border-b border-foreground/30 pb-1"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-3xl">This page didn't load</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Something went wrong. Try again, or head back home.
        </p>
        <div className="mt-8 flex justify-center gap-6">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="label-caps border-b border-foreground/30 pb-1"
          >
            Try again
          </button>
          <a href="/" className="label-caps border-b border-foreground/30 pb-1">
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Hair by Bhargav — Reserve your chair" },
      {
        name: "description",
        content:
          "Book hair, beauty and makeover appointments with B. Bhargav at KPHB Phase 9, Kukatpally, Hyderabad.",
      },
      { name: "theme-color", content: "#FBF8F3" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=Jost:wght@300;400;500&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <BookingProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </BookingProvider>
    </QueryClientProvider>
  );
}
