import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://market.arofi.net"),
  title: {
    default: "AROFi Market — Verified Networking Equipment & Technology",
    template: "%s | AROFi Market",
  },
  description:
    "AROFi Market is a trusted multi-vendor marketplace for verified networking equipment, routers, access points, switches, CCTV, computers, phones, cables, power and complete network kits. Launching first in Uganda.",
  keywords: [
    "networking equipment Uganda",
    "MikroTik Uganda",
    "routers Uganda",
    "access points Uganda",
    "network switches Uganda",
    "CCTV Uganda",
    "network cables Uganda",
    "AROFi Market",
    "WiFi hotspot equipment",
    "network kit Uganda",
    "verified electronics marketplace Uganda",
  ],
  applicationName: "AROFi Market",
  authors: [{ name: "AROSOFT Innovations Ltd", url: "https://arofi.net" }],
  creator: "AROSOFT Innovations Ltd",
  publisher: "AROSOFT Innovations Ltd",
  alternates: {
    canonical: "https://market.arofi.net/",
  },
  openGraph: {
    type: "website",
    url: "https://market.arofi.net/",
    siteName: "AROFi Market",
    title: "AROFi Market — Build Your Network With Confidence",
    description:
      "Shop verified networking devices and supporting technology from approved sellers, with AROFi verification, buyer protection and optional pre-configuration.",
    locale: "en_UG",
  },
  twitter: {
    card: "summary_large_image",
    title: "AROFi Market — Verified Networking Equipment",
    description:
      "Approved sellers. Verified equipment. Buyer protection. AROFi-ready networking kits. Coming first to Uganda.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology marketplace",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1220",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-UG">
      <body>{children}</body>
    </html>
  );
}
