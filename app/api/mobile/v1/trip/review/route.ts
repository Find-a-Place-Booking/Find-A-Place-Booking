import { NextRequest } from "next/server";
import { mobileTripBridge } from "@/lib/mobile/trip-bridge";
import { mobileOptions } from "@/lib/mobile/http";
import { GET as webGET, POST as webPOST } from "@/app/api/trip/review/route";
export async function OPTIONS(r: NextRequest) {
  return mobileOptions(r);
}
export async function POST(r: NextRequest) {
  return mobileTripBridge(r, webPOST);
}

export async function GET(r: NextRequest) {
  return mobileTripBridge(r, webGET);
}
