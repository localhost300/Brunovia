import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Brunovia — Built for better business",
    short_name: "Brunovia",
    description: "Built for better business",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f7f8f7",
    theme_color: "#12845b",
    categories: ["business", "productivity"],
    icons: [
      { src: "/brunovia-logo.png", sizes: "1536x1536", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      {
        name: "Attendance",
        short_name: "Attendance",
        url: "/attendance",
        icons: [{ src: "/brunovia-logo.png", sizes: "1536x1536", type: "image/png" }],
      },
      {
        name: "My leave",
        short_name: "Leave",
        url: "/leave-management",
        icons: [{ src: "/brunovia-logo.png", sizes: "1536x1536", type: "image/png" }],
      },
      {
        name: "Finance",
        short_name: "Finance",
        url: "/finance",
        icons: [{ src: "/brunovia-logo.png", sizes: "1536x1536", type: "image/png" }],
      },
      {
        name: "Financial reports",
        short_name: "Reports",
        url: "/finance?tab=reports",
        icons: [{ src: "/brunovia-logo.png", sizes: "1536x1536", type: "image/png" }],
      },
    ],
  };
}
