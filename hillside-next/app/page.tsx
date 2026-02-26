import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthContext } from "../lib/serverAuth";

export default async function HomePage() {
  const accessToken = await getServerAccessToken();
  if (accessToken) {
    const auth = await getServerAuthContext(accessToken);
    if (auth?.role === "admin") {
      redirect("/admin/reservations");
    }
    if (auth) {
      redirect("/my-bookings");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eff6ff] px-4 py-8">
      <section className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-[#1e3a8a]">Hillside Hidden Resort</h1>
        <p className="mt-2 text-sm text-slate-600">V2 app shell. Sign in to continue.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-95"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Create Account
          </Link>
        </div>
      </section>
    </main>
  );
}
