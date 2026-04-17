export default function GuestServicesLoading() {
  return (
    <section className="mx-auto w-full max-w-7xl px-1">
      <div className="surface p-5">
        <div className="skeleton h-6 w-48" />
        <div className="mt-2 skeleton h-4 w-64" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="surface p-4">
          <div className="skeleton h-5 w-32" />
          <div className="mt-3 space-y-2">
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
          </div>
        </div>
        <div className="surface p-4">
          <div className="skeleton h-5 w-40" />
          <div className="mt-3 space-y-2">
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-16 w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
