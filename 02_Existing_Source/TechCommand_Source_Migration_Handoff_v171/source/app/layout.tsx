import "@/lib/weakref-shim";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PLATFORM_BRAND } from "@/lib/platform-brand";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", themeColor: "#071827" };

export const metadata: Metadata = {
  title: `${PLATFORM_BRAND.name} ${PLATFORM_BRAND.suffix} | ${PLATFORM_BRAND.publisher}`,
  description:
    "Field service, biomedical asset management, dispatch, estimating, compliance, and technician operations by TechFlex Mobility Solutions.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TechCommand OS", statusBarStyle: "black-translucent" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body className="antialiased"><Providers>{children}</Providers></body>
    </html>
  );
}
