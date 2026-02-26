import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hillside Hidden Resort - V2 Shell",
  description: "Next.js shell for phased re-architecture",
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
