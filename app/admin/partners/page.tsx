import { redirect } from "next/navigation";

/** The old host-by-host commission switch has been retired. */
export default function RetiredPartnerRatesPage() {
  redirect("/admin/hosts");
}
