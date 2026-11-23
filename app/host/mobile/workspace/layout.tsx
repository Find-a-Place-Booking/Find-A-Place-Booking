import type { Metadata } from "next";
import type { ReactNode } from "react";

// The existing build preparation preserves the original Find A Place seal,
// applying the host burnt-copper variant at both installed-icon sizes.
export const metadata: Metadata = {
  icons: {
    apple: [{ url: "/webapps/icons/host-192.png?v=20261123-dualcolor", sizes: "192x192", type: "image/png" }],
    icon: [{ url: "/webapps/icons/host-192.png?v=20261123-dualcolor", sizes: "192x192", type: "image/png" }],
  },
};
export default function HostWorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
