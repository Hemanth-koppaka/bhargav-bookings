import { createFileRoute } from "@tanstack/react-router";
import { CinematicKit } from "@/components/cinematic-kit";

// Preview of the barber-kit film (not linked from the site yet).
export const Route = createFileRoute("/film")({
  head: () => ({
    meta: [
      { title: "The kit — Hair by Bhargav" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Film,
});

function Film() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-[#0b0806] p-4">
      <CinematicKit className="w-[min(100%,52svh)] rounded-sm" loop />
    </div>
  );
}
