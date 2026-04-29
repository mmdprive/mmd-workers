import Link from "next/link";

const items = [
  { href: "/admin/console/dashboard", label: "Dashboard" },
  { href: "/admin/console/deals", label: "Deals" },
  { href: "/admin/console/models", label: "Models" },
  { href: "/admin/console/clients", label: "Clients" },
  { href: "/admin/console/payments", label: "Payments" },
];

export function Sidebar() {
  return (
    <aside className="border-r border-white/10 bg-black/40 p-5">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.25em] text-amber-300/80">
          MMD Privé
        </div>
        <div className="mt-2 text-2xl font-semibold">Admin Console</div>
      </div>

      <nav className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-2xl px-4 py-3 text-sm text-white/70 hover:bg-white/5"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">System</div>
        <div className="mt-3 text-3xl font-semibold">Live</div>
        <div className="mt-1 text-sm text-white/60">Deal Control Panel</div>
      </div>
    </aside>
  );
}
