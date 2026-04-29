import { Sidebar } from "@/components/admin/sidebar";

export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-transparent text-[#f5f1e8]">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 xl:grid-cols-[280px_1fr]">
        <Sidebar />
        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
