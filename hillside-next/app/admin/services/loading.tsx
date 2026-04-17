export default function AdminServicesLoading() {
  return (
    <section className="mx-auto w-full max-w-[1400px] space-y-4">
      <div className="surface p-5">
        <div className="skeleton h-7 w-56" />
        <div className="mt-2 skeleton h-4 w-72" />
      </div>
      <div className="surface p-4">
        <div className="skeleton h-11 w-full" />
      </div>
      <div className="surface p-4">
        <div className="skeleton h-14 w-full" />
        <div className="mt-2 skeleton h-14 w-full" />
        <div className="mt-2 skeleton h-14 w-full" />
      </div>
    </section>
  );
}
