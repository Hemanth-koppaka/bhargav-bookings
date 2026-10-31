import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { adminSaveMedia } from "@/lib/photos.functions";
import { loadImageFile, shrinkImage } from "@/lib/image";
import { AdminShell, Panel, TinyButton, inputClass } from "@/components/admin";
import {
  adminGetContent,
  adminSaveService,
  type AdminCategory,
  type AdminService,
} from "@/lib/admin-content.functions";
import { useAdmin } from "@/lib/admin-store";
import { inr, type Audience } from "@/lib/salon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/services")({
  head: () => ({
    meta: [
      { title: "Service menu — Hair by Bhargav" },
      { name: "description", content: "The full men's and women's service menu with pricing." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Service menu — Hair by Bhargav" },
      { property: "og:description", content: "Men's and women's pricing reference." },
    ],
  }),
  component: ServicesAdmin,
});

type AdminContent = Awaited<ReturnType<typeof adminGetContent>>;

type RowState = {
  saving?: boolean;
  message?: string;
  error?: string;
};

const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
};

function ServicesAdmin() {
  const { pin } = useAdmin();
  const [audience, setAudience] = useState<Audience>("women");
  const [content, setContent] = useState<AdminContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createMinutes, setCreateMinutes] = useState("30");
  const [createPrice, setCreatePrice] = useState("0");
  const [createFrom, setCreateFrom] = useState(false);
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [createActive, setCreateActive] = useState(true);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!pin) {
        if (!cancelled) {
          setContent(null);
          setLoadError("Session expired. Please sign in again to manage services.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setLoadError("");
      }

      try {
        const next = await adminGetContent({ data: { pin } });
        if (cancelled) return;
        setContent(next);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Unable to load service menu.";
        setLoadError(
          /access code/i.test(message)
            ? "Session expired. Please sign in again to manage services."
            : message,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [pin, refreshTick]);

  const categories = useMemo(
    () =>
      [...(content?.categories ?? [])]
        .filter((c) => c.gender === audience)
        .sort((a, b) => a.order - b.order),
    [content?.categories, audience],
  );

  const services = useMemo(
    () =>
      [...(content?.services ?? [])]
        .filter((s) => s.gender === audience)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [content?.services, audience],
  );

  useEffect(() => {
    if (!createOpen) return;
    if (categories.length === 0) {
      setCreateCategoryId("");
      return;
    }
    if (!categories.some((c) => c.id === createCategoryId)) {
      setCreateCategoryId(categories[0]?.id ?? "");
    }
  }, [createOpen, categories, createCategoryId]);

  const count = services.length;

  const refresh = () => setRefreshTick((n) => n + 1);

  const media = useMemo(
    () => JSON.parse(content?.mediaJson ?? "{}") as Record<string, string>,
    [content?.mediaJson],
  );

  const saveMinutes = async (service: AdminService, minutes: number) => {
    setRowState((s) => ({ ...s, [service.id]: { saving: true, message: "", error: "" } }));
    try {
      await adminSaveService({ data: getServicePayload(service, { minutes }) });
      setRowState((s) => ({ ...s, [service.id]: { saving: false, message: `Duration set to ${formatMinutes(minutes)}.` } }));
      refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to save duration.";
      setRowState((s) => ({ ...s, [service.id]: { saving: false, error: message } }));
    }
  };

  const getServicePayload = (
    service: AdminService,
    patch: Partial<Pick<AdminService, "price" | "active" | "minutes">>,
  ) => ({
    pin,
    id: service.id,
    categoryId: service.categoryId,
    name: service.name,
    description: service.description,
    minutes: patch.minutes ?? service.minutes,
    price: patch.price ?? service.price,
    from: service.from,
    order: service.order,
    active: patch.active ?? service.active,
  });

  const savePrice = async (service: AdminService) => {
    const next = priceDrafts[service.id] ?? String(service.price);
    const parsed = Number(next);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setRowState((s) => ({ ...s, [service.id]: { saving: false, error: "Enter a valid non-negative price." } }));
      return;
    }
    if (!pin) {
      setRowState((s) => ({ ...s, [service.id]: { saving: false, error: "Session expired. Please sign in again." } }));
      return;
    }

    setRowState((s) => ({ ...s, [service.id]: { saving: true, message: "", error: "" } }));
    try {
      await adminSaveService({ data: getServicePayload(service, { price: parsed }) });
      setRowState((s) => ({ ...s, [service.id]: { saving: false, message: "Price saved." } }));
      refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to save price.";
      setRowState((s) => ({ ...s, [service.id]: { saving: false, error: message } }));
    }
  };

  const toggleActive = async (service: AdminService) => {
    if (!pin) {
      setRowState((s) => ({ ...s, [service.id]: { saving: false, error: "Session expired. Please sign in again." } }));
      return;
    }

    setRowState((s) => ({ ...s, [service.id]: { saving: true, message: "", error: "" } }));
    try {
      await adminSaveService({ data: getServicePayload(service, { active: !service.active }) });
      setRowState((s) => ({
        ...s,
        [service.id]: {
          saving: false,
          message: service.active ? "Service hidden from customers." : "Service visible to customers.",
        },
      }));
      refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to update service visibility.";
      setRowState((s) => ({ ...s, [service.id]: { saving: false, error: message } }));
    }
  };

  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        category,
        services: services
          .filter((service) => service.categoryId === category.id)
          .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
      })),
    [categories, services],
  );

  const uncategorised = useMemo(
    () => services.filter((service) => !categories.some((category) => category.id === service.categoryId)),
    [services, categories],
  );

  const resetCreateForm = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateMinutes("30");
    setCreatePrice("0");
    setCreateFrom(false);
    setCreateActive(true);
    setCreateError("");
    setCreateCategoryId(categories[0]?.id ?? "");
  };

  const createService = async () => {
    if (!pin) {
      setCreateError("Session expired. Please sign in again.");
      return;
    }

    const name = createName.trim();
    if (!name) {
      setCreateError("Service name is required.");
      return;
    }

    const minutes = Number(createMinutes);
    if (!Number.isInteger(minutes) || minutes < 30 || minutes > 600 || minutes % 30 !== 0) {
      setCreateError("Duration must be an integer between 30 and 600 minutes, in 30-minute steps.");
      return;
    }

    const price = Number(createPrice);
    if (!Number.isInteger(price) || price < 0) {
      setCreateError("Price must be a non-negative integer.");
      return;
    }

    const category = categories.find((c) => c.id === createCategoryId);
    if (!category) {
      setCreateError("Choose a valid category for this audience.");
      return;
    }

    const maxOrder = services
      .filter((service) => service.categoryId === category.id)
      .reduce((highest, service) => Math.max(highest, service.order), -1);

    setCreateSaving(true);
    setCreateError("");

    try {
      await adminSaveService({
        data: {
          pin,
          categoryId: category.id,
          name,
          description: createDescription.trim(),
          minutes,
          price,
          from: createFrom,
          order: maxOrder + 1,
          active: createActive,
        },
      });
      setCreateOpen(false);
      resetCreateForm();
      refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to add service.";
      setCreateError(message);
    } finally {
      setCreateSaving(false);
    }
  };

  return (
    <AdminShell
      title="Menu"
      subtitle={loading ? "Loading services…" : `${count} services`}
      right={<TinyButton onClick={() => setCreateOpen(true)}>Add New Service</TinyButton>}
    >
      <div className="flex gap-2">
        {(["women", "men"] as const).map((a) => (
          <TinyButton key={a} active={audience === a} onClick={() => setAudience(a)}>
            {a}
          </TinyButton>
        ))}
      </div>

      {loading && !content ? (
        <Panel className="mt-6">
          <div className="eyebrow">Loading</div>
          <p className="mt-2 text-sm text-muted-foreground">Loading editable services…</p>
        </Panel>
      ) : null}

      {!loading && loadError ? (
        <Panel className="mt-6">
          <div className="eyebrow">Unable to load menu</div>
          <p className="mt-2 text-sm text-destructive">{loadError}</p>
          <div className="mt-4">
            <TinyButton onClick={refresh}>Retry</TinyButton>
          </div>
        </Panel>
      ) : null}

      {!loading && !loadError ? (
        <div className="mt-6 flex flex-col gap-4">
          {grouped.length === 0 ? (
            <Panel>
              <div className="eyebrow">No categories</div>
              <p className="mt-2 text-sm text-muted-foreground">
                No categories are configured for this audience yet.
              </p>
            </Panel>
          ) : null}

          {grouped.map(({ category, services: categoryServices }) => (
            <Panel key={category.id} className="p-0">
              <div className="flex items-start gap-4 border-b border-hairline px-5 py-4">
                <MediaTile mediaKey={`cat:${category.id}`} url={media[`cat:${category.id}`]} onChange={refresh} />
                <div className="min-w-0">
                  <div className="eyebrow">{category.name}</div>
                  {category.description ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{category.description}</p>
                  ) : null}
                </div>
              </div>

              {categoryServices.length ? (
                <div className="divide-y divide-hairline px-5">
                  {categoryServices.map((service) => {
                    const draftPrice = priceDrafts[service.id] ?? String(service.price);
                    const state = rowState[service.id];
                    return (
                      <div
                        key={service.id}
                        className={cn(
                          "py-4",
                          service.active ? "" : "bg-muted/20 opacity-70",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <MediaTile mediaKey={`svc:${service.id}`} url={media[`svc:${service.id}`]} onChange={refresh} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">{service.name}</div>
                            <label className="mt-1.5 inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                              Duration
                              <select
                                className={cn(inputClass, "w-auto py-1 text-xs normal-case tracking-normal")}
                                value={service.minutes}
                                onChange={(e) => void saveMinutes(service, Number(e.target.value))}
                              >
                                {Array.from({ length: 20 }, (_, i) => (i + 1) * 30).map((m) => (
                                  <option key={m} value={m}>
                                    {formatMinutes(m)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {service.description ? (
                              <p className="mt-1 text-xs text-muted-foreground">{service.description}</p>
                            ) : null}
                            {!service.active ? (
                              <p className="mt-1 text-[0.65rem] uppercase tracking-[0.16em] text-destructive">
                                Hidden from customer booking
                              </p>
                            ) : null}
                          </div>

                          <div className="flex min-w-[14rem] shrink-0 flex-col items-end gap-2">
                            <label className="w-full text-right text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground">
                              Price
                              <div className="mt-1 flex items-center justify-end gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className={cn(inputClass, "w-24 py-1 text-right text-sm")}
                                  value={draftPrice}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setPriceDrafts((p) => ({ ...p, [service.id]: next }));
                                    setRowState((s) => ({
                                      ...s,
                                      [service.id]: { ...s[service.id], message: "", error: "" },
                                    }));
                                  }}
                                />
                                <TinyButton onClick={() => void savePrice(service)}>
                                  {state?.saving ? "Saving…" : "Save"}
                                </TinyButton>
                              </div>
                            </label>
                            <div className="flex items-center gap-2">
                              <TinyButton onClick={() => void toggleActive(service)} active={service.active}>
                                {service.active ? "Active" : "Inactive"}
                              </TinyButton>
                            </div>
                            <div className="text-sm tabular-nums text-muted-foreground">
                              {inr(service.price)}
                              {service.from ? " +" : ""}
                            </div>
                            {state?.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}
                            {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-5 py-4 text-sm text-muted-foreground">No services in this category yet.</p>
              )}
            </Panel>
          ))}

          {uncategorised.length ? (
            <Panel>
              <div className="eyebrow">Uncategorised services</div>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                {uncategorised.map((service) => (
                  <p key={service.id}>{service.name}</p>
                ))}
              </div>
            </Panel>
          ) : null}

          {count === 0 && grouped.length > 0 ? (
            <Panel>
              <div className="eyebrow">No services</div>
              <p className="mt-2 text-sm text-muted-foreground">Add your first service for this audience.</p>
            </Panel>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (open) {
            resetCreateForm();
          } else {
            setCreateError("");
          }
        }}
      >
        <DialogContent className="border-hairline bg-card p-6 sm:rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">Add New Service</DialogTitle>
            <DialogDescription className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              This service will appear under the selected audience category.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <label className="block text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">
              Name *
              <input
                className={inputClass}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Service name"
              />
            </label>

            <label className="block text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">
              Description
              <textarea
                className={cn(inputClass, "min-h-20 resize-y border border-hairline px-3 py-2 text-sm")}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Optional notes"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">
                Duration (minutes) *
                <input
                  type="number"
                  min={30}
                  max={600}
                  step={30}
                  className={inputClass}
                  value={createMinutes}
                  onChange={(e) => setCreateMinutes(e.target.value)}
                />
              </label>
              <label className="block text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">
                Price *
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={createPrice}
                  onChange={(e) => setCreatePrice(e.target.value)}
                />
              </label>
            </div>

            <label className="block text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">
              Category *
              <select
                className={cn(inputClass, "h-11 bg-transparent")}
                value={createCategoryId}
                onChange={(e) => setCreateCategoryId(e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <TinyButton active={createFrom} onClick={() => setCreateFrom((v) => !v)}>
                Price from {createFrom ? "On" : "Off"}
              </TinyButton>
              <TinyButton active={createActive} onClick={() => setCreateActive((v) => !v)}>
                {createActive ? "Active" : "Inactive"}
              </TinyButton>
            </div>

            {createError ? <p className="text-sm text-destructive">{createError}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <TinyButton onClick={() => setCreateOpen(false)}>Cancel</TinyButton>
              <button
                type="button"
                onClick={() => void createService()}
                disabled={createSaving}
                className="label-caps border border-foreground bg-foreground px-4 py-2 text-[0.6rem] text-background transition-opacity hover:opacity-88 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createSaving ? "Saving…" : "Save service"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}


/** Photo shown to guests for a service or category; click to upload or replace. */
function MediaTile({ mediaKey, url, onChange }: { mediaKey: string; url?: string | undefined; onChange: () => void }) {
  const { pin } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (file?: File) => {
    setBusy(true);
    setError("");
    try {
      const dataUrl = file ? shrinkImage(await loadImageFile(file), 1200, 0.85) : undefined;
      const r = await adminSaveMedia({ data: { pin, key: mediaKey, ...(dataUrl ? { dataUrl } : {}) } });
      if (!r.ok) setError(r.error);
      else onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={url ? "Replace photo" : "Add photo"}
        className="press relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-dashed border-foreground/25 bg-card text-foreground/50 hover:border-foreground/60"
      >
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5" strokeWidth={1.25} />}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          </span>
        ) : null}
      </button>
      {url && !busy ? (
        <button type="button" onClick={() => void save()} className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-destructive">
          Remove
        </button>
      ) : null}
      {error ? <span className="text-center text-[0.6rem] text-destructive">{error}</span> : null}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void save(e.target.files?.[0])} />
    </div>
  );
}
