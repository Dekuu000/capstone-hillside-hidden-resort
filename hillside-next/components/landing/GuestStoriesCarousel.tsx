"use client";

import { useEffect, useMemo, useState } from "react";

const STORIES = [
  {
    quote: "The easiest check-in ever! Just scanned the QR code and we were in. The view and service were perfect.",
    name: "Maria Santos",
    location: "Manila, Philippines",
    avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=160&q=80",
  },
  {
    quote: "Booking was quick, payment status was clear, and our room was ready on arrival. Super smooth stay.",
    name: "Carlo Mendoza",
    location: "Quezon City, Philippines",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80",
  },
  {
    quote: "Loved the calm resort vibe and the modern app flow. It felt premium but still very easy to use.",
    name: "Alyssa Tan",
    location: "Makati, Philippines",
    avatar: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=160&q=80",
  },
];

export function GuestStoriesCarousel() {
  const [active, setActive] = useState(0);
  const story = useMemo(() => STORIES[active], [active]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % STORIES.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <article className="h-full bg-[#06213f] p-8 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Guest stories</p>
      <h2 className="mt-2 text-4xl font-semibold">Loved by Travelers</h2>
      <p className="mt-5 text-lg leading-relaxed text-white/90">&ldquo;{story.quote}&rdquo;</p>

      <div className="mt-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={story.avatar} alt={story.name} className="h-12 w-12 rounded-full border border-white/25 object-cover" loading="lazy" />
        <div>
          <p className="text-sm font-semibold">{story.name}</p>
          <p className="text-xs text-white/70">{story.location}</p>
        </div>
      </div>

      <p className="mt-3 text-yellow-300">*****</p>

      <div className="mt-5 flex items-center gap-2">
        {STORIES.map((item, index) => (
          <button
            key={item.name}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`Show story ${index + 1}`}
            className={`h-2.5 w-2.5 rounded-full transition ${index === active ? "bg-teal-300" : "bg-white/35 hover:bg-white/60"}`}
          />
        ))}
      </div>
    </article>
  );
}
