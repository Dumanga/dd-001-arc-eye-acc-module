export default function AccountingAdminLoading() {
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-[#ddd8d1] bg-white p-5">
        <div className="animate-accounting-shimmer h-8 w-48 rounded-xl" />
        <div className="mt-3 animate-accounting-shimmer h-4 w-72 max-w-full rounded-lg" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-[#ddd8d1] bg-white p-5"
          >
            <div className="animate-accounting-shimmer h-12 w-12 rounded-2xl" />
            <div className="mt-5 animate-accounting-shimmer h-4 w-24 rounded-lg" />
            <div className="mt-3 animate-accounting-shimmer h-9 w-32 rounded-xl" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.75fr_0.85fr]">
        <div className="rounded-2xl border border-[#ddd8d1] bg-white p-5">
          <div className="animate-accounting-shimmer h-5 w-40 rounded-lg" />
          <div className="mt-3 animate-accounting-shimmer h-[280px] rounded-xl sm:h-[360px]" />
        </div>
        <div className="rounded-2xl border border-[#ddd8d1] bg-white p-5">
          <div className="animate-accounting-shimmer h-5 w-40 rounded-lg" />
          <div className="mt-3 animate-accounting-shimmer h-[280px] rounded-xl sm:h-[360px]" />
        </div>
      </div>
    </div>
  );
}
