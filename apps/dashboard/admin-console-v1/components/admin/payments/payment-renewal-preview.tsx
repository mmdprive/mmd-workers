const plans = [
  {
    name: "Monthly Premium",
    price: "฿2,500",
    period: "per month",
    features: ["Full platform access", "Priority matching", "24/7 concierge support"],
    active: true,
  },
  {
    name: "Annual Premium",
    price: "฿24,000",
    period: "per year",
    features: ["20% savings vs monthly", "Priority support queue", "Exclusive annual events"],
    recommended: true,
  },
];

const paymentMethods = [
  { title: "Bank Transfer", detail: "KTB Bank • instant manual verification", active: true },
  { title: "PromptPay QR", detail: "scan through banking app" },
  { title: "Credit Card", detail: "3% processing fee" },
];

export function PaymentRenewalPreview() {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-amber-300/10 via-black/20 to-black/35 p-6">
          <div className="text-xs uppercase tracking-[0.26em] text-amber-100/70">
            MMD SĪGIL Membership
          </div>
          <h2 className="mt-3 text-3xl font-semibold text-white">Continue your exclusive access</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            This section is ported from the Make payment flow and prepared to become the
            real renewal module once payment actions are wired.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-white">Plan Selection</h3>
            <div className="rounded-full border border-amber-300/15 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
              Make import
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-[24px] border p-5 ${
                  plan.active
                    ? "border-amber-300/30 bg-amber-300/5"
                    : "border-white/10 bg-black/20"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-medium text-white">{plan.name}</h4>
                      {plan.recommended ? (
                        <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[11px] font-medium text-black">
                          Recommended
                        </span>
                      ) : null}
                      {plan.active ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-white/55">{plan.period}</div>
                  </div>
                  <div className="text-right text-2xl font-semibold text-amber-200">
                    {plan.price}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {plan.features.map((feature) => (
                    <span
                      key={feature}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <h3 className="text-xl font-semibold text-white">Payment Method</h3>
          <div className="mt-5 space-y-3">
            {paymentMethods.map((method) => (
              <div
                key={method.title}
                className={`rounded-2xl border p-4 ${
                  method.active
                    ? "border-amber-300/30 bg-amber-300/5"
                    : "border-white/10 bg-black/20"
                }`}
              >
                <div className="text-base font-medium text-white">{method.title}</div>
                <div className="mt-1 text-sm text-white/55">{method.detail}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/55">Bank</span>
              <span className="text-white">KTB Bank</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-white/55">Account Name</span>
              <span className="text-white">ธัชชะ ป.</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-white/55">Account Number</span>
              <span className="font-mono text-amber-200">1420335898</span>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <h3 className="text-xl font-semibold text-white">Order Summary</h3>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/55">Current Plan</span>
              <span className="text-white">Monthly Premium</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/55">Renewal Date</span>
              <span className="text-white">May 12, 2026</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/55">New Plan</span>
              <span className="text-white">Annual Premium</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-emerald-300">Savings</span>
              <span className="text-emerald-300">-฿6,000</span>
            </div>
          </div>

          <div className="my-5 border-t border-white/10" />

          <div className="flex items-center justify-between">
            <span className="text-base font-medium text-white">Total Due</span>
            <span className="text-2xl font-semibold text-amber-200">฿24,000</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-medium text-black transition hover:bg-amber-200">
              Confirm Payment
            </button>
            <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
