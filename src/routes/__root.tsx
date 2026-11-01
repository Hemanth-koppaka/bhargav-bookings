import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { BookingProvider } from "../lib/booking-store";
import { AdminProvider } from "../lib/admin-store";
import { getSalonConfig } from "../lib/salon.functions";
import { applyConfig } from "../lib/salon";
import { sfx } from "../lib/sfx";

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
  loader: async () => {
    try {
      return await getSalonConfig();
    } catch {
      return { configJson: "{}" };
    }
  },
  staleTime: 60_000,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: (props) => <ErrorComponent error={props.error as Error} reset={props.reset} />,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Decide before first paint whether the home intro should play (once per session, home only). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var k='hb-intro';if(sessionStorage.getItem(k)||location.pathname!=='/'){document.documentElement.classList.add('intro-seen')}sessionStorage.setItem(k,'1')}catch(e){document.documentElement.classList.add('intro-seen')}",
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// The booking journey in order: moving forward plays the cinematic step
// transition, moving back plays the soft "shhh—click".
const FLOW: Record<string, number> = {
  "/": 0,
  "/book": 1,
  "/services": 2,
  "/time": 3,
  "/details": 4,
  "/review": 5,
};

/** Installs interface sound once and gives every route change its sound. */
function SoundDirector() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const prev = useRef<string | null>(null);
  useEffect(() => sfx.install(), []);
  useEffect(() => {
    const from = prev.current;
    prev.current = path;
    if (from === null || from === path || path.startsWith("/admin")) return;
    const a = FLOW[from];
    const b = FLOW[path];
    if (a !== undefined && b !== undefined) {
      if (b > a) sfx.transition();
      else sfx.back();
    } else if (path === "/") {
      sfx.back(); // leaving an info page for home
    } else if (b !== undefined) {
      sfx.transition(); // stepping into the booking flow from an info page
    }
  }, [path]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { configJson } = Route.useLoaderData();
  applyConfig(JSON.parse(configJson));

  return (
    <QueryClientProvider client={queryClient}>
      <BookingProvider>
        <AdminProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <SoundDirector />
        </AdminProvider>
      </BookingProvider>
    </QueryClientProvider>
  );
}
