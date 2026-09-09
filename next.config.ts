import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Host avatars are accepted up to 5 MB in the action itself. The
      // multipart request needs a little headroom beyond the file bytes.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
