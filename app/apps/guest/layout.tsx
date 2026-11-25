import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WebAppUpdates } from "@/components/webapp/WebAppUpdates";

// The existing build preparation preserves the original Find A Place seal,
// applying the guest forest-green variant at both installed-icon sizes.
export const metadata: Metadata = {
  icons: {
    apple: [{ url: "/webapps/icons/guest-192.png?v=20261123-dualcolor", sizes: "192x192", type: "image/png" }],
    icon: [{ url: "/webapps/icons/guest-192.png?v=20261123-dualcolor", sizes: "192x192", type: "image/png" }],
  },
};
export default function GuestAppLayout({ children }: { children: ReactNode }) {
  return <><WebAppUpdates app="guest" />{children}</>;
}
