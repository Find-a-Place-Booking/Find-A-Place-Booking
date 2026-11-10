import { NextRequest } from "next/server";
import { mobileTripBridge } from "@/lib/mobile/trip-bridge";
import { mobileOptions } from "@/lib/mobile/http";
import { POST as webPOST } from "@/app/api/trip/lookup/route";
export async function OPTIONS(r: NextRequest) {
  return mobileOptions(r);
}
export async function POST(r: NextRequest) {
  return mobileTripBridge(r, webPOST);
}
