import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Page, Screen, ScreenHeader } from "@/components/screen";
import { useBooking } from "@/lib/booking-store";
import type { Audience } from "@/lib/salon";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book an appointment — Hair by Bhargav" },
      {
        name: "description",
        content: "Start your reservation at Hair by Bhargav. Choose men's or women's services.",
      },
      { property: "og:title", content: "Book an appointment — Hair by Bhargav" },
      {
        property: "og:description",
        content: "Start your reservation at Hair by Bhargav.",
      },
    ],
  }),
  component: BookEntry,
});

const options: { key: Audience; title: string; sub: string }[] = [
  { key: "men", title: "Men", sub: "Hair · Beard · Grooming" },
  { key: "women", title: "Women", sub: "Hair · Colour · Makeover" },
];

function BookEntry() {
  const { setAudience } = useBooking();
  const navigate = useNavigate();

  const choose = (a: Audience) => {
    setAudience(a);
    navigate({ to: "/services" });
  };

  return (
    <Page>
      <ScreenHeader back="/" title="Step 1 of 5" />
      <Screen center>
        <h1 className="font-display text-5xl leading-[0.95] sm:text-6xl">
          Who are we
          <br />
          <span className="italic">styling?</span>
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This defines the entire menu that follows.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => choose(o.key)}
              className="group relative overflow-hidden border border-foreground/15 bg-card px-7 py-9 text-left transition-all duration-300 hover:border-foreground/45"
            >
              <span className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-accent transition-transform duration-500 group-hover:scale-x-100" />
              <div className="font-display text-4xl leading-none">{o.title}</div>
              <div className="mt-3 text-xs tracking-[0.16em] uppercase text-muted-foreground">
                {o.sub}
              </div>
              <div className="mt-8 label-caps flex items-center justify-between text-foreground/60">
                <span>View menu</span>
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </div>
            </button>
          ))}
        </div>
      </Screen>
    </Page>
  );
}
