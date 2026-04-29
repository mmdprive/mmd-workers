import Link from "next/link";

const items = [
  { href: "/admin/console/dashboard", label: "Overview" },
  { href: "/admin/console/deals", label: "Deals" },
  { href: "/admin/console/models", label: "Models" },
  { href: "/admin/console/clients", label: "Clients" },
  { href: "/admin/console/payments", label: "Payments" },
];

export function Sidebar() {
  return (
    <aside className="border-r border-white/10 bg-black/35 p-5 backdrop-blur-xl">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-[0.28em] text-amber-300/80">
          MMD Privé
        </div>
        <div className="mt-3 text-2xl font-semibold text-white">Admin Console</div>
        <div className="mt-2 text-sm leading-6 text-white/60">
          Skeleton upgraded with the first Figma Make imports.
        </div>
      </div>

      <nav className="mt-6 space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-2xl border border-transparent px-4 py-3 text-sm text-white/70 transition hover:border-amber-300/10 hover:bg-white/5 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-amber-300/10 to-white/5 p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-white/45">System</div>
        <div className="mt-3 text-3xl font-semibold text-amber-200">Live</div>
        <div className="mt-1 text-sm text-white/60">Operational Design Layer</div>
      </div>
    </aside>
  );
}
