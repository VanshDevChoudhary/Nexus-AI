import type { Metadata } from "next";
import Link from "next/link";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus AI",
  description: "Multi-agent AI orchestration framework",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-gray-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} themes={["light", "dark"]} disableTransitionOnChange storageKey="nexus-theme">
          <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-3 flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="6" className="fill-blue-600" />
                <path d="M8 10h4v4H8zM16 10h4v4h-4zM12 16h4v4h-4z" fill="white" fillOpacity="0.9" />
              </svg>
              Nexus AI
            </Link>
            <div className="hidden sm:flex items-center gap-1 ml-2">
              <Link
                href="/"
                className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 px-3 py-1.5 rounded-md transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/"
                className="text-sm text-blue-600 dark:text-blue-400 font-medium px-3 py-1.5 rounded-md"
              >
                Workflows
              </Link>
            </div>
            <div className="flex-1" />
            <ThemeToggle />
            <Link
              href="/workflows/new"
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + New Workflow
            </Link>
          </nav>
          <main>{children}</main>
          <footer className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 mt-auto">
            <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-600">
              <span>&copy; 2024 Nexus AI Corporation. All rights reserved.</span>
              <div className="flex items-center gap-4">
                <span className="hover:text-zinc-600 dark:hover:text-zinc-400 cursor-pointer transition-colors">Documentation</span>
                <span className="hover:text-zinc-600 dark:hover:text-zinc-400 cursor-pointer transition-colors">Privacy Policy</span>
                <span className="hover:text-zinc-600 dark:hover:text-zinc-400 cursor-pointer transition-colors">API Status</span>
              </div>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
