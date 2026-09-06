import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AROFi Market",
    short_name: "AROFi Market",
    description: "Verified networking equipment and technology marketplace by AROFi.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#0B1220",
    categories: ["shopping", "business", "technology"],
  };
}
