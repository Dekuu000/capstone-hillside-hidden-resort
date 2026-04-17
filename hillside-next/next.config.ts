import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import path from "path";

function safeOrigin(value: string | undefined) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

const apiOrigin = safeOrigin(process.env.NEXT_PUBLIC_API_BASE_URL);
const supabaseOrigin = safeOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseUrl = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
      : null;
  } catch {
    return null;
  }
})();
const isDev = process.env.NODE_ENV !== "production";
const devLocalApiOrigins = isDev
  ? [
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]
  : [];

const connectSrc = [
  "'self'",
  apiOrigin,
  supabaseOrigin,
  ...devLocalApiOrigins,
  "https://*.supabase.co",
  "wss://*.supabase.co",
  isDev ? "ws:" : "",
  isDev ? "wss:" : "",
]
  .filter(Boolean)
  .join(" ");

const scriptSrc = ["'self'", "'unsafe-inline'", isDev ? "'unsafe-eval'" : ""]
  .filter(Boolean)
  .join(" ");

const imageRemotePatterns: RemotePattern[] = [
  ...(supabaseUrl
    ? [
        {
          protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
          hostname: supabaseUrl.hostname,
          pathname: "/**",
        },
      ]
    : []),
  ...(isDev
    ? [
        {
          protocol: "http" as const,
          hostname: "127.0.0.1",
          pathname: "/**",
        },
        {
          protocol: "http" as const,
          hostname: "localhost",
          pathname: "/**",
        },
      ]
    : []),
];

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https: ${supabaseOrigin} ${isDev ? "http://127.0.0.1:55321 http://localhost:55321" : ""}`,
      `connect-src ${connectSrc}`,
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      isDev ? "" : "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  images: {
    remotePatterns: imageRemotePatterns,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
