import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Pastikan folder content/ (pengetahuan, projek, resume induk) ikut sekali ke server
  outputFileTracingIncludes: {
    "/api/**/*": ["./content/**/*"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
