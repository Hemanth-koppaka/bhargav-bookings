import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, Monitor, Smartphone } from "lucide-react";
import { AdminShell, Panel, TinyButton, inputClass } from "@/components/admin";
import { LoadState, useAdminData } from "@/components/admin-ops";
import { useAdmin } from "@/lib/admin-store";
import {
  adminDiscardSiteDraft,
  adminGetSite,
  adminPublishSite,
  adminSaveSiteDraft,
} from "@/lib/admin-catalogue.functions";
import type { SiteContent } from "@/lib/site-content";
import { BUSINESS } from "@/lib/salon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/content")({
  head: () => ({
    meta: [
      { title: "Site content — Hair by Bhargav" },
      { name: "description", content: "Homepage wording, announcement and booking policies." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContentScreen,
});

function ContentScreen() {
  const { pin } = useAdmin();
  const { data, loading, error, reload } = useAdminData(
    (p) => adminGetSite({ data: { pin: p } }),
    [],
  );
  const [c, setC] = useState<SiteContent | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [publishing, setPublishing] = useState(false);
  const [device, setDevice] = useState<"phone" | "laptop">("phone");
  const first = useRef(true);

  useEffect(() => {
    if (data) {
      setC(data.draft);
      first.current = true;
    }
  }, [data]);

  // drafts save themselves a moment after typing stops
  useEffect(() => {
    if (!c) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved("saving");
    const t = window.setTimeout(() => {
      adminSaveSiteDraft({ data: { pin, content: c } })
        .then((r) => setSaved(r.ok ? "saved" : "idle"))
        .catch(() => setSaved("idle"));
    }, 700);
    return () => window.clearTimeout(t);
  }, [c, pin]);

  const unpublished = Boolean(c && data && JSON.stringify(c) !== JSON.stringify(data.live));

  const publish = async () => {
    if (!c) return;
    setPublishing(true);
    try {
      const r = await adminPublishSite({ data: { pin, content: c } });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Published. Guests see the new wording now.");
      reload();
    } catch {
      toast.error("Couldn't publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (!data) return;
    if (!window.confirm("Discard all unpublished changes?")) return;
    await adminDiscardSiteDraft({ data: { pin } }).catch(() => {});
    reload();
  };

  const set = <S extends keyof SiteContent>(section: S, patch: Partial<SiteContent[S]>) =>
    setC((cur) => (cur ? { ...cur, [section]: { ...cur[section], ...patch } } : cur));

  return (
    <AdminShell
      title="Site content"
      subtitle="Edit, preview, then publish. Guests only see published wording."
      wide
      right={
        <div className="flex items-center gap-2">
          <span className="hidden text-[0.75rem] text-muted-foreground sm:inline">
            {saved === "saving"
              ? "Saving draft…"
              : unpublished
                ? "Draft saved · not published"
                : "Up to date"}
          </span>
          {unpublished ? <TinyButton onClick={() => void discard()}>Discard</TinyButton> : null}
          <TinyButton
            tone="primary"
            disabled={!unpublished || publishing}
            onClick={() => void publish()}
          >
            {publishing ? "Publishing…" : "Publish"}
          </TinyButton>
        </div>
      }
    >
      <LoadState loading={loading && !c} error={error} onRetry={reload} />
      {c && data ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="space-y-4">
            <Panel>
              <h2 className="font-display text-[1.35rem]">Homepage</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Headline" hint={`Default: “${data.defaults.home.headline}”`}>
                  <input
                    className={inputClass}
                    maxLength={40}
                    value={c.home.headline}
                    onChange={(e) => set("home", { headline: e.target.value })}
                  />
                </Field>
                <Field
                  label="Headline, second part (italic)"
                  hint={`Default: “${data.defaults.home.headlineAccent}”`}
                >
                  <input
                    className={inputClass}
                    maxLength={40}
                    value={c.home.headlineAccent}
                    onChange={(e) => set("home", { headlineAccent: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-3 space-y-3">
                <Field label="Introduction — phones" count={[c.home.intro.length, 200]}>
                  <textarea
                    className={cn(inputClass, "resize-none")}
                    rows={2}
                    maxLength={200}
                    value={c.home.intro}
                    onChange={(e) => set("home", { intro: e.target.value })}
                  />
                </Field>
                <Field label="Introduction — laptops" count={[c.home.introLong.length, 320]}>
                  <textarea
                    className={cn(inputClass, "resize-none")}
                    rows={2}
                    maxLength={320}
                    value={c.home.introLong}
                    onChange={(e) => set("home", { introLong: e.target.value })}
                  />
                </Field>
                <Field label="Booking button">
                  <input
                    className={inputClass}
                    maxLength={32}
                    value={c.home.ctaLabel}
                    onChange={(e) => set("home", { ctaLabel: e.target.value })}
                  />
                </Field>
              </div>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-[1.35rem]">Announcement</h2>
                <label className="flex items-center gap-2 text-[0.82rem]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--bronze)]"
                    checked={c.announcement.enabled}
                    onChange={(e) => set("announcement", { enabled: e.target.checked })}
                  />
                  Show on homepage
                </label>
              </div>
              <Field
                label=""
                hint="One short line, e.g. holiday hours or a seasonal note."
                count={[c.announcement.text.length, 200]}
              >
                <input
                  className={cn(inputClass, "mt-2")}
                  maxLength={200}
                  placeholder="Closed 12 November for Diwali — book ahead."
                  value={c.announcement.text}
                  onChange={(e) => set("announcement", { text: e.target.value })}
                />
              </Field>
            </Panel>

            <Panel>
              <h2 className="font-display text-[1.35rem]">Booking policies</h2>
              <p className="mt-1 text-[0.8rem] text-muted-foreground">
                Shown on the review step before guests confirm. “Manage booking” becomes a link.
              </p>
              <div className="mt-3 space-y-3">
                <Field label="Changes and cancellations">
                  <textarea
                    className={cn(inputClass, "resize-none")}
                    rows={2}
                    maxLength={240}
                    value={c.policies.changes}
                    onChange={(e) => set("policies", { changes: e.target.value })}
                  />
                </Field>
                <Field label="Payment">
                  <input
                    className={inputClass}
                    maxLength={160}
                    value={c.policies.payment}
                    onChange={(e) => set("policies", { payment: e.target.value })}
                  />
                </Field>
                <Field label="Late arrivals (optional)">
                  <input
                    className={inputClass}
                    maxLength={240}
                    placeholder="Arriving more than 15 minutes late may shorten your service."
                    value={c.policies.lateness}
                    onChange={(e) => set("policies", { lateness: e.target.value })}
                  />
                </Field>
              </div>
            </Panel>
          </div>

          {/* preview */}
          <div className="xl:sticky xl:top-6 xl:self-start">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
                Preview{unpublished ? " · draft" : ""}
              </div>
              <div className="flex rounded-md border border-foreground/15 p-0.5">
                {(
                  [
                    ["phone", Smartphone],
                    ["laptop", Monitor],
                  ] as const
                ).map(([k, Icon]) => (
                  <button
                    key={k}
                    aria-label={k}
                    onClick={() => setDevice(k)}
                    className={cn(
                      "rounded px-2.5 py-1",
                      device === k ? "bg-foreground text-background" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </div>
            <Preview c={c} device={device} />
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  count,
  children,
}: {
  label: string;
  hint?: string;
  count?: [number, number];
  children: ReactNode;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
      ) : null}
      {children}
      {hint || count ? (
        <span className="mt-1 flex justify-between gap-3 text-[0.72rem] text-muted-foreground">
          <span>{hint}</span>
          {count ? (
            <span className={cn("tabular-nums", count[0] > count[1] * 0.9 && "text-amber-700")}>
              {count[0]}/{count[1]}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

/** A faithful sketch of the homepage text block and the review-step policy note. */
function Preview({ c, device }: { c: SiteContent; device: "phone" | "laptop" }) {
  const phone = device === "phone";
  const headline = c.home.headline.trim();
  const accent = c.home.headlineAccent.trim();
  return (
    <div
      className={cn(
        "mx-auto overflow-hidden rounded-xl border border-hairline bg-background shadow-sm",
        phone ? "max-w-[22rem]" : "",
      )}
    >
      <div className={cn(phone ? "p-5" : "p-8")}>
        <div
          className={cn(
            "text-[0.55rem] uppercase tracking-[0.28em] text-muted-foreground",
            !phone && "text-bronze",
          )}
        >
          {phone ? BUSINESS.locationShort : BUSINESS.tagline}
        </div>
        <div
          className={cn(
            "mt-2 font-display leading-[0.95] tracking-[-0.015em]",
            phone ? "text-[2.4rem]" : "text-[3.4rem]",
          )}
        >
          {headline || "Reserve"}
          {phone ? " " : <br />}
          <span className="italic text-bronze">{accent || "your chair."}</span>
        </div>
        <p
          className={cn(
            "mt-3 leading-relaxed text-muted-foreground",
            phone ? "text-[0.85rem]" : "text-[0.95rem]",
          )}
        >
          {phone ? c.home.intro : c.home.introLong}
        </p>
        {c.announcement.enabled && c.announcement.text.trim() ? (
          <p className="mt-3 border-l-2 border-bronze/60 pl-3 text-[0.8rem] leading-relaxed text-foreground/80">
            {c.announcement.text}
          </p>
        ) : null}
        <div className="mt-4 flex h-12 items-center justify-between rounded-sm bg-foreground px-5 text-[0.72rem] uppercase tracking-[0.18em] text-background">
          {c.home.ctaLabel || "Book an appointment"}
          <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
        </div>
      </div>
      <div className="border-t border-hairline bg-card/60 p-5">
        <div className="text-[0.55rem] uppercase tracking-[0.24em] text-muted-foreground">
          Review step
        </div>
        <p className="mt-2 rounded-md bg-champagne/15 px-3.5 py-3 text-[0.78rem] leading-relaxed">
          {c.policies.changes.split("Manage booking").map((part, i, all) => (
            <span key={i}>
              {part}
              {i < all.length - 1 ? <u className="underline-offset-4">Manage booking</u> : null}
            </span>
          ))}{" "}
          {c.policies.payment}
          {c.policies.lateness ? ` ${c.policies.lateness}` : ""}
        </p>
      </div>
    </div>
  );
}
