import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "21mb" },
  },
  turbopack: {
    resolveAlias: {
      "cloudflare:workers": "./lib/cloudflare-workers-shim.ts",
    },
  },
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^cloudflare:workers$/,
        path.resolve(process.cwd(), "lib/cloudflare-workers-shim.ts")
      )
    );
    return config;
  },
};

export default nextConfig;
