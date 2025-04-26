import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "nexus-ai",
  description: "Multi-agent AI orchestration framework",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <nav className="border-b border-zinc-800 px-6 py-3 flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            nexus-ai
          </Link>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
