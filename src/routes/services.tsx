import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Page, Screen, ScreenHeader, StickyBar, PrimaryAction } from "@/components/screen";
import { useBooking } from "@/lib/booking-store";
import { formatDuration, inr, menuFor } from "@/lib/salon";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Choose your services — Hair by Bhargav" },
      {
        name: "description",
        content:
          "Browse the full menu of hair, colour, beauty and makeover services at Hair by Bhargav and build your appointment.",
      },
      { property: "og:title", content: "Choose your services — Hair by Bhargav" },
      { property: "og:description", content: "Build your appointment from the full service menu." },
    ],
  }),
  component: ServicesScreen,
});

function ServicesScreen() {
  const { draft, hydrated, toggleService, selected, totalSlots, totalPrice, hasFromPricing } =
    useBooking();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>("hair");

  useEffect(() => {
    if (hydrated && !draft.audience) navigate({ to: "/book" });
  }, [hydrated, draft.audience, navigate]);

  if (!draft.audience) return null;
  const menu = menuFor(draft.audience);

  return (
    <Page>
      <ScreenHeader back="/book" title="Step 2 of 5" step={draft.audience === "men" ? "Men" : "Women"} />
      <Screen>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          The <span className="italic">menu.</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Select one or more services. Times are added together.
        </p>

        <div className="mt-8">
          {menu.map((c) => {
            const isOpen = open === c.id;
            const count = c.services.filter((s) => draft.serviceIds.includes(s.id)).length;
            return (
              <div key={c.id} className="hairline-b">
                <button
                  onClick={() => setOpen(isOpen ? null : c.id)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="font-display text-2xl">{c.title}</span>
                  <span className="flex items-center gap-3">
                    {count > 0 ? (
                      <span className="label-caps text-accent-foreground/70">{count}</span>
                    ) : null}
                    <span
                      className={
                        "text-foreground/50 transition-transform duration-300 " +
                        (isOpen ? "rotate-45" : "")
                      }
                    >
                      +
                    </span>
                  </span>
                </button>
                {isOpen ? (
                  <div className="pb-6">
                    {c.blurb ? (
                      <p className="mb-5 max-w-md text-xs leading-relaxed text-muted-foreground">
                        {c.blurb}
                      </p>
                    ) : null}
                    <ul className="space-y-1">
                      {c.services.map((s) => {
                        const on = draft.serviceIds.includes(s.id);
                        return (
                          <li key={s.id}>
                            <button
                              onClick={() => toggleService(s.id)}
                              className={
                                "flex w-full items-start gap-4 border px-4 py-3.5 text-left transition-colors duration-200 " +
                                (on
                                  ? "border-foreground/45 bg-card"
                                  : "border-transparent hover:border-foreground/15")
                              }
                            >
                              <span
                                className={
                                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors " +
                                  (on ? "border-foreground bg-foreground" : "border-foreground/30")
                                }
                              >
                                {on ? (
                                  <Check
                                    className="h-3 w-3 text-background"
                                    strokeWidth={2}
                                  />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                                  <span className="text-[0.95rem]">{s.name}</span>
                                  <span className="text-sm text-muted-foreground">
                                    {inr(s.price)}
                                    {s.from ? " onwards" : ""}
                                  </span>
                                </span>
                                <span className="mt-1 block text-[0.7rem] tracking-[0.14em] uppercase text-muted-foreground">
                                  {formatDuration(s.slots)}
                                </span>
                                {s.note ? (
                                  <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                                    {s.note}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Screen>

      <StickyBar>
        <div className="mb-3 flex items-baseline justify-between">
          <div className="label-caps text-foreground/60">
            {selected.length
              ? `${selected.length} selected · ${formatDuration(totalSlots)}`
              : "Nothing selected"}
          </div>
          <div className="font-display text-2xl">
            {inr(totalPrice)}
            {hasFromPricing ? "+" : ""}
          </div>
        </div>
        <PrimaryAction
          disabled={selected.length === 0}
          onClick={() => navigate({ to: "/time" })}
        >
          Choose a time
        </PrimaryAction>
      </StickyBar>
    </Page>
  );
}
