import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookCTA, InfoPage, InfoTitle } from "@/components/info-page";
import { BUSINESS, CLOSE_MINUTE, OPEN_MINUTE, WEEK, minuteLabel } from "@/lib/salon";
import womenImg from "@/assets/women.jpg.asset.json";

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
  // Highlight today on the client only (the server may be in another timezone).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(new Date().toLocaleDateString("en-GB", { weekday: "long" })), []);

  return (
    <InfoPage
      label="Hours"
      image={womenImg.url}
      imagePos="45% 25%"
      panelEyebrow="Open six days"
      panelTitle={
        <>
          Time,
          <br />
          <span className="italic text-champagne">well kept.</span>
        </>
      }
      panelSub={`Closed ${BUSINESS.closedDay}s`}
    >
      <InfoTitle eyebrow="Opening hours" sub="Booking slots run every 30 minutes, and we only show times that are genuinely free.">
        When we're <span className="italic text-bronze">open.</span>
      </InfoTitle>

      <ul className="stagger mt-9 overflow-hidden rounded-md border border-hairline bg-card">
        {WEEK.map((d) => {
          const isToday = d.day === today;
          return (
            <li
              key={d.day}
              className={
                "flex items-center justify-between gap-4 border-b border-hairline px-4 py-4 last:border-b-0 lg:px-6 " +
                (isToday ? "bg-champagne/14" : "")
              }
            >
              <span className="flex items-center gap-3 text-[1rem]">
                {d.day}
                {isToday ? (
                  <span className="rounded-full bg-bronze px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] text-ivory">
                    Today
                  </span>
                ) : null}
              </span>
              <span className={"text-[0.9rem] tabular-nums " + (d.closed ? "italic text-foreground/40" : "text-muted-foreground")}>
                {d.closed
                  ? "Closed"
                  : `${minuteLabel(d.open ?? OPEN_MINUTE)} – ${minuteLabel(d.close ?? CLOSE_MINUTE)}`}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-[0.9rem] leading-relaxed text-muted-foreground">
        Last appointment starts at {BUSINESS.lastSlot}.
      </p>

      <BookCTA className="mt-10" />
    </InfoPage>
  );
}
