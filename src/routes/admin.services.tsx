import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell, Panel, TinyButton } from "@/components/admin";
import { menuFor, inr, formatDuration, type Audience } from "@/lib/salon";

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

function ServicesAdmin() {
  const [audience, setAudience] = useState<Audience>("women");
  const menu = menuFor(audience);
  const count = menu.reduce((n, c) => n + c.services.length, 0);

  return (
    <AdminShell title="Menu" subtitle={`${count} services`}>
      <div className="flex gap-2">
        {(["women", "men"] as const).map((a) => (
          <TinyButton key={a} active={audience === a} onClick={() => setAudience(a)}>
            {a}
          </TinyButton>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {menu.map((c) => (
          <Panel key={c.id} className="p-0">
            <div className="border-b border-hairline px-5 py-4">
              <div className="eyebrow">{c.title}</div>
              {c.blurb ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.blurb}</p>
              ) : null}
            </div>
            <div className="divide-y divide-hairline px-5">
              {c.services.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <div className="text-sm">{s.name}</div>
                    <div className="mt-1 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                      {formatDuration(s.slots)}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm tabular-nums">
                    {inr(s.price)}
                    {s.from ? " +" : ""}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <p className="mt-6 text-[0.7rem] leading-relaxed text-muted-foreground">
        Pricing follows the printed service menu. Ask to make it editable and it becomes a managed
        list.
      </p>
    </AdminShell>
  );
}
