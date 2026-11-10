import { NextRequest } from "next/server";
import { getPublishedListingBySlug } from "@/lib/public/listings";
import { mobileJson, mobileOptions } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export async function OPTIONS(request: NextRequest) {
  return mobileOptions(request);
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG.test(slug))
    return mobileJson(request, { error: "Invalid stay." }, 400);
  try {
    const stay = await getPublishedListingBySlug(slug);
    if (!stay) return mobileJson(request, { error: "Stay not found." }, 404);
    return mobileJson(request, {
      stay: {
        slug: stay.slug,
        name: stay.name,
        description: stay.description,
        location: stay.location,
        city: stay.city,
        state: stay.state,
        type: stay.type,
        sleeps: stay.sleeps,
        bedrooms: stay.bedrooms,
        baths: stay.baths,
        minNights: stay.minimumStayNights,
        checkIn: stay.checkIn,
        checkout: stay.checkout,
        startingNightlyUsd: stay.price,
        weekendNightlyUsd: stay.weekendPrice,
        hostName: stay.hostName,
        images: stay.images.slice(0, 12),
        amenities: stay.amenities,
        policies: stay.policies,
        cancellationPolicy: stay.cancellationPolicy,
        addOns: stay.addOns,
        rating: stay.rating,
        reviewCount: stay.reviewCount,
      },
    });
  } catch {
    return mobileJson(
      request,
      { error: "Stay details could not be loaded." },
      503,
    );
  }
}
