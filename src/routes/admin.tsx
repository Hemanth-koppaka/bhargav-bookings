import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { useAdmin } from "@/lib/admin-store";
import { Wordmark } from "@/components/screen";
import { inputClass } from "@/components/admin";

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
  const { authed, hydrated, signIn } = useAdmin();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

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
          <form
            className="mt-10"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!(await signIn(pin))) setError("That code doesn't match.");
              else setError("");
            }}
          >
            <input
              className={inputClass + " text-center tracking-[0.6em]"}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError("");
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
              aria-label="Access code"
            />
            {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
            <button
              type="submit"
              className="label-caps mt-8 w-full bg-foreground px-6 py-4 text-background transition-opacity hover:opacity-88"
            >
              Unlock
            </button>
          </form>
          <p className="mt-6 text-[0.7rem] leading-relaxed text-muted-foreground">
            Bookings from every device appear here.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
