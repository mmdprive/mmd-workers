import type { DashboardSummary } from "@/lib/types";

const revenueSeries = [
  { label: "Jan", value: 42 },
  { label: "Feb", value: 51 },
  { label: "Mar", value: 47 },
  { label: "Apr", value: 61 },
  { label: "May", value: 58 },
  { label: "Jun", value: 72 },
];

const liveSessions = [
  { model: "Alessandra", client: "BL-8832", location: "Dubai", time: "2h 15m", amount: "$3,200" },
  { model: "Michaela", client: "BL-7721", location: "London", time: "1h 05m", amount: "$2,400" },
  { model: "Katarina", client: "BL-6610", location: "Miami", time: "3h 40m", amount: "$4,100" },
];

const alerts = [
  {
    title: "Upcoming session confirmation gap",
    body: "Model has not confirmed within the final 12-hour window.",
    detail: "Sarah • BL-8832 • Tomorrow 8:00 PM",
  },
  {
    title: "Payment pending",
    body: "Client payment is still awaiting verification.",
    detail: "BL-5432 • 12 minutes ago",
  },
  {
    title: "Missed check-in",
    body: "Session requires immediate operator follow-up.",
    detail: "Sophia • 5 minutes ago",
  },
];

export function OperationalSnapshot({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <SnapshotCard label="Total Revenue" value="$67,200" accent="gold" />
          <SnapshotCard label="Open Deals" value={summary.open_deals} accent="default" />
          <SnapshotCard label="Live Sessions" value="3" accent="default" />
          <SnapshotCard label="Alerts" value="2" accent="red" />
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Revenue Trend</h2>
              <p className="mt-1 text-sm text-white/55">
                First-pass import of the Make dashboard language without extra chart libraries.
              </p>
            </div>
            <div className="rounded-full border border-amber-300/15 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
              +12% vs last month
            </div>
          </div>

          <div className="mt-6 grid grid-cols-6 gap-3">
            {revenueSeries.map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-3">
                <div className="flex h-44 items-end">
                  <div
                    className="w-10 rounded-t-2xl bg-gradient-to-t from-amber-500 to-amber-200 shadow-[0_0_20px_rgba(214,171,92,0.2)]"
                    style={{ height: `${item.value}%` }}
                  />
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Live Sessions</h2>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              3 Active
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {liveSessions.map((session) => (
              <div
                key={`${session.model}-${session.client}`}
                className="rounded-2xl border border-white/8 bg-black/25 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-medium text-white">{session.model}</div>
                    <div className="mt-1 text-sm text-white/55">
                      {session.client} • {session.location}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-amber-200">{session.amount}</div>
                    <div className="mt-1 text-xs text-white/45">{session.time}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold text-white">Recent Alerts</h2>
          <div className="mt-5 space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.title}
                className="rounded-2xl border border-amber-500/10 bg-amber-500/5 p-4"
              >
                <div className="text-sm font-medium text-white">{alert.title}</div>
                <div className="mt-2 text-sm leading-6 text-white/60">{alert.body}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-amber-200/70">
                  {alert.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SnapshotCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: "default" | "gold" | "red";
}) {
  const accentClass =
    accent === "gold"
      ? "text-amber-200"
      : accent === "red"
        ? "text-rose-200"
        : "text-white";

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">{label}</div>
      <div className={`mt-3 text-3xl font-semibold ${accentClass}`}>{value}</div>
    </div>
  );
}
