import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "../components/shared/ServiceWorkerRegister";
import { SyncEngineProvider } from "../components/shared/SyncEngineProvider";
import { ToastProvider } from "../components/shared/ToastProvider";
import { OfflineStatusBanner } from "../components/shared/OfflineStatusBanner";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hillside Hidden Resort - V2 Shell",
  description: "Next.js shell for phased re-architecture",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={poppins.className}>
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
