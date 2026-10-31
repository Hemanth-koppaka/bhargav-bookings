import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { useAdmin } from "@/lib/admin-store";
import { Wordmark } from "@/components/screen";
import { inputClass } from "@/components/admin";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Salon operations — Hair by Bhargav" },
      {
        name: "description",
        content: "Private operations console for managing appointments at Hair by Bhargav.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Salon operations — Hair by Bhargav" },
      { property: "og:description", content: "Private operations console." },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { authed, hydrated, signIn, signOutReason } = useAdmin();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!hydrated) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background">
        <div className="eyebrow">Loading</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center bg-background px-6">
        <div className="w-full max-w-xs text-center">
          <Wordmark className="mx-auto h-10" />
          <div className="eyebrow mt-8">Operations</div>
          <h1 className="mt-3 font-display text-4xl leading-tight">Enter your access code</h1>
          {signOutReason ? <p className="mt-4 text-xs text-muted-foreground">{signOutReason}</p> : null}
          <form
            className="mt-10"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!code.trim() || busy) return;
              setBusy(true);
              const r = await signIn(code);
              setBusy(false);
              if (r.ok) {
                setError("");
                setCode("");
              } else {
                setError(r.message);
              }
            }}
          >
            <input
              key={error}
              className={inputClass + " text-center tracking-[0.6em]" + (error ? " shake" : "")}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError("");
              }}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              placeholder="••••••"
              aria-label="Access code"
              aria-invalid={Boolean(error)}
            />
            {error ? (
              <p role="alert" className="mt-3 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="label-caps press mt-8 w-full bg-foreground px-6 py-4 text-background hover:opacity-88 disabled:opacity-40"
            >
              {busy ? "Checking…" : "Unlock"}
            </button>
          </form>
          <p className="mt-6 text-[0.7rem] leading-relaxed text-muted-foreground">
            Bookings from every device appear here. Sessions end after 12 hours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Outlet />
      <Toaster position="top-center" />
    </>
  );
}
