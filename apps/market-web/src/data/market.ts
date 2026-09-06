export type ProductVisual =
  | "router"
  | "access-point"
  | "switch"
  | "camera"
  | "computer"
  | "phone"
  | "cable"
  | "power";

export type MarketCategory = {
  name: string;
  slug: string;
  description: string;
  visual: ProductVisual;
};

export type MarketProduct = {
  slug: string;
  name: string;
  brand: string;
  category: string;
  visual: ProductVisual;
  description: string;
  priceUgx: number;
  compareAtUgx?: number;
  rating: number;
  reviewCount: number;
  seller: string;
  sellerVerified: boolean;
  stockLabel: "AROFi Stocked" | "Seller Confirmed" | "Order on Request";
  dispatchLabel: string;
  arofiVerified: boolean;
  arofiReady: boolean;
  featured?: boolean;
  badge?: string;
  highlights: string[];
};

export const categories: MarketCategory[] = [
  {
    name: "Routers",
    slug: "routers",
    description: "MikroTik, TP-Link, Cisco and business routing.",
    visual: "router",
  },
  {
    name: "Access Points",
    slug: "access-points",
    description: "Indoor, outdoor and managed wireless coverage.",
    visual: "access-point",
  },
  {
    name: "Switches",
    slug: "switches",
    description: "PoE, managed, unmanaged and fibre switching.",
    visual: "switch",
  },
  {
    name: "CCTV & Security",
    slug: "cctv",
    description: "IP cameras, NVRs, storage and surveillance kits.",
    visual: "camera",
  },
  {
    name: "Computers",
    slug: "computers",
    description: "Laptops, desktops, monitors and workstations.",
    visual: "computer",
  },
  {
    name: "Phones & Tablets",
    slug: "phones",
    description: "Smartphones and tablets that support your operation.",
    visual: "phone",
  },
  {
    name: "Cables & Fibre",
    slug: "cables",
    description: "Cat6, fibre, SFPs, patching and connectors.",
    visual: "cable",
  },
  {
    name: "Power & Backup",
    slug: "power",
    description: "UPS, PoE injectors, surge protection and backup power.",
    visual: "power",
  },
];

export const products: MarketProduct[] = [
  {
    slug: "mikrotik-rb5009ug-s-in",
    name: "MikroTik RB5009UG+S+IN",
    brand: "MikroTik",
    category: "Routers",
    visual: "router",
    description:
      "High-performance RouterOS gateway for growing hotspot, office and ISP deployments.",
    priceUgx: 890000,
    compareAtUgx: 950000,
    rating: 4.9,
    reviewCount: 38,
    seller: "Kampala Network Hub",
    sellerVerified: true,
    stockLabel: "Seller Confirmed",
    dispatchLabel: "Seller supply within 1 business day",
    arofiVerified: true,
    arofiReady: true,
    featured: true,
    badge: "Best for growing hotspots",
    highlights: [
      "7× Gigabit Ethernet + 2.5G Ethernet",
      "10G SFP+ cage",
      "RouterOS Level 5",
      "Eligible for AROFi pre-configuration",
    ],
  },
  {
    slug: "tp-link-eap610",
    name: "TP-Link Omada EAP610 AX1800",
    brand: "TP-Link",
    category: "Access Points",
    visual: "access-point",
    description:
      "Wi-Fi 6 ceiling access point for offices, schools, hospitality and hotspot coverage.",
    priceUgx: 520000,
    compareAtUgx: 560000,
    rating: 4.8,
    reviewCount: 21,
    seller: "NetPro Uganda",
    sellerVerified: true,
    stockLabel: "AROFi Stocked",
    dispatchLabel: "Ready for verification and dispatch",
    arofiVerified: true,
    arofiReady: false,
    featured: true,
    highlights: [
      "Wi-Fi 6 AX1800",
      "PoE+ powered",
      "Omada SDN compatible",
      "Ceiling or wall mounting",
    ],
  },
  {
    slug: "tp-link-tl-sg2210mp",
    name: "TP-Link TL-SG2210MP PoE+ Switch",
    brand: "TP-Link",
    category: "Switches",
    visual: "switch",
    description:
      "Managed PoE+ switching for access points, cameras and small business networks.",
    priceUgx: 670000,
    rating: 4.7,
    reviewCount: 14,
    seller: "NetPro Uganda",
    sellerVerified: true,
    stockLabel: "Seller Confirmed",
    dispatchLabel: "Seller supply within 2 business days",
    arofiVerified: true,
    arofiReady: false,
    featured: true,
    highlights: [
      "8× Gigabit PoE+ ports",
      "150W PoE budget",
      "2× SFP uplinks",
      "Managed switching and VLAN support",
    ],
  },
  {
    slug: "hikvision-4mp-ip-camera",
    name: "Hikvision 4MP PoE IP Camera",
    brand: "Hikvision",
    category: "CCTV & Security",
    visual: "camera",
    description:
      "4MP network camera with PoE for homes, offices, shops and managed CCTV installations.",
    priceUgx: 285000,
    rating: 4.8,
    reviewCount: 32,
    seller: "SecureVision Technologies",
    sellerVerified: true,
    stockLabel: "Seller Confirmed",
    dispatchLabel: "Seller supply within 1 business day",
    arofiVerified: true,
    arofiReady: false,
    featured: true,
    highlights: [
      "4MP resolution",
      "Power over Ethernet",
      "Night vision",
      "AROFi verification before shipping",
    ],
  },
  {
    slug: "hp-elitebook-840-g9",
    name: "HP EliteBook 840 G9 - Core i5",
    brand: "HP",
    category: "Computers",
    visual: "computer",
    description:
      "Business laptop suitable for network administration, field support and office productivity.",
    priceUgx: 2250000,
    rating: 4.6,
    reviewCount: 9,
    seller: "TechDesk Kampala",
    sellerVerified: true,
    stockLabel: "Order on Request",
    dispatchLabel: "Supply required within 3 business days",
    arofiVerified: true,
    arofiReady: false,
    highlights: [
      "12th Gen Intel Core i5",
      "16GB RAM",
      "512GB NVMe SSD",
      "Condition verified before shipping",
    ],
  },
  {
    slug: "samsung-galaxy-a55-5g",
    name: "Samsung Galaxy A55 5G",
    brand: "Samsung",
    category: "Phones & Tablets",
    visual: "phone",
    description:
      "5G Android phone for field operations, hotspot management and mobile business workflows.",
    priceUgx: 1450000,
    rating: 4.7,
    reviewCount: 18,
    seller: "MobileWorks Uganda",
    sellerVerified: true,
    stockLabel: "Seller Confirmed",
    dispatchLabel: "Seller supply within 1 business day",
    arofiVerified: true,
    arofiReady: false,
    highlights: [
      "5G connectivity",
      "128GB storage",
      "Device condition and IMEI checked",
      "Buyer-protected transaction",
    ],
  },
  {
    slug: "cat6-utp-305m-box",
    name: "Cat6 UTP Cable - 305m Box",
    brand: "LinkBasic",
    category: "Cables & Fibre",
    visual: "cable",
    description:
      "Full-box Cat6 cable for structured cabling, hotspot rollouts and CCTV installations.",
    priceUgx: 480000,
    rating: 4.8,
    reviewCount: 44,
    seller: "Kampala Network Hub",
    sellerVerified: true,
    stockLabel: "AROFi Stocked",
    dispatchLabel: "Ready for verification and dispatch",
    arofiVerified: true,
    arofiReady: false,
    highlights: [
      "305 metre box",
      "Cat6 UTP",
      "Suitable for data and PoE runs",
      "Length and packaging checked",
    ],
  },
  {
    slug: "apc-easy-ups-1200va",
    name: "APC Easy UPS 1200VA",
    brand: "APC",
    category: "Power & Backup",
    visual: "power",
    description:
      "Backup power for routers, switches, access points and small network racks.",
    priceUgx: 620000,
    rating: 4.7,
    reviewCount: 16,
    seller: "PowerNet Systems",
    sellerVerified: true,
    stockLabel: "Seller Confirmed",
    dispatchLabel: "Seller supply within 2 business days",
    arofiVerified: true,
    arofiReady: false,
    highlights: [
      "1200VA capacity",
      "Automatic voltage regulation",
      "Network-equipment friendly",
      "Power-on test before shipping",
    ],
  },
];

export const formatUgx = (amount: number) =>
  new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(amount);
