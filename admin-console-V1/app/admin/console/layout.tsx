import { ConsoleShell } from "@/components/admin/console-shell";

export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
