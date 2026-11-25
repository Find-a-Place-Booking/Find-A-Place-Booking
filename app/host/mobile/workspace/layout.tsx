import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WebAppUpdates } from "@/components/webapp/WebAppUpdates";

// The existing build preparation generates the white host variant.
export const metadata: Metadata = {
  icons: {
    apple: [{ url: "/webapps/icons/host-192.png?v=20261125-white", sizes: "192x192", type: "image/png" }],
    icon: [{ url: "/webapps/icons/host-192.png?v=20261125-white", sizes: "192x192", type: "image/png" }],
  },
};
export default function HostWorkspaceLayout({ children }: { children: ReactNode }) {
  return <><WebAppUpdates app="host" />{children}</>;
}
