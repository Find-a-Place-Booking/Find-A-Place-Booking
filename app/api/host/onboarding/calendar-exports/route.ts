import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const profileId = claims?.claims?.sub;

    if (!profileId) {
      return NextResponse.json(
        { error: "Sign in again to continue host setup." },
        { status: 401 },
      );
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id,created_at")
      .eq("profile_id", profileId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true });

    if (membershipError) {
      throw new Error("Unable to load the host organization.");
    }

    const organizationIds = (memberships ?? []).map(
      (row) => row.organization_id,
    );

    if (!organizationIds.length) {
      return NextResponse.json({ ok: true, ready: false, connections: [] });
    }

    const { data: draft, error: draftError } = await supabase
      .from("host_onboarding_drafts")
      .select(
        "organization_id,created_property_id,status,current_step,updated_at",
      )
      .in("organization_id", organizationIds)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftError) {
      throw new Error("Unable to load the current onboarding property.");
    }

    if (!draft?.created_property_id) {
      return NextResponse.json({
        ok: true,
        ready: false,
        status: draft?.status || null,
        connections: [],
      });
    }

    const [{ data: property }, { data: unit, error: unitError }] =
      await Promise.all([
        supabase
          .from("properties")
          .select("name")
          .eq("id", draft.created_property_id)
          .maybeSingle(),
        supabase
          .from("property_units")
          .select("id,slug")
          .eq("property_id", draft.created_property_id)
          .eq("is_primary", true)
          .maybeSingle(),
      ]);

    if (unitError || !unit?.id) {
      return NextResponse.json({
        ok: true,
        ready: false,
        status: draft.status,
        propertyName: property?.name || null,
        connections: [],
      });
    }

    const [connectionResult, tokenResult] = await Promise.all([
      supabase
        .from("calendar_connections")
        .select("id,provider,label,sync_status,last_success_at")
        .eq("unit_id", unit.id)
        .eq("is_active", true)
        .eq("connection_kind", "ICAL")
        .order("created_at", { ascending: true }),
      supabase
        .from("calendar_export_tokens")
        .select("exclude_connection_id,token")
        .eq("unit_id", unit.id)
        .eq("is_active", true),
    ]);

    if (connectionResult.error || tokenResult.error) {
      throw new Error("Unable to load the calendar return feeds.");
    }

    const tokenByConnection = new Map(
      (tokenResult.data ?? [])
        .filter((row) => row.exclude_connection_id && row.token)
        .map((row) => [String(row.exclude_connection_id), String(row.token)]),
    );

    const connections = (connectionResult.data ?? []).map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      label: connection.label,
      syncStatus: connection.sync_status,
      lastSuccessAt: connection.last_success_at,
      outboundToken: tokenByConnection.get(connection.id) || null,
    }));

    return NextResponse.json(
      {
        ok: true,
        ready: connections.length > 0,
        status: draft.status,
        currentStep: draft.current_step,
        propertyName: property?.name || null,
        unitSlug: unit.slug,
        connections,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("[onboarding calendar exports]", error);
    return NextResponse.json(
      { error: "Unable to load calendar return feeds right now." },
      { status: 500 },
    );
  }
}
