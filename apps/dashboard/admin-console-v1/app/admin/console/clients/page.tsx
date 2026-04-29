import { PaymentRenewalPreview } from "@/components/admin/payments/payment-renewal-preview";

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
          Figma Make Import
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          Payment Flow Preview
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          Initial port of the renewal flow from the Make file. This is still using
          mocked state, but the layout is now in the repo and ready for real payment
          wiring.
        </p>
      </div>

      <PaymentRenewalPreview />
    </div>
  );
}
