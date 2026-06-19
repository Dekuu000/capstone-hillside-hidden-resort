import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "../components/shared/ServiceWorkerRegister";
import { SyncEngineProvider } from "../components/shared/SyncEngineProvider";
import { ToastProvider } from "../components/shared/ToastProvider";
import { OfflineStatusBanner } from "../components/shared/OfflineStatusBanner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hillside Hidden Resort",
  description: "Smart resort web app with offline-ready guest and admin experiences.",
  applicationName: "Hillside Hidden Resort",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/branding/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/branding/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/branding/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/branding/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
    shortcut: ["/branding/favicon.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#2d4a3e",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>
          <SyncEngineProvider>
            <ServiceWorkerRegister />
            <OfflineStatusBanner />
            {children}
          </SyncEngineProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
