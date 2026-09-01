import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, Screen, ScreenHeader } from "@/components/screen";
import { BUSINESS, WEEK } from "@/lib/salon";

export const Route = createFileRoute("/hours")({
  head: () => ({
    meta: [
      { title: "Opening hours — Hair by Bhargav" },
      {
        name: "description",
        content:
          "Hair by Bhargav is open Wednesday to Monday, 10:00 AM to 8:00 PM. Closed on Tuesdays. KPHB Phase 9, Kukatpally.",
      },
      { property: "og:title", content: "Opening hours — Hair by Bhargav" },
      { property: "og:description", content: "Open Wednesday to Monday, 10:00 AM to 8:00 PM." },
    ],
  }),
  component: HoursScreen,
});

function HoursScreen() {
  return (
    <Page>
      <ScreenHeader back="/" title="Hours" />
      <Screen>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          When we're <span className="italic">open.</span>
        </h1>

        <ul className="mt-10">
          {WEEK.map((d) => (
            <li key={d.day} className="flex items-baseline justify-between py-4 hairline-b">
              <span className="text-[1.05rem]">{d.day}</span>
              <span
                className={
                  "text-sm " + (d.closed ? "text-foreground/35 italic" : "text-muted-foreground")
                }
              >
                {d.closed ? "Closed" : "10:00 AM — 8:00 PM"}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
          Last appointment starts at {BUSINESS.lastSlot}. Booking slots run in 30-minute intervals,
          and we only show times that are genuinely free.
        </p>

        <Link
          to="/book"
          className="label-caps mt-10 flex w-full items-center justify-between gap-4 bg-foreground px-6 py-4.5 text-background"
        >
          <span>Book an appointment</span>
          <span>→</span>
        </Link>
      </Screen>
    </Page>
  );
}
