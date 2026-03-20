export function ActionBar({ dealId }: { dealId: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 text-lg font-semibold">Actions</div>
      <div className="grid gap-3">
        <button className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-semibold text-black">
          Approve AI
        </button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          Override Model
        </button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          Ask More
        </button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          Send Payment
        </button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          Hold
        </button>
        <button className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Close Deal
        </button>
      </div>
      <div className="mt-4 text-xs text-white/35">Deal: {dealId}</div>
    </div>
  );
}
