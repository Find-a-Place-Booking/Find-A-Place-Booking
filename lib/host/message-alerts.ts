import { createClient } from "@/lib/supabase/server";

function isLegacyRequestMessage(body: string) {
  const value = body.trim();
  return (
    /^\[change request\]/i.test(value) ||
    /^change request:/i.test(value) ||
    /^i would like to request cancellation of this reservation/i.test(value) ||
    /^cancellation request (approved|declined)/i.test(value) ||
    /^cancellation approved without refund/i.test(value)
  );
}

export async function getHostMessageAlertCount() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  if (!profileId) return 0;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profileId)
    .eq("status", "ACTIVE");

  const organizationIds = (memberships ?? []).map(
    (row) => row.organization_id as string,
  );

  if (!organizationIds.length) return 0;

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id")
    .in("organization_id", organizationIds);

  const reservationIds = (reservations ?? []).map(
    (reservation) => reservation.id as string,
  );

  if (!reservationIds.length) return 0;

  const [messagesResult, cancellationsResult, changesResult] =
    await Promise.all([
      supabase
        .from("reservation_messages")
        .select("id,body")
        .in("reservation_id", reservationIds)
        .eq("sender_type", "GUEST")
        .is("read_by_host_at", null)
        .limit(100),
      supabase
        .from("reservation_cancellation_requests")
        .select("id", { count: "exact", head: true })
        .in("reservation_id", reservationIds)
        .eq("requested_by", "GUEST")
        .eq("status", "REQUESTED"),
      supabase
        .from("reservation_change_requests")
        .select("id", { count: "exact", head: true })
        .in("reservation_id", reservationIds)
        .eq("requested_by", "GUEST")
        .eq("status", "REQUESTED"),
    ]);

  const unreadMessages = (messagesResult.data ?? []).filter(
    (message) => !isLegacyRequestMessage(message.body ?? ""),
  ).length;

  return (
    unreadMessages +
    (cancellationsResult.count ?? 0) +
    (changesResult.count ?? 0)
  );
}
