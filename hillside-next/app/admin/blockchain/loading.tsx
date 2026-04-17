import { ContractStatusSkeleton } from "../../../components/admin-blockchain/ContractStatusSkeleton";

export default function AdminBlockchainLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <header className="surface p-4 sm:p-6">
        <div className="skeleton h-5 w-44" />
        <div className="mt-3 skeleton h-8 w-72" />
        <div className="mt-2 skeleton h-4 w-full max-w-xl" />
      </header>
      <div className="skeleton h-14 w-full rounded-2xl" />
      <ContractStatusSkeleton />
    </section>
  );
}

