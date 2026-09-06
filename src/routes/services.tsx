import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (hydrated && !draft.audience) navigate({ to: "/book" });
  }, [hydrated, draft.audience, navigate]);

  const menu = draft.audience ? menuFor(draft.audience) : [];
  const activeId = active ?? menu[0]?.id ?? null;
  const category = menu.find((c) => c.id === activeId) ?? menu[0];

  if (!draft.audience || !category) return null;

  return (
    <Page>
      <ScreenHeader back="/book" title="Step 2 of 5" step={draft.audience === "men" ? "Men" : "Women"} />
      <Screen>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          {draft.audience === "men" ? "Men's" : "Women's"} <span className="italic">services</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Select your services.</p>

        <div className="-mx-6 mt-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2 pb-1">
            {menu.map((c) => {
              const on = c.id === category.id;
              const count = c.services.filter((s) => draft.serviceIds.includes(s.id)).length;
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className={
                    "label-caps whitespace-nowrap rounded-full border px-4 py-2.5 transition-all duration-300 " +
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
                      "flex w-full items-center gap-4 py-4 text-left transition-colors duration-200 " +
                      (on ? "text-foreground" : "")
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.95rem]">{s.name}</span>
                      <span className="mt-1 block text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                        {formatDuration(s.slots)}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-xl">
                      {inr(s.price)}
                      {s.from ? "+" : ""}
                    </span>
                    <span
                      className={
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 " +
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
