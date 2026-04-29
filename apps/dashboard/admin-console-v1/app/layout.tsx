import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MMD Privé Admin Console",
  description: "Operational dashboard scaffold inspired by the Figma Make system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
