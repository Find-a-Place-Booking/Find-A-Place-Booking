import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export async function HostRecoveryAlert() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return null;

  const { count, error } = await supabase
    .from("booking_recovery_opportunities")
    .select("id", { count: "exact", head: true })
    .eq("status", "OPEN");

  if (error || !count) return null;

  return (
    <div className="host-alert">
      <div>
        <span>!</span>
        <p>
          <strong>
            {count} missed booking {count === 1 ? "opportunity is" : "opportunities are"} waiting.
          </strong>{" "}
          Travelers priced open dates but did not finish booking. Review whether
          you want to send a limited discount offer.
        </p>
      </div>
      <Link href="/host/recovery">Review →</Link>
    </div>
  );
}
