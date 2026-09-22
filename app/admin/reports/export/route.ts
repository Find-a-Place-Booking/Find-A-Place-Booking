import { NextRequest } from "next/server";

import { getAdminReport } from "@/lib/admin/reports";
import { csvLine } from "@/lib/reports/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const report = await getAdminReport({
    from: request.nextUrl.searchParams.get("from"),
    to: request.nextUrl.searchParams.get("to"),
    organizationId: request.nextUrl.searchParams.get("organization"),
    propertyId: request.nextUrl.searchParams.get("property"),
  });

  const lines = [
    csvLine([
      "Confirmation",
      "Host organization",
      "Property",
      "Guest",
      "Check in",
      "Check out",
      "Reservation status",
      "Payment status",
      "Guest paid",
      "Tax retained by FAP",
      "FAP commission",
      "Stripe processing",
      "Host net",
      "Refunded",
      "Currency",
    ]),
    ...report.rows.map((row) =>
      csvLine([
        row.confirmationCode,
        row.organizationName,
        row.propertyName,
        row.guestName,
        row.checkIn,
        row.checkOut,
        row.status,
        row.paymentStatus,
        (row.guestPaidCents / 100).toFixed(2),
        (row.taxCents / 100).toFixed(2),
        (row.commissionCents / 100).toFixed(2),
        (row.processingCents / 100).toFixed(2),
        (row.hostProceedsCents / 100).toFixed(2),
        (row.refundCents / 100).toFixed(2),
        row.currency,
      ]),
    ),
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="find-a-place-admin-report-${report.range.from}-to-${report.range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
