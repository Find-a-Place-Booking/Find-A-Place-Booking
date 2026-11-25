import type { NextConfig } from "next";
import { createHash, randomUUID } from "node:crypto";

// A public, opaque identifier baked into both client and server bundles.
// A new Vercel deployment gets a new identifier, even for a redeployed commit.
const deploymentIdentity = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL;
const webAppRelease = process.env.NODE_ENV === "development"
  ? "local-development"
  : deploymentIdentity
    ? createHash("sha256").update(deploymentIdentity).digest("hex").slice(0, 32)
    : randomUUID();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_FAP_WEBAPP_RELEASE: webAppRelease,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "thumb.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
    ],
  },
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
