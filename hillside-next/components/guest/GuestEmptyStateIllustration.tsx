"use client";

import Image from "next/image";

export function GuestEmptyStateIllustration({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Image
        src="/branding/no-bookings-loader-clean.png"
        alt=""
        aria-hidden
        width={280}
        height={160}
        className="h-auto w-[280px] max-w-full object-contain"
      />
    </div>
  );
}
