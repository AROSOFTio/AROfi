import ComingSoon from "@/components/coming-soon";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://arofi.net/#organization",
      name: "AROFi",
      legalName: "AROSOFT Innovations Ltd",
      url: "https://arofi.net",
      description:
        "AROFi provides network business software, hotspot billing, marketplace services and networking solutions.",
    },
    {
      "@type": "WebSite",
      "@id": "https://market.arofi.net/#website",
      url: "https://market.arofi.net/",
      name: "AROFi Market",
      publisher: { "@id": "https://arofi.net/#organization" },
      inLanguage: "en-UG",
      description:
        "A multi-vendor marketplace for verified networking equipment and supporting technology, launching first in Uganda.",
    },
    {
      "@type": "WebPage",
      "@id": "https://market.arofi.net/#webpage",
      url: "https://market.arofi.net/",
      name: "AROFi Market — Verified Networking Equipment & Technology",
      isPartOf: { "@id": "https://market.arofi.net/#website" },
      about: { "@id": "https://arofi.net/#organization" },
      description:
        "Shop approved sellers for routers, access points, switches, CCTV, computers, phones, cables, power and complete networking kits with AROFi verification and buyer protection.",
      inLanguage: "en-UG",
    },
    {
      "@type": "ItemList",
      name: "AROFi Market product categories",
      itemListElement: [
        "Routers",
        "Access Points",
        "Switches",
        "CCTV & Security",
        "Computers",
        "Phones & Tablets",
        "Cables & Fibre",
        "Power & Backup",
      ].map((name, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name,
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is AROFi Market?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "AROFi Market is a multi-vendor technology marketplace focused on networking equipment and supporting electronics, with seller approval, buyer protection, verification and optional AROFi configuration.",
          },
        },
        {
          "@type": "Question",
          name: "Where will AROFi Market launch first?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "AROFi Market will launch first in Uganda, with additional countries activated after local payments, seller operations and fulfilment are ready.",
          },
        },
        {
          "@type": "Question",
          name: "Can sellers register on AROFi Market?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sellers may apply to join AROFi Market, but they must be reviewed and approved by AROFi before trading.",
          },
        },
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ComingSoon />
    </>
  );
}
