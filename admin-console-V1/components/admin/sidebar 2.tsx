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
    <aside className="border-r border-white/10 bg-black p-5 text-[#fff8ec]">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.25em] text-[#f2c879]">
          MMD Privé
        </div>
        <div className="mt-2 text-2xl font-semibold text-[#fff8ec]">Admin Console</div>
      </div>

      <nav className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-2xl px-4 py-3 text-sm text-[#d8cabf] hover:bg-white/10 hover:text-[#fff8ec]"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 rounded-3xl border border-[#f2c879]/25 bg-black p-4 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#f2c879]">SIGIL Monitor</div>
        <div className="mt-3 text-3xl font-semibold text-[#fff8ec]">Live</div>
        <div className="mt-1 text-sm text-[#d8cabf]">Deal Control Panel</div>
        <div className="mt-4 grid gap-2 text-xs">
          <div className="flex items-center justify-between rounded-full bg-[#4ade80]/10 px-3 py-2 text-[#7df0a6]">
            <span>Live</span>
            <span>Online</span>
          </div>
          <div className="flex items-center justify-between rounded-full bg-[#ffd166]/10 px-3 py-2 text-[#ffd166]">
            <span>Warning</span>
            <span>Watch</span>
          </div>
          <div className="flex items-center justify-between rounded-full bg-[#ff6b6b]/10 px-3 py-2 text-[#ff8a8a]">
            <span>Error</span>
            <span>Alert</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
