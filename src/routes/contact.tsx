import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { BookCTA, InfoPage, InfoTitle } from "@/components/info-page";
import { openDaysLabel, prettyPhone } from "@/components/desktop";
import { CLOSE_MINUTE, OPEN_MINUTE, minuteLabel } from "@/lib/salon";
import menImg from "@/assets/men.jpg.asset.json";
import { BUSINESS } from "@/lib/salon";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Hair by Bhargav" },
      {
        name: "description",
        content:
          "Call or WhatsApp Hair by Bhargav at KPHB Phase 9, Kukatpally, Hyderabad, or book online in under a minute.",
      },
      { property: "og:title", content: "Contact — Hair by Bhargav" },
      { property: "og:description", content: "Call, WhatsApp or find us in KPHB Phase 9." },
    ],
  }),
  component: ContactScreen,
});

function ContactScreen() {
  const wa = `https://wa.me/${(BUSINESS.phones[0] ?? "").replace(/\D/g, "")}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`;
  const cards = [
    ...BUSINESS.phones.map((p, i) => ({
      icon: Phone,
      label: i === 0 ? "Call the studio" : "Alternate number",
      value: prettyPhone(p),
      href: `tel:${p}`,
      external: false,
    })),
    { icon: MessageCircle, label: "WhatsApp", value: "Message us", href: wa, external: true },
    { icon: MapPin, label: "Visit", value: BUSINESS.address, href: maps, external: true },
    {
      icon: Clock,
      label: "Hours",
      value: `${openDaysLabel()} · ${minuteLabel(OPEN_MINUTE)} – ${minuteLabel(CLOSE_MINUTE)} · Closed ${BUSINESS.closedDay}`,
      href: "/hours",
      external: false,
    },
  ];

  return (
    <InfoPage
      label="Contact"
      image={menImg.url}
      imagePos="60% 30%"
      panelEyebrow="We'd love to see you"
      panelTitle={
        <>
          Say
          <br />
          <span className="italic text-champagne">hello.</span>
        </>
      }
      panelSub={BUSINESS.locationShort}
    >
      <InfoTitle eyebrow="Contact" sub="Call, message or drop by — or book online in under a minute.">
        Say <span className="italic text-bronze">hello.</span>
      </InfoTitle>

      <ul className="stagger mt-9 space-y-2.5">
        {cards.map(({ icon: Icon, label, value, href, external }) => (
          <li key={label}>
            <a
              href={href}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="press group flex items-center gap-4 rounded-md border border-hairline bg-card p-4 hover:border-foreground/30 lg:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-champagne/18 text-bronze transition-colors duration-300 group-hover:bg-bronze group-hover:text-ivory">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.25} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.62rem] uppercase tracking-[0.26em] text-muted-foreground">{label}</span>
                <span className="mt-1 block text-[0.98rem] leading-snug">{value}</span>
              </span>
              <ArrowUpRight
                className="h-4 w-4 shrink-0 text-foreground/40 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.25}
              />
            </a>
          </li>
        ))}
      </ul>

      <BookCTA className="mt-10" />
    </InfoPage>
  );
}
