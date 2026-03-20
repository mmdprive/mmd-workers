import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MMD Admin Console",
  description: "Deal Control Panel skeleton for MMD Privé",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
