import { ReactNode } from "react";
import { Sidebar } from "./sidebar";

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-mmd-bg text-white">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[260px_1fr]">
        <Sidebar />
        <main className="bg-[#090909]">{children}</main>
      </div>
    </div>
  );
}
