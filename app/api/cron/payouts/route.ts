import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    disabled: true,
    model: "DIRECT_CHARGE",
    message:
      "Find A Place no longer schedules host bank transfers. Stripe manages the connected host balance and bank-deposit timing.",
  });
}
