import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Plus,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { Page, PrimaryAction, Screen, StepHeader, StepIntro, StickyBar } from "@/components/screen";
import { haptic } from "@/lib/utils";
import { sfx } from "@/lib/sfx";
import { useRewindBack } from "@/components/scissors-line";
import { SIGNATURE_MARK, isSignature } from "@/lib/service-photos";
import {
  ServiceGlyph,
  ServiceIconTile,
  categoryKind,
  serviceKind,
} from "@/components/service-icons";
import {
  AUDIENCE_IMAGE,
  DesktopBar,
  DesktopCTA,
  DesktopPage,
  DesktopStepperHeader,
  ImagePanel,
  SignaturePanel,
} from "@/components/desktop";
import { useBooking } from "@/lib/booking-store";
import { getServicePopularity } from "@/lib/salon.functions";
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
  const { draft, hydrated, toggleService, selected, totalMinutes, totalPrice, hasFromPricing } =
    useBooking();
  const navigate = useNavigate();
  const [active, setActive] = useState<string | null>(null);
  const chipRow = useRef<HTMLDivElement>(null);
  const popularity = usePopularity();

  useEffect(() => {
    if (hydrated && !draft.audience) navigate({ to: "/book" });
  }, [hydrated, draft.audience, navigate]);

  const menu = draft.audience ? menuFor(draft.audience) : [];
  const activeId = active ?? menu[0]?.id ?? null;
  const category = menu.find((c) => c.id === activeId) ?? menu[0];
  const [query, setQuery] = useState("");
  const search = useServiceSearch(menu, query);
  const listHasPhotos = (search ?? category?.services ?? []).some((x) => x.photo);

  // warm every icon on this menu while the browser is idle, so switching
  // categories never shows empty tiles (small files, fetched once, then cached)
  useEffect(() => {
    if (!menu.length) return;
    const urls = [
      ...new Set(
        menu.flatMap((c) => [c.icon, ...c.services.map((x) => x.icon)]).filter(Boolean) as string[],
      ),
    ];
    const idle =
      (window as unknown as { requestIdleCallback?: (f: () => void) => number })
        .requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 600));
    const h = idle(() => urls.forEach((u) => (new Image().src = u)));
    return () => {
      (window as unknown as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.audience, menu.length]);

  // each category has its own note; staying on the same one stays silent
  const goCategory = (id: string) => {
    if (id !== category?.id || search)
      sfx.categoryChange(
        Math.max(
          0,
          menu.findIndex((c) => c.id === id),
        ),
      );
    setActive(id);
    setQuery("");
  };
  // a soft response when results appear: never per keystroke (throttled in the engine)
  const hits = search?.length ?? 0;
  useEffect(() => {
    if (search && hits > 0) sfx.searchResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, Boolean(search)]);

  useEffect(() => {
    const el = chipRow.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  if (!draft.audience || !category) return null;

  const men = draft.audience === "men";

  return (
    <>
      <DesktopServices
        menu={menu}
        category={category}
        onCategory={goCategory}
        query={query}
        onQuery={setQuery}
        search={search}
      />
      <div className="md:hidden">
        <Page>
          <StepHeader back="/book" step={2} />
          <Screen className="px-5">
            <StepIntro eyebrow={men ? "Men's services" : "Women's services"}>
              Select your <span className="italic text-bronze">services.</span>
            </StepIntro>

            <SearchBox
              value={query}
              onChange={setQuery}
              className="mt-5"
              hint={men ? "haircut, beard, colour…" : "haircut, facial, colour…"}
            />

            <div
              ref={chipRow}
              role="tablist"
              aria-label="Service categories"
              className="-mx-5 mt-6 overflow-x-auto overscroll-x-contain scroll-px-5 px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:overflow-visible md:px-0"
            >
              <div className="flex w-max gap-2 py-1 md:w-auto md:flex-wrap">
                {menu.map((c) => {
                  const on = !search && c.id === category.id;
                  const count = c.services.filter((x) => draft.serviceIds.includes(x.id)).length;
                  return (
                    <button
                      key={c.id}
                      role="tab"
                      aria-selected={on}
                      onClick={() => goCategory(c.id)}
                      className={
                        "press inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[0.82rem] tracking-[0.02em] " +
                        (on
                          ? "border-bronze/70 bg-champagne/30 text-foreground shadow-[0_8px_22px_-16px_rgba(60,40,20,0.45)]"
                          : "border-foreground/15 bg-card text-foreground/75 hover:border-foreground/40")
                      }
                    >
                      {c.icon ? (
                        <span className="-ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3ece1]">
                          <img src={c.icon} alt="" className="h-5 w-5 object-contain" />
                        </span>
                      ) : (
                        <ServiceGlyph kind={categoryKind(c.id)} active={on} className="h-4 w-4" />
                      )}
                      {c.title}
                      {count > 0 ? (
                        <span
                          key={count}
                          className={
                            "pop-in inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.68rem] tabular-nums " +
                            (on ? "bg-background/20 text-background" : "bg-bronze text-ivory")
                          }
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div key={search ? "search" : category.id} className="slide-in mt-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-[1.9rem] leading-tight">
                  {search ? "Results" : category.title}
                </h2>
                <span className="text-[0.75rem] text-muted-foreground">
                  {search ? `${search.length} found` : `${category.services.length} services`}
                </span>
              </div>
              {!search && category.blurb ? (
                <p className="mt-1 text-[0.85rem] leading-relaxed text-muted-foreground">
                  {category.blurb}
                </p>
              ) : null}
              {search && search.length === 0 ? (
                <NoResults query={query} onClear={() => setQuery("")} />
              ) : null}
              <ul className="stagger mt-4 space-y-2.5">
                {sortServices(
                  search ?? category.services.map((x) => ({ ...x, category: "" })),
                  "popular",
                  popularity,
                ).map((x) => {
                  const on = draft.serviceIds.includes(x.id);
                  return (
                    <li key={x.id}>
                      <button
                        onClick={() => {
                          haptic();
                          sfx.serviceSelect(!on);
                          toggleService(x.id);
                        }}
                        aria-pressed={on}
                        className={
                          "press flex w-full items-center gap-3 rounded-md border px-4 py-4 text-left max-[374px]:gap-2.5 max-[374px]:px-3.5 " +
                          (on
                            ? "border-foreground/70 bg-card shadow-[0_10px_28px_-18px_color-mix(in_oklab,var(--ink)_45%,transparent)]"
                            : "border-foreground/8 bg-card/60 hover:border-foreground/25")
                        }
                      >
                        <ServiceIconTile
                          kind={serviceKind(x)}
                          photo={x.photo}
                          icon={x.icon}
                          framed={listHasPhotos}
                          active={on}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[clamp(0.9rem,3.9vw,1rem)] leading-snug [text-wrap:balance]">
                            {x.name}
                          </span>
                          {x.category ? (
                            <span className="mt-0.5 block text-[0.66rem] uppercase tracking-[0.2em] text-bronze">
                              {x.category}
                            </span>
                          ) : null}
                          {x.note ? (
                            <span className="mt-1 block text-[0.78rem] leading-relaxed text-muted-foreground">
                              {x.note}
                            </span>
                          ) : null}
                          <span className="mt-1.5 flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" strokeWidth={1.25} />
                            {formatDuration(x.minutes)}
                          </span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[1rem]">
                          {inr(x.price)}
                          {x.from ? "+" : ""}
                        </span>
                        <span
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 max-[374px]:h-9 max-[374px]:w-9 " +
                            (on
                              ? "ring-pulse border-foreground bg-foreground text-background"
                              : "border-foreground/25 text-foreground/70")
                          }
                        >
                          {on ? (
                            <Check className="pop-in h-4 w-4" strokeWidth={1.75} />
                          ) : (
                            <Plus className="h-4 w-4" strokeWidth={1.25} />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Screen>

          {selected.length ? (
            <StickyBar>
              <div className="fade-rise mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-foreground/12">
                    <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.1} />
                    {selected.length ? (
                      <span
                        key={selected.length}
                        className="pop-in absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bronze px-1 text-[0.65rem] text-ivory tabular-nums"
                      >
                        {selected.length}
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9rem]">
                      {selected.map((x) => x.name).join(", ")}
                    </span>
                    <span className="block text-[0.75rem] text-muted-foreground">
                      {formatDuration(totalMinutes)}
                    </span>
                  </span>
                </div>
                <span
                  key={totalPrice}
                  className="tick-in shrink-0 font-display text-[1.7rem] leading-none"
                >
                  {inr(totalPrice)}
                  {hasFromPricing ? "+" : ""}
                </span>
              </div>
              <PrimaryAction
                disabled={selected.length === 0}
                onClick={() => navigate({ to: "/time" })}
              >
                Choose a time
              </PrimaryAction>
            </StickyBar>
          ) : null}
        </Page>
      </div>
    </>
  );
}

function DesktopServices({
  menu,
  category,
  onCategory,
  query,
  onQuery,
  search,
}: {
  menu: Category[];
  category: Category;
  onCategory: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  search: SearchHit[] | null;
}) {
  const { draft, toggleService, selected, totalMinutes, totalPrice, hasFromPricing } = useBooking();
  const navigate = useNavigate();
  const men = draft.audience === "men";
  const img = AUDIENCE_IMAGE[men ? "men" : "women"];
  const [sort, setSort] = useState<SortKey>("popular");
  const popularity = usePopularity();
  const goBack = useRewindBack("/book");

  return (
    <DesktopPage>
      <DesktopStepperHeader step={2} />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,34%)] xl:grid-cols-[minmax(17rem,22%)_minmax(0,1fr)_minmax(18rem,32%)]">
        {/* Categories */}
        <nav
          aria-label="Service categories"
          className="hidden min-h-0 flex-col overflow-y-auto border-r xl:flex border-hairline px-8 py-8 [scrollbar-width:thin]"
        >
          <Link
            to="/book"
            onClick={(e) => void goBack(e)}
            className="label-caps press inline-flex items-center gap-3 text-foreground/70 transition-opacity hover:opacity-60"
          >
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
            {menu.map((c) => {
              const on = !search && c.id === category.id;
              const count = c.services.filter((x) => draft.serviceIds.includes(x.id)).length;
              return (
                <li key={c.id}>
                  <button
                    role="tab"
                    aria-selected={on}
                    onClick={() => onCategory(c.id)}
                    className={
                      "press flex w-full items-center gap-4 rounded-sm border px-4 py-3.5 text-left " +
                      (on
                        ? "border-bronze/70 bg-champagne/30 text-foreground shadow-[0_8px_22px_-16px_rgba(60,40,20,0.45)]"
                        : "border-foreground/10 bg-card hover:border-foreground/35")
                    }
                  >
                    <ServiceIconTile
                      kind={categoryKind(c.id)}
                      photo={c.photo}
                      icon={c.icon}
                      active={on}
                      size="sm"
                      className={on ? "bg-[#f3ece1]" : ""}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.95rem]">{c.title}</span>
                      <span className={"mt-0.5 block text-[0.75rem] " + "text-muted-foreground"}>
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

        {/* Service list (tablets and small laptops get the intro + category chips here) */}
        <div className="min-h-0 overflow-y-auto [scrollbar-width:thin]">
          <div className="px-8 pt-7 lg:px-10 xl:hidden">
            <Link
              to="/book"
              onClick={(e) => void goBack(e)}
              className="label-caps press inline-flex items-center gap-3 text-foreground/70 transition-opacity hover:opacity-60"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.25} />
              Back
            </Link>
            <div className="mt-6 text-[0.7rem] uppercase tracking-[0.3em] text-bronze">
              {men ? "Men's" : "Women's"} services
            </div>
            <h1 className="mt-2 font-display text-[clamp(2.4rem,4.4vw,3.2rem)] leading-[1.02]">
              Select your <span className="italic text-bronze">services.</span>
            </h1>
            <div
              role="tablist"
              aria-label="Service categories"
              className="mt-6 flex flex-wrap gap-2"
            >
              {menu.map((c) => {
                const on = !search && c.id === category.id;
                const count = c.services.filter((x) => draft.serviceIds.includes(x.id)).length;
                return (
                  <button
                    key={c.id}
                    role="tab"
                    aria-selected={on}
                    onClick={() => onCategory(c.id)}
                    className={
                      "press inline-flex min-h-11 items-center gap-2 rounded-sm border px-4 text-[0.88rem] " +
                      (on
                        ? "border-bronze/70 bg-champagne/30 text-foreground shadow-[0_8px_22px_-16px_rgba(60,40,20,0.45)]"
                        : "border-foreground/12 bg-card text-foreground/80 hover:border-foreground/40")
                    }
                  >
                    {c.icon ? (
                      <span className="-ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3ece1]">
                        <img src={c.icon} alt="" className="h-5 w-5 object-contain" />
                      </span>
                    ) : (
                      <ServiceGlyph
                        kind={categoryKind(c.id)}
                        active={on}
                        className="h-[18px] w-[18px]"
                      />
                    )}
                    {c.title}
                    {count > 0 ? (
                      <span
                        key={count}
                        className={
                          "pop-in inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.68rem] tabular-nums " +
                          (on ? "bg-background/20 text-background" : "bg-bronze text-ivory")
                        }
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 px-8 pt-6 lg:px-10 xl:px-12 xl:pt-7">
            <SearchBox
              value={query}
              onChange={onQuery}
              className="min-w-0 flex-1"
              hint={men ? "haircut, beard, colour…" : "haircut, facial, colour…"}
            />
            <SortMenu value={sort} onChange={setSort} />
          </div>
          <section
            key={search ? "search" : category.id}
            className="slide-in px-8 py-7 lg:px-10 xl:px-12 xl:py-8"
          >
            <div className="flex items-baseline justify-between gap-6">
              <h2 className="font-display text-[2.5rem] leading-tight">
                {search ? "Results" : category.title}
              </h2>
              <span className="label-caps shrink-0 text-foreground/55">
                {search ? `${search.length} found` : `${category.services.length} services`}
              </span>
            </div>
            {!search && category.blurb ? (
              <p className="mt-1 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
                {category.blurb}
              </p>
            ) : null}
            {search && search.length === 0 ? (
              <NoResults query={query} onClear={() => onQuery("")} />
            ) : null}
            <ul key={sort} className="stagger mt-5 hairline-t">
              {sortServices(
                search ?? category.services.map((x) => ({ ...x, category: "" })),
                sort,
                popularity,
              ).map((x) => {
                const on = draft.serviceIds.includes(x.id);
                return (
                  <li key={x.id} className="hairline-b">
                    <button
                      onClick={() => {
                        sfx.serviceSelect(!on);
                        toggleService(x.id);
                      }}
                      aria-pressed={on}
                      className={
                        "group -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-5 px-3 py-3.5 text-left transition-colors duration-300 " +
                        (on ? "bg-champagne/16" : "hover:bg-foreground/[0.025]")
                      }
                    >
                      <ServiceIconTile
                        kind={serviceKind(x)}
                        photo={x.photo}
                        icon={x.icon}
                        framed
                        active={on}
                        size="thumb"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[1.3rem] leading-tight">
                          {x.name}
                        </span>
                        {x.category ? (
                          <span className="mt-0.5 block text-[0.68rem] uppercase tracking-[0.22em] text-bronze">
                            {x.category}
                          </span>
                        ) : null}
                        {x.note ? (
                          <span className="mt-0.5 block truncate text-[0.85rem] text-muted-foreground">
                            {x.note}
                          </span>
                        ) : null}
                        <span className="mt-1 flex items-center gap-2 text-[0.82rem] text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" strokeWidth={1.25} />
                          {formatDuration(x.minutes)}
                        </span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-display text-[1.4rem]">
                        {inr(x.price)}
                        {x.from ? "+" : ""}
                      </span>
                      <span
                        className={
                          "ml-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all duration-300 group-active:scale-90 " +
                          (on
                            ? "ring-pulse border-foreground bg-foreground text-background"
                            : "border-foreground/30 group-hover:border-foreground/70")
                        }
                      >
                        {on ? (
                          <Check className="pop-in h-5 w-5" strokeWidth={1.5} />
                        ) : (
                          <Plus className="h-5 w-5" strokeWidth={1.25} />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {selected.some(isSignature) ? (
          <SignaturePanel className="hidden lg:flex" mark={SIGNATURE_MARK} />
        ) : (
          <ImagePanel
            className="hidden lg:block"
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
            sub={
              men
                ? "Precision cuts. Modern styles. Timeless confidence."
                : "Colour. Care. Makeover. Made for you."
            }
          />
        )}
      </div>

      <DesktopBar>
        {selected[0] ? (
          <ServiceIconTile
            key={selected[0].id}
            kind={serviceKind(selected[0])}
            photo={selected[0].photo}
            icon={selected[0].icon}
            framed
            size="thumb"
            className="pop-in"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-foreground/12">
            <ShoppingBag className="h-6 w-6" strokeWidth={1.1} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {selected.length ? (
            <>
              <div className="truncate font-display text-[1.35rem] leading-tight">
                {selected.length} {selected.length === 1 ? "service" : "services"} selected
              </div>
              <div className="mt-0.5 truncate text-[0.88rem] text-muted-foreground">
                {formatDuration(totalMinutes)} · {selected.map((x) => x.name).join(", ")}
              </div>
            </>
          ) : (
            <>
              <div className="text-[1.05rem]">No services selected</div>
              <div className="mt-0.5 text-[0.85rem] text-muted-foreground">
                Add one or more services to continue
              </div>
            </>
          )}
        </div>
        <div className="border-l border-hairline pl-8 text-center">
          <div className="text-[0.85rem] text-muted-foreground">Total</div>
          <div key={totalPrice} className="tick-in font-display text-3xl leading-tight">
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

type SearchHit = Category["services"][number] & { category: string };

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Every service of this menu matching all the typed words (name, note or category). */
function useServiceSearch(menu: Category[], query: string): SearchHit[] | null {
  return useMemo(() => {
    const words = norm(query).split(" ").filter(Boolean);
    if (!words.length) return null;
    return menu.flatMap((c) =>
      c.services
        .filter((x) => {
          const hay = norm(`${x.name} ${x.note ?? ""} ${c.title}`);
          return words.every((w) => hay.includes(w));
        })
        .map((x) => ({ ...x, category: c.title })),
    );
  }, [menu, query]);
}

function SearchBox({
  value,
  onChange,
  className,
  hint = "haircut, facial, colour…",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  hint?: string;
}) {
  const focused = useRef(false);
  return (
    <label className={"group relative block " + (className ?? "")}>
      <span className="sr-only">Search services</span>
      <Search
        className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-foreground/45 transition-colors group-focus-within:text-bronze"
        strokeWidth={1.25}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          // one barely-there activation on the first focus only
          if (focused.current) return;
          focused.current = true;
          sfx.searchFocus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        placeholder={`Search services — ${hint}`}
        enterKeyHint="search"
        autoComplete="off"
        className="h-12 w-full rounded-full border border-foreground/12 bg-card pr-11 pl-11 text-[0.95rem] outline-none transition-colors placeholder:text-foreground/35 focus:border-foreground/45 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="press pop-in absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-foreground/55 hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      ) : null}
    </label>
  );
}

function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-md border border-dashed border-foreground/15 px-6 py-10 text-center">
      <Search className="h-6 w-6 text-bronze/70" strokeWidth={1.1} />
      <p className="text-[0.95rem]">Nothing matches “{query.trim()}”.</p>
      <button
        type="button"
        onClick={onClear}
        className="press text-[0.85rem] text-bronze underline underline-offset-4"
      >
        Clear search
      </button>
    </div>
  );
}

type SortKey = "popular" | "price-asc" | "price-desc" | "duration";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "duration", label: "Quickest first" },
];

/** "Popular" follows what guests actually book (recent bookings); ties keep the salon's own order. */
function sortServices<T extends { id: string; price: number; minutes: number }>(
  list: T[],
  key: SortKey,
  popularity: Record<string, number> = {},
) {
  const out = list.map((x, i) => ({ x, i }));
  out.sort((a, b) => {
    if (key === "price-asc") return a.x.price - b.x.price || a.i - b.i;
    if (key === "price-desc") return b.x.price - a.x.price || a.i - b.i;
    if (key === "duration") return a.x.minutes - b.x.minutes || a.i - b.i;
    return (popularity[b.x.id] ?? 0) - (popularity[a.x.id] ?? 0) || a.i - b.i;
  });
  return out.map((o) => o.x);
}

let popularityCache: Record<string, number> | null = null;
/** Booking counts per service, fetched once per visit and refreshed on the next one. */
function usePopularity() {
  const [counts, setCounts] = useState<Record<string, number>>(popularityCache ?? {});
  useEffect(() => {
    if (popularityCache) return;
    let live = true;
    getServicePopularity()
      .then((r) => {
        popularityCache = r.counts;
        if (live) setCounts(r.counts);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return counts;
}

function SortMenu({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <label className="group relative flex h-12 shrink-0 cursor-pointer flex-col justify-center rounded-full border border-foreground/12 bg-card pr-10 pl-5 transition-colors hover:border-foreground/35 focus-within:border-foreground/45">
      <span className="text-[0.62rem] leading-none text-muted-foreground">Sort by</span>
      <select
        value={value}
        onPointerDown={() => sfx.filterOpen()}
        onChange={(e) => {
          sfx.filterPick();
          onChange(e.target.value as SortKey);
        }}
        className="mt-1 cursor-pointer appearance-none bg-transparent pr-1 text-[0.9rem] leading-none outline-none"
        aria-label="Sort services"
      >
        {SORTS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-foreground/60"
        strokeWidth={1.5}
      />
    </label>
  );
}
