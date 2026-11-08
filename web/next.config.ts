import type { NextConfig } from "next";

// Server-only: where the Pawtella API lives. The browser never calls it directly
// (see src/app/api/[...path]/route.ts, the BFF proxy).
const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Authenticated pages are dynamic; keep the simpler rendering model for now.
  cacheComponents: false,
  devIndicators: { position: "bottom-right" },
  turbopack: {
    // Two lockfiles exist (repo root + web/); pin the root so Turbopack doesn't guess.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placedog.net" },
      { protocol: "https", hostname: "loremflickr.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "cdn.shopify.com" },
    ],
  },
  async rewrites() {
    // The API server-renders these landing pages; expose them on the web domain.
    return [
      { source: "/p/:id", destination: `${API_URL}/p/:id` },
      { source: "/r/:code", destination: `${API_URL}/r/:code` },
      { source: "/partners", destination: `${API_URL}/partners` },
      { source: "/mock-checkout/:cartId", destination: `${API_URL}/mock-checkout/:cartId` },
    ];
  },
};

export default nextConfig;
