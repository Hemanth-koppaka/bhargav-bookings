import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, Plus, ShoppingBag } from "lucide-react";
import { Page, Screen, ScreenHeader, StickyBar, PrimaryAction } from "@/components/screen";
import {
  AUDIENCE_IMAGE,
  DesktopBar,
  DesktopCTA,
  DesktopPage,
  DesktopStepperHeader,
  ImagePanel,
} from "@/components/desktop";
import { useBooking } from "@/lib/booking-store";
import { formatDuration, inr, menuFor, type Category } from "@/lib/salon";

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
    <>
    <DesktopServices menu={menu} category={category} onCategory={setActive} />
    <div className="lg:hidden">
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
    </div>
    </>
  );
}

function DesktopServices({
  menu,
  category,
  onCategory,
}: {
  menu: Category[];
  category: Category;
  onCategory: (id: string) => void;
}) {
  const { draft, toggleService, selected, totalSlots, totalPrice, hasFromPricing } = useBooking();
  const navigate = useNavigate();
  const men = draft.audience === "men";
  const img = AUDIENCE_IMAGE[men ? "men" : "women"];

  return (
    <DesktopPage>
      <DesktopStepperHeader step={2} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(17rem,22%)_minmax(0,1fr)_minmax(18rem,32%)]">
        {/* Categories */}
        <nav aria-label="Service categories" className="flex min-h-0 flex-col overflow-y-auto border-r border-hairline px-8 py-8 [scrollbar-width:thin]">
          <Link to="/book" className="label-caps inline-flex items-center gap-3 text-foreground/70 transition-opacity hover:opacity-60">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.25} />
            Back
          </Link>
          <div className="mt-8 text-[0.7rem] uppercase tracking-[0.3em] text-bronze">
            {men ? "Men's" : "Women's"} services
          </div>
          <h1 className="mt-3 font-display text-[clamp(2.6rem,3.6vw,3.6rem)] leading-[1]">
            Select your
            <br />
            <span className="italic">services.</span>
          </h1>
          <p className="mt-5 text-[0.85rem] leading-relaxed text-muted-foreground">
            Choose one or more services. Each service is tailored to your style.
          </p>
          <ul role="tablist" className="mt-7 space-y-2.5">
            {menu.map((c, i) => {
              const on = c.id === category.id;
              const count = c.services.filter((x) => draft.serviceIds.includes(x.id)).length;
              return (
                <li key={c.id}>
                  <button
                    role="tab"
                    aria-selected={on}
                    onClick={() => onCategory(c.id)}
                    className={
                      "flex w-full items-center gap-4 rounded-sm border px-4 py-3.5 text-left transition-colors duration-200 " +
                      (on
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/10 bg-card hover:border-foreground/35")
                    }
                  >
                    <span className={"font-display text-xl tabular-nums " + (on ? "text-champagne" : "text-bronze/80")}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.95rem]">{c.title}</span>
                      <span className={"mt-0.5 block text-[0.75rem] " + (on ? "text-background/65" : "text-muted-foreground")}>
                        {c.services.length} services{count ? ` · ${count} added` : ""}
                      </span>
                    </span>
                    {on ? <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.25} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Service list */}
        <section key={category.id} className="slide-in min-h-0 overflow-y-auto px-10 py-8 [scrollbar-width:thin] xl:px-12">
          <div className="flex items-baseline justify-between gap-6">
            <h2 className="font-display text-[2.5rem] leading-tight">{category.title}</h2>
            <span className="label-caps shrink-0 text-foreground/55">{category.services.length} services</span>
          </div>
          {category.blurb ? (
            <p className="mt-1 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">{category.blurb}</p>
          ) : null}
          <ul className="mt-6 hairline-t">
            {category.services.map((x) => {
              const on = draft.serviceIds.includes(x.id);
              return (
                <li key={x.id} className="hairline-b">
                  <button
                    onClick={() => toggleService(x.id)}
                    aria-pressed={on}
                    className="group flex w-full items-center gap-6 py-5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.05rem] leading-snug">{x.name}</span>
                      {x.note ? (
                        <span className="mt-1 block text-[0.85rem] leading-relaxed text-muted-foreground">{x.note}</span>
                      ) : null}
                      <span className="mt-2 flex items-center gap-2 text-[0.82rem] text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" strokeWidth={1.25} />
                        {formatDuration(x.slots)}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[1.05rem]">
                      {inr(x.price)}
                      {x.from ? "+" : ""}
                    </span>
                    <span
                      className={
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all duration-300 " +
                        (on
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/30 group-hover:border-foreground/70")
                      }
                    >
                      {on ? <Check className="h-5 w-5" strokeWidth={1.5} /> : <Plus className="h-5 w-5" strokeWidth={1.25} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <ImagePanel
          src={img.src}
          pos={img.pos}
          eyebrow="Expert styling"
          title={
            <>
              A style
              <br />
              that's <span className="italic text-champagne">you</span>.
            </>
          }
          sub={men ? "Precision cuts. Modern styles. Timeless confidence." : "Colour. Care. Makeover. Made for you."}
        />
      </div>

      <DesktopBar>
        <span className="flex h-16 w-16 shrink-0 items-center justify-center border border-foreground/12">
          <ShoppingBag className="h-6 w-6" strokeWidth={1.1} />
        </span>
        <div className="min-w-0 flex-1">
          {selected.length ? (
            <>
              <div className="truncate text-[1.05rem]">{selected.map((x) => x.name).join(", ")}</div>
              <div className="mt-0.5 text-[0.85rem] text-muted-foreground">
                {selected.length} selected · {formatDuration(totalSlots)}
              </div>
            </>
          ) : (
            <>
              <div className="text-[1.05rem]">No services selected</div>
              <div className="mt-0.5 text-[0.85rem] text-muted-foreground">Add one or more services to continue</div>
            </>
          )}
        </div>
        <div className="border-l border-hairline pl-8 text-center">
          <div className="text-[0.85rem] text-muted-foreground">Total</div>
          <div className="font-display text-3xl leading-tight">
            {inr(totalPrice)}
            {hasFromPricing ? "+" : ""}
          </div>
        </div>
        <DesktopCTA disabled={selected.length === 0} onClick={() => navigate({ to: "/time" })}>
          Choose a time
        </DesktopCTA>
      </DesktopBar>
    </DesktopPage>
  );
}
