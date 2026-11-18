import type { ReactNode } from "react";
import { GuestSecurityDepositBanner } from "@/components/GuestSecurityDepositBanner";

export default function TripConfirmationLayout({ children }: { children: ReactNode }) {
  return <><GuestSecurityDepositBanner />{children}</>;
}
