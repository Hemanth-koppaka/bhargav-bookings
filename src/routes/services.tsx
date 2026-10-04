import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
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
  const [active, setActive] = useState<string | null>(null);
  const chipRow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hydrated && !draft.audience) navigate({ to: "/book" });
  }, [hydrated, draft.audience, navigate]);

  const menu = draft.audience ? menuFor(draft.audience) : [];
  const activeId = active ?? menu[0]?.id ?? null;
  const category = menu.find((c) => c.id === activeId) ?? menu[0];

  useEffect(() => {
    const el = chipRow.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  if (!draft.audience || !category) return null;

  return (
    <Page>
      <ScreenHeader back="/book" title="Step 2 of 5" step={draft.audience === "men" ? "Men" : "Women"} />
      <Screen>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          {draft.audience === "men" ? "Men's" : "Women's"} <span className="italic">services</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Select your services.</p>

        <div ref={chipRow} role="tablist" aria-label="Service categories" className="-mx-6 mt-6 overflow-x-auto overscroll-x-contain scroll-px-6 px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:overflow-visible md:px-0">
          <div className="flex w-max gap-2 py-1 md:w-auto md:flex-wrap">
            {menu.map((c) => {
              const on = c.id === category.id;
              const count = c.services.filter((s) => draft.serviceIds.includes(s.id)).length;
              return (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(c.id)}
                  className={
                    "label-caps min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 transition-all active:scale-[0.97] duration-300 " +
                    (on
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/18 text-foreground/70 hover:border-foreground/45")
                  }
                >
                  {c.title}
                  {count > 0 ? (
                    <span className={on ? "ml-2 opacity-70" : "ml-2 text-accent-foreground"}>{count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div key={category.id} className="slide-in mt-7">
          {category.blurb ? (
            <p className="mb-5 max-w-md text-xs leading-relaxed text-muted-foreground">
              {category.blurb}
            </p>
          ) : null}
          <ul>
            {category.services.map((s) => {
              const on = draft.serviceIds.includes(s.id);
              return (
                <li key={s.id} className="hairline-b">
                  <button
                    onClick={() => toggleService(s.id)}
                    aria-pressed={on}
                    className={
                      "flex min-h-16 w-full items-center gap-3 py-4 text-left sm:gap-4 transition-colors duration-200 " +
                      (on ? "text-foreground" : "")
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.95rem] leading-snug [overflow-wrap:anywhere]">{s.name}</span>
                      <span className="mt-1 block text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                        {formatDuration(s.slots)}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-display text-lg sm:text-xl">
                      {inr(s.price)}
                      {s.from ? "+" : ""}
                    </span>
                    <span
                      className={
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-300 " +
                        (on
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/25 text-foreground/60")
                      }
                    >
                      {on ? (
                        <Check className="h-4 w-4" strokeWidth={1.75} />
                      ) : (
                        <Plus className="h-4 w-4" strokeWidth={1.25} />
                      )}
                    </span>
                  </button>
                  {on && s.note ? (
                    <p className="-mt-1 pb-4 text-xs leading-relaxed text-muted-foreground">{s.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </Screen>

      <StickyBar>
        <div className="mb-3 flex items-baseline justify-between gap-3">
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
