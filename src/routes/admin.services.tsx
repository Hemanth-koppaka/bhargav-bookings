import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
} from "lucide-react";
import { adminSaveMedia } from "@/lib/photos.functions";
import { loadImageFile, shrinkImage } from "@/lib/image";
import { AdminShell, Empty, TinyButton, inputClass } from "@/components/admin";
import { LoadState } from "@/components/admin-ops";
import { adminSaveCategory, adminSaveService } from "@/lib/admin-content.functions";
import {
  adminArchiveItem,
  adminCatalogue,
  adminDuplicateService,
  adminReorder,
  type CatalogueCategory,
  type CatalogueService,
} from "@/lib/admin-catalogue.functions";
import { adminServiceRule, adminSetServiceRule } from "@/lib/admin-staff.functions";
import { useAdmin } from "@/lib/admin-store";
import { formatDuration, inr, type Audience } from "@/lib/salon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/services")({
  head: () => ({
    meta: [
      { title: "Catalogue — Hair by Bhargav" },
      { name: "description", content: "Services, categories, prices, durations and photos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Catalogue — Hair by Bhargav" },
      { property: "og:description", content: "The salon's service catalogue." },
    ],
  }),
  component: CatalogueScreen,
});

type Data = Awaited<ReturnType<typeof adminCatalogue>>;
type View = "live" | "hidden" | "archived";

const DURATIONS = Array.from({ length: 48 }, (_, i) => (i + 1) * 5);
const BUFFERS = [0, 5, 10, 15, 20, 30, 45, 60];

function CatalogueScreen() {
  const { pin, signOut } = useAdmin();
  const [audience, setAudience] = useState<Audience>("men");
  const [view, setView] = useState<View>("live");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<CatalogueService | "new" | null>(null);
  const [newIn, setNewIn] = useState<string | null>(null);
  const [catEdit, setCatEdit] = useState<CatalogueCategory | "new" | null>(null);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let live = true;
    adminCatalogue({ data: { pin } })
      .then((d) => {
        if (!live) return;
        setData(d);
        setError("");
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof Error && /session/i.test(e.message))
          return signOut("Your session ended. Please sign in again.");
        setError("Couldn't load the catalogue.");
      });
    return () => {
      live = false;
    };
  }, [pin, tick, signOut]);

  const term = q.trim().toLowerCase();
  const cats = useMemo(
    () =>
      (data?.categories ?? [])
        .filter((c) => c.gender === audience)
        .sort((a, b) => a.order - b.order),
    [data, audience],
  );
  const svcs = useMemo(
    () =>
      (data?.services ?? [])
        .filter((s) => s.gender === audience)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [data, audience],
  );
  const shows = (s: CatalogueService, c: CatalogueCategory | undefined) =>
    view === "archived"
      ? s.archived || Boolean(c?.archived)
      : !s.archived && !c?.archived && (view === "hidden" ? !s.active || !c?.active : true);
  const match = (s: CatalogueService) =>
    !term || s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term);

  const counts = {
    live: svcs.filter((s) => !s.archived).length,
    hidden: svcs.filter((s) => !s.archived && !s.active).length,
    archived: svcs.filter((s) => s.archived).length + cats.filter((c) => c.archived).length,
  };

  /* actions */
  const run = async (p: Promise<{ ok: boolean; error?: string }>, done: string) => {
    try {
      const r = await p;
      if (r.ok === false) return void toast.error(r.error ?? "Couldn't save.");
      toast.success(done);
      reload();
    } catch (e) {
      toast.error(
        e instanceof Error && e.message.length < 120
          ? e.message
          : "Couldn't save. Please try again.",
      );
    }
  };
  const payload = (s: CatalogueService, patch: Partial<CatalogueService> = {}) => {
    const n = { ...s, ...patch };
    return {
      pin,
      id: n.id,
      categoryId: n.categoryId,
      name: n.name,
      description: n.description,
      minutes: n.minutes,
      price: n.price,
      from: n.from,
      order: n.order,
      active: n.active,
      buffer: n.buffer,
      featured: n.featured,
    };
  };
  const toggleService = (s: CatalogueService) =>
    run(
      adminSaveService({ data: payload(s, { active: !s.active }) }).then(() => ({ ok: true })),
      s.active ? `${s.name} hidden from guests.` : `${s.name} shown to guests.`,
    );
  const toggleCategory = (c: CatalogueCategory) =>
    run(
      adminSaveCategory({
        data: {
          pin,
          id: c.id,
          gender: c.gender,
          name: c.name,
          description: c.description,
          order: c.order,
          active: !c.active,
        },
      }).then(() => ({ ok: true })),
      c.active ? `${c.name} hidden from guests.` : `${c.name} shown to guests.`,
    );
  const move = (
    list: { id: string }[],
    index: number,
    dir: -1 | 1,
    kind: "service" | "category",
  ) => {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((x) => x.id);
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    // optimistic: reflect the new order straight away
    setData((d) =>
      d
        ? kind === "service"
          ? {
              ...d,
              services: d.services.map((s) =>
                ids.includes(s.id) ? { ...s, order: ids.indexOf(s.id) } : s,
              ),
            }
          : {
              ...d,
              categories: d.categories.map((c) =>
                ids.includes(c.id) ? { ...c, order: ids.indexOf(c.id) } : c,
              ),
            }
        : d,
    );
    void adminReorder({ data: { pin, kind, ids } }).then(
      (r) => !r.ok && (toast.error(r.error), reload()),
    );
  };

  const visibleCats = cats.filter((c) => (view === "archived" ? true : !c.archived));

  return (
    <AdminShell
      title="Catalogue"
      subtitle="Services, prices, durations and photos. Changes show to guests immediately."
      right={
        <div className="flex flex-wrap gap-2">
          <TinyButton tone="primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New service
          </TinyButton>
          <TinyButton onClick={() => setCatEdit("new")}>
            <Plus className="h-4 w-4" /> New category
          </TinyButton>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-foreground/15 p-0.5">
          {(["men", "women"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAudience(a)}
              className={cn(
                "rounded px-4 py-1.5 text-[0.82rem] capitalize",
                audience === a ? "bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(
            [
              ["live", "All", counts.live],
              ["hidden", "Hidden", counts.hidden],
              ["archived", "Archived", counts.archived],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={cn(
                "press rounded-full border px-3 py-1 text-[0.78rem]",
                view === k
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/15",
              )}
            >
              {label} <span className="opacity-60 tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-foreground/15 px-3 sm:max-w-64">
          <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a service"
            className="min-w-0 flex-1 bg-transparent text-[0.85rem] outline-none"
          />
        </label>
      </div>

      <div className="mt-5 space-y-5">
        <LoadState loading={!data && !error} error={error} onRetry={reload} />
        {data && !visibleCats.length ? (
          <Empty
            title="No categories yet."
            action={<TinyButton onClick={() => setCatEdit("new")}>Add a category</TinyButton>}
          />
        ) : null}

        {visibleCats.map((c, ci) => {
          const list = svcs.filter((s) => s.categoryId === c.id && shows(s, c) && match(s));
          const orderable = svcs.filter((s) => s.categoryId === c.id && !s.archived);
          if (view !== "live" && !list.length && !(view === "archived" && c.archived)) return null;
          if (term && !list.length) return null;
          return (
            <section
              key={c.id}
              className={cn(
                "overflow-hidden rounded-md border border-hairline bg-card",
                (c.archived || !c.active) && view === "live" && "opacity-70",
              )}
            >
              <header className="flex items-start gap-3 border-b border-hairline px-4 py-3.5 lg:px-5">
                <PhotoTile mediaKey={`cat:${c.id}`} url={c.photo} icon={c.icon} onChange={reload} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-[1.4rem] leading-tight">{c.name}</h2>
                    {!c.active ? <Badge>Hidden</Badge> : null}
                    {c.archived ? <Badge tone="danger">Archived</Badge> : null}
                  </div>
                  {c.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[0.8rem] text-muted-foreground">
                      {c.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {c.archived ? (
                    <IconBtn
                      label="Restore category"
                      onClick={() =>
                        void run(
                          adminArchiveItem({
                            data: { pin, kind: "category", id: c.id, restore: true },
                          }),
                          `${c.name} restored.`,
                        )
                      }
                    >
                      <RotateCcw />
                    </IconBtn>
                  ) : (
                    <>
                      {view === "live" ? (
                        <>
                          <IconBtn
                            label="Move up"
                            disabled={ci === 0}
                            onClick={() => move(visibleCats, ci, -1, "category")}
                          >
                            <ArrowUp />
                          </IconBtn>
                          <IconBtn
                            label="Move down"
                            disabled={ci === visibleCats.length - 1}
                            onClick={() => move(visibleCats, ci, 1, "category")}
                          >
                            <ArrowDown />
                          </IconBtn>
                        </>
                      ) : null}
                      <IconBtn
                        label={c.active ? "Hide from guests" : "Show to guests"}
                        onClick={() => void toggleCategory(c)}
                      >
                        {c.active ? <Eye /> : <EyeOff />}
                      </IconBtn>
                      <IconBtn label="Edit category" onClick={() => setCatEdit(c)}>
                        <Pencil />
                      </IconBtn>
                    </>
                  )}
                </div>
              </header>

              <ul>
                {list.map((s) => {
                  const oi = orderable.findIndex((x) => x.id === s.id);
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0 lg:px-5"
                    >
                      <PhotoTile
                        mediaKey={`svc:${s.id}`}
                        url={s.photo}
                        icon={s.icon}
                        onChange={reload}
                        small
                      />
                      <button onClick={() => setEditing(s)} className="min-w-0 flex-1 text-left">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn("text-[0.95rem]", !s.active && "text-muted-foreground")}
                          >
                            {s.name}
                          </span>
                          {s.featured ? (
                            <Star
                              className="h-3.5 w-3.5 fill-bronze text-bronze"
                              aria-label="Featured"
                            />
                          ) : null}
                          {!s.active ? <Badge>Hidden</Badge> : null}
                          {s.archived ? <Badge tone="danger">Archived</Badge> : null}
                        </span>
                        <span className="block text-[0.78rem] text-muted-foreground">
                          {formatDuration(s.minutes)}
                          {s.buffer ? ` + ${s.buffer} min buffer` : ""}
                          {s.upcoming ? ` · ${s.upcoming} upcoming` : ""}
                        </span>
                      </button>
                      <span className="shrink-0 text-[0.92rem] tabular-nums">
                        {inr(s.price)}
                        {s.from ? "+" : ""}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {s.archived ? (
                          <IconBtn
                            label="Restore"
                            onClick={() =>
                              void run(
                                adminArchiveItem({
                                  data: { pin, kind: "service", id: s.id, restore: true },
                                }),
                                `${s.name} restored.`,
                              )
                            }
                          >
                            <RotateCcw />
                          </IconBtn>
                        ) : (
                          <>
                            {view === "live" && !term ? (
                              <span className="hidden sm:flex">
                                <IconBtn
                                  label="Move up"
                                  disabled={oi <= 0}
                                  onClick={() => move(orderable, oi, -1, "service")}
                                >
                                  <ArrowUp />
                                </IconBtn>
                                <IconBtn
                                  label="Move down"
                                  disabled={oi >= orderable.length - 1}
                                  onClick={() => move(orderable, oi, 1, "service")}
                                >
                                  <ArrowDown />
                                </IconBtn>
                              </span>
                            ) : null}
                            <IconBtn
                              label={s.active ? "Hide from guests" : "Show to guests"}
                              onClick={() => void toggleService(s)}
                            >
                              {s.active ? <Eye /> : <EyeOff />}
                            </IconBtn>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
                {!list.length ? (
                  <li className="px-5 py-4 text-[0.82rem] text-muted-foreground">
                    No services here.
                  </li>
                ) : null}
              </ul>
              {view === "live" && !c.archived && !term ? (
                <button
                  onClick={() => {
                    setNewIn(c.id);
                    setEditing("new");
                  }}
                  className="flex w-full items-center gap-2 border-t border-hairline px-5 py-2.5 text-[0.8rem] text-bronze hover:bg-foreground/[0.02]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add a service to {c.name}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>

      <ServiceEditor
        service={editing}
        audience={audience}
        categories={cats.filter((c) => !c.archived)}
        defaultCategory={newIn}
        nextOrder={svcs.length}
        onClose={() => {
          setEditing(null);
          setNewIn(null);
        }}
        onSaved={reload}
      />
      <CategoryEditor
        category={catEdit}
        audience={audience}
        nextOrder={cats.length}
        onClose={() => setCatEdit(null)}
        onSaved={reload}
      />
    </AdminShell>
  );
}

/* ── small parts ──────────────────────────────────────────── */

function Badge({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 text-[0.6rem] uppercase tracking-[0.12em]",
        tone === "danger"
          ? "border-destructive/30 text-destructive"
          : "border-foreground/20 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="press grid h-8 w-8 place-items-center rounded-md text-foreground/60 hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-25 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.5]"
    >
      {children}
    </button>
  );
}

const Field = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) => (
  <label className="block">
    <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
      {label}
    </span>
    {children}
    {hint ? <span className="mt-1 block text-[0.72rem] text-muted-foreground">{hint}</span> : null}
  </label>
);

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--bronze)]"
      />
      <span>
        <span className="text-[0.88rem]">{label}</span>
        {hint ? <span className="block text-[0.72rem] text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/* ── service editor ───────────────────────────────────────── */

function ServiceEditor({
  service,
  audience,
  categories,
  defaultCategory,
  nextOrder,
  onClose,
  onSaved,
}: {
  service: CatalogueService | "new" | null;
  audience: Audience;
  categories: CatalogueCategory[];
  defaultCategory: string | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { pin } = useAdmin();
  const isNew = service === "new";
  const blank = useMemo(
    () => ({
      name: "",
      description: "",
      categoryId: defaultCategory ?? categories[0]?.id ?? "",
      minutes: 30,
      buffer: 0,
      price: "",
      from: false,
      featured: false,
      active: true,
    }),
    [defaultCategory, categories],
  );
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  // who performs this service: any qualified stylist, or one preferred stylist
  const [rule, setRule] = useState<{ preferred: string; initial: string; stylists: { id: string; name: string }[] } | null>(null);
  useEffect(() => {
    setRule(null);
    if (!service || service === "new") return;
    let live = true;
    adminServiceRule({ data: { pin, id: service.id } })
      .then((r) => live && setRule({ preferred: r.preferred ?? "any", initial: r.preferred ?? "any", stylists: r.stylists }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [service, pin]);

  useEffect(() => {
    if (!service) return;
    setErr("");
    setConfirmArchive(false);
    setF(
      service === "new"
        ? blank
        : {
            name: service.name,
            description: service.description,
            categoryId: service.categoryId,
            minutes: service.minutes,
            buffer: service.buffer,
            price: String(service.price),
            from: service.from,
            featured: service.featured,
            active: service.active,
          },
    );
  }, [service, blank]);

  const save = async () => {
    const price = Number(f.price);
    if (!f.name.trim()) return setErr("Give the service a name.");
    if (!f.categoryId) return setErr("Choose a category.");
    if (f.price === "" || !Number.isFinite(price) || price < 0)
      return setErr("Enter a price (0 or more).");
    setBusy(true);
    setErr("");
    try {
      await adminSaveService({
        data: {
          pin,
          ...(isNew ? {} : { id: (service as CatalogueService).id }),
          categoryId: f.categoryId,
          name: f.name.trim(),
          description: f.description.trim(),
          minutes: f.minutes,
          price: Math.round(price),
          from: f.from,
          order: isNew ? nextOrder : (service as CatalogueService).order,
          active: f.active,
          buffer: f.buffer,
          featured: f.featured,
        },
      });
      if (!isNew && rule && rule.preferred !== rule.initial) {
        const r = await adminSetServiceRule({ data: { pin, id: (service as CatalogueService).id, preferred: rule.preferred } });
        if (!r.ok) throw new Error(r.error);
      }
      toast.success(isNew ? `${f.name.trim()} added.` : "Saved.");
      onSaved();
      onClose();
    } catch (e) {
      setErr(
        e instanceof Error && e.message.length < 120
          ? e.message
          : "Couldn't save. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const act = async (p: Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(true);
    try {
      const r = await p;
      if (!r.ok) return setErr(r.error ?? "Couldn't save.");
      toast.success(done);
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const s = service !== "new" ? service : null;
  return (
    <Dialog open={Boolean(service)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-[1.7rem] font-normal">
            {isNew ? "New service" : "Edit service"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? `Adds to the ${audience}'s menu.`
              : "Existing bookings keep the price and time they were booked with."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name">
            <input
              className={inputClass}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              maxLength={120}
            />
          </Field>
          <Field label="Category">
            <select
              className={inputClass}
              value={f.categoryId}
              onChange={(e) => setF({ ...f, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" hint="Shown under the name on the services step.">
            <textarea
              className={cn(inputClass, "resize-none")}
              rows={2}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              maxLength={1000}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration">
              <select
                className={inputClass}
                value={f.minutes}
                onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })}
              >
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {formatDuration(m)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Buffer after" hint="Clean-up time no one can book.">
              <select
                className={inputClass}
                value={f.buffer}
                onChange={(e) => setF({ ...f, buffer: Number(e.target.value) })}
              >
                {BUFFERS.map((m) => (
                  <option key={m} value={m}>
                    {m ? `${m} min` : "None"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {rule ? (
            <Field
              label="Stylist"
              hint={
                rule.preferred === "any"
                  ? "Any qualified stylist who is free."
                  : "Booked with this stylist. If they're busy, guests can choose another available stylist themselves; it's never switched for them."
              }
            >
              <select className={inputClass} value={rule.preferred} onChange={(e) => setRule({ ...rule, preferred: e.target.value })}>
                <option value="any">Any qualified stylist</option>
                {rule.stylists.map((st) => (
                  <option key={st.id} value={st.id}>
                    Prefer {st.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Price (₹)">
            <input
              className={inputClass}
              value={f.price}
              onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, "").slice(0, 7) })}
              inputMode="numeric"
              placeholder="0"
            />
          </Field>
          <div className="space-y-2.5">
            <Check
              checked={f.from}
              onChange={(v) => setF({ ...f, from: v })}
              label="Starting price"
              hint="Shown as ₹1,000+ and confirmed in the chair."
            />
            <Check
              checked={f.featured}
              onChange={(v) => setF({ ...f, featured: v })}
              label="Featured"
              hint="Marked with a star in the console."
            />
            <Check
              checked={f.active}
              onChange={(v) => setF({ ...f, active: v })}
              label="Visible to guests"
            />
          </div>

          {confirmArchive && s ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/[0.04] p-3 text-[0.85rem]">
              Archive {s.name}? Guests won't see it any more.
              {s.upcoming
                ? ` ${s.upcoming} upcoming booking${s.upcoming > 1 ? "s" : ""} include it — they stay booked with their original price and time.`
                : ""}{" "}
              You can restore it from Archived.
              <div className="mt-2 flex gap-2">
                <TinyButton
                  tone="danger"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      adminArchiveItem({ data: { pin, kind: "service", id: s.id } }),
                      `${s.name} archived.`,
                    )
                  }
                >
                  Archive
                </TinyButton>
                <TinyButton onClick={() => setConfirmArchive(false)}>Keep</TinyButton>
              </div>
            </div>
          ) : null}
          {err ? (
            <p role="alert" className="text-[0.85rem] text-destructive">
              {err}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
            {s && !s.archived ? (
              <>
                <TinyButton
                  disabled={busy}
                  onClick={() =>
                    void act(
                      adminDuplicateService({ data: { pin, id: s.id } }),
                      "Copy created (hidden until you show it).",
                    )
                  }
                >
                  <Copy className="h-4 w-4" /> Duplicate
                </TinyButton>
                <TinyButton tone="danger" disabled={busy} onClick={() => setConfirmArchive(true)}>
                  <Archive className="h-4 w-4" /> Archive
                </TinyButton>
              </>
            ) : null}
            <span className="flex-1" />
            <TinyButton onClick={onClose}>Cancel</TinyButton>
            <TinyButton tone="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : isNew ? "Add service" : "Save"}
            </TinyButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── category editor ──────────────────────────────────────── */

function CategoryEditor({
  category,
  audience,
  nextOrder,
  onClose,
  onSaved,
}: {
  category: CatalogueCategory | "new" | null;
  audience: Audience;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { pin } = useAdmin();
  const [f, setF] = useState({ name: "", description: "", active: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const c = category && category !== "new" ? category : null;

  useEffect(() => {
    if (!category) return;
    setErr("");
    setConfirmArchive(false);
    setF(
      c
        ? { name: c.name, description: c.description, active: c.active }
        : { name: "", description: "", active: true },
    );
  }, [category, c]);

  const save = async () => {
    if (!f.name.trim()) return setErr("Give the category a name.");
    setBusy(true);
    try {
      await adminSaveCategory({
        data: {
          pin,
          ...(c ? { id: c.id } : {}),
          gender: c?.gender ?? audience,
          name: f.name.trim(),
          description: f.description.trim(),
          order: c?.order ?? nextOrder,
          active: f.active,
        },
      });
      toast.success(c ? "Category saved." : `${f.name.trim()} added.`);
      onSaved();
      onClose();
    } catch {
      setErr("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!c) return;
    setBusy(true);
    try {
      const r = await adminArchiveItem({ data: { pin, kind: "category", id: c.id } });
      if (!r.ok) return setErr(r.error);
      toast.success(`${c.name} archived.`);
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(category)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[1.7rem] font-normal">
            {c ? "Edit category" : "New category"}
          </DialogTitle>
          <DialogDescription>
            {c ? `On the ${c.gender}'s menu.` : `Adds to the ${audience}'s menu.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name">
            <input
              className={inputClass}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              maxLength={80}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={cn(inputClass, "resize-none")}
              rows={2}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              maxLength={400}
            />
          </Field>
          <Check
            checked={f.active}
            onChange={(v) => setF({ ...f, active: v })}
            label="Visible to guests"
          />
          {confirmArchive && c ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/[0.04] p-3 text-[0.85rem]">
              Archive {c.name} and hide all of its services from guests? Bookings already made are
              not affected.
              <div className="mt-2 flex gap-2">
                <TinyButton tone="danger" disabled={busy} onClick={() => void archive()}>
                  Archive
                </TinyButton>
                <TinyButton onClick={() => setConfirmArchive(false)}>Keep</TinyButton>
              </div>
            </div>
          ) : null}
          {err ? (
            <p role="alert" className="text-[0.85rem] text-destructive">
              {err}
            </p>
          ) : null}
          <div className="flex items-center gap-2 border-t border-hairline pt-4">
            {c ? (
              <TinyButton tone="danger" disabled={busy} onClick={() => setConfirmArchive(true)}>
                <Archive className="h-4 w-4" /> Archive
              </TinyButton>
            ) : null}
            <span className="flex-1" />
            <TinyButton onClick={onClose}>Cancel</TinyButton>
            <TinyButton tone="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : c ? "Save" : "Add category"}
            </TinyButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── icon tile (current icon · upload / replace / remove) ──── */

// Belongs to exactly one record (its id, so one gender): changing a men's
// service never touches the women's service of the same name, and vice versa.
function PhotoTile({
  mediaKey,
  url,
  icon,
  onChange,
  small,
}: {
  mediaKey: string;
  url: string | null;
  /** The record's own built-in icon, shown until one is uploaded. */
  icon?: string;
  onChange: () => void;
  small?: boolean;
}) {
  const { pin } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const save = async (file?: File) => {
    setBusy(true);
    try {
      const dataUrl = file ? shrinkImage(await loadImageFile(file), 1200, 0.85) : undefined;
      const r = await adminSaveMedia({
        data: { pin, key: mediaKey, ...(dataUrl ? { dataUrl } : {}) },
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(
          file ? "Icon changed for this service only." : "Back to this service's own icon.",
        );
        onChange();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the icon.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const size = small ? "h-12 w-12" : "h-14 w-14";
  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label="Change icon"
        title={url || icon ? "Change icon (this service only)" : "Icon not set: upload one"}
        className={cn(
          "press relative flex items-center justify-center overflow-hidden rounded-md border border-dashed border-foreground/20 bg-background text-foreground/40 hover:border-foreground/50",
          size,
        )}
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : icon ? (
          <img src={icon} alt="" className="h-[86%] w-[86%] object-contain" />
        ) : (
          <ImagePlus className="h-4 w-4" strokeWidth={1.25} />
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          </span>
        ) : null}
      </button>
      {url && !busy ? (
        <button
          type="button"
          onClick={() => void save()}
          aria-label="Remove uploaded icon"
          className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center sm:hidden sm:group-hover:flex justify-center rounded-full border border-hairline bg-background text-[0.7rem] text-muted-foreground shadow-sm group-hover:flex hover:text-destructive"
        >
          ×
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void save(e.target.files?.[0])}
      />
    </div>
  );
}
