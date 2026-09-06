import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://market.arofi.net"),
  title: {
    default: "AROFi Market — Networking & Technology Marketplace Uganda",
    template: "%s | AROFi Market",
  },
  description:
    "AROFi Market is a coming multi-vendor marketplace for routers, access points, switches, CCTV, computers, phones, cables, power and networking equipment from approved sellers. Join the Uganda launch waitlist.",
  keywords: [
    "networking equipment Uganda",
    "MikroTik Uganda",
    "routers Uganda",
    "access points Uganda",
    "network switches Uganda",
    "CCTV Uganda",
    "network cables Uganda",
    "AROFi Market",
    "WiFi hotspot equipment Uganda",
    "network marketplace Uganda",
  ],
  applicationName: "AROFi Market",
  authors: [{ name: "AROSOFT Innovations Ltd", url: "https://arofi.net" }],
  creator: "AROSOFT Innovations Ltd",
  publisher: "AROSOFT Innovations Ltd",
  alternates: { canonical: "https://market.arofi.net/" },
  openGraph: {
    type: "website",
    url: "https://market.arofi.net/",
    siteName: "AROFi Market",
    title: "AROFi Market — Networking & Technology Marketplace",
    description:
      "Networking equipment and supporting technology from approved sellers. Uganda launch coming soon — join the waitlist.",
    locale: "en_UG",
  },
  twitter: {
    card: "summary_large_image",
    title: "AROFi Market — Coming Soon",
    description: "Uganda’s AROFi marketplace for networking equipment and supporting technology. Join the launch waitlist.",
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
  themeColor: "#22A53A",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-UG">
      <body>{children}</body>
    </html>
  );
}
