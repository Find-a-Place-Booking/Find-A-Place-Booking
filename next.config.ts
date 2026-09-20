import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Host images are accepted up to 3 MB in the action itself. The
      // multipart request needs a little headroom beyond the file bytes.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // Do not globally disable camera access. Stripe Identity's document
          // + selfie flow needs to be able to request camera permission from
          // the guest. Microphone/geolocation remain disabled platform-wide.
          { key: "Permissions-Policy", value: "microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
