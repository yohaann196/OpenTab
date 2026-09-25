import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpenTab",
    short_name: "OpenTab",
    description: "Live pairings, ballots and results for speech & debate tournaments.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbfd",
    theme_color: "#4f46e5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
