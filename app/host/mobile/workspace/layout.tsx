import type { Metadata } from "next";
import type { ReactNode } from "react";

// Separate Apple touch/home-screen icon for the host PWA.
export const metadata: Metadata = {
  icons: {
    apple: [{ url: "/webapps/icons/host-192.png?v=20261118-originalbrand", sizes: "192x192", type: "image/png" }],
    icon: [{ url: "/webapps/icons/host-192.png?v=20261118-originalbrand", sizes: "192x192", type: "image/png" }],
  },
};
export default function HostWorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
