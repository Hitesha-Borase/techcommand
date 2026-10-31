import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext inspects multipart POSTs as progressive actions before routing them
  // to API handlers. Allow our 20 MiB files plus multipart metadata; each upload
  // API still enforces its own file limits, authorization and allowed types.
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
};

export default nextConfig;
