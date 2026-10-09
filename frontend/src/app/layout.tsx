import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SkillPilot AI", template: "%s · SkillPilot AI" },
  description: "Personal career and learning intelligence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <header className="border-b">
          <nav
            aria-label="Main"
            className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3"
          >
            <Link href="/" className="font-semibold tracking-tight">
              SkillPilot AI
            </Link>
            <Link href="/profiles/new" className="text-sm text-muted-foreground hover:text-foreground">
              New profile
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
