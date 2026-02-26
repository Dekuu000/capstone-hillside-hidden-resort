import { GuestChrome } from "../../components/layout/GuestChrome";

export default function GuestShellPage() {
  return (
    <GuestChrome>
      <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Guest Portal (V2)</h1>
        <p className="mt-2 text-sm text-slate-600">
          Guest-side routes are being migrated to Next.js. Use My Bookings to test live V2 data flows.
        </p>
      </section>
    </GuestChrome>
  );
}
