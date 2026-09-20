import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quorum — University Voting Platform",
  description: "A complete interactive prototype for private, auditable university elections.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className="antialiased">{children}</body></html>;
}
