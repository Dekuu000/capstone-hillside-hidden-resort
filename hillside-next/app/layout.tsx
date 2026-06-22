import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "../components/shared/ServiceWorkerRegister";
import { SyncEngineProvider } from "../components/shared/SyncEngineProvider";
import { ToastProvider } from "../components/shared/ToastProvider";
import { OfflineStatusBanner } from "../components/shared/OfflineStatusBanner";
import { GuestHeaderGate } from "../components/layout/GuestHeaderGate";
import { getServerAccessToken, getServerAuthContext } from "../lib/serverAuth";
import { isBackOffice } from "../../packages/shared/src/types";

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
  themeColor: "#13304c",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolve auth once so the persistent guest header renders with the correct
  // signed-in state from first paint (no flash). Cached + null-safe.
  const token = await getServerAccessToken();
  const auth = token ? await getServerAuthContext(token) : null;

  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>
          <SyncEngineProvider>
            <ServiceWorkerRegister />
            <OfflineStatusBanner />
            <GuestHeaderGate
              initialAuthed={Boolean(auth)}
              initialIsAdmin={isBackOffice(auth?.role)}
              initialName={auth?.email ?? null}
            >
              {children}
            </GuestHeaderGate>
          </SyncEngineProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
