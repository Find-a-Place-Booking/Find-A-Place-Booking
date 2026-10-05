import { createAdminClient } from "@/lib/supabase/admin";

export type ResNexusSafetyRange = {
  start: string;
  end: string;
};

type ResNexusCalendarState = {
  has_resnexus?: boolean;
  ready?: boolean;
  reason?: string | null;
  unresolved_ranges?: Array<{
    start?: string | null;
    end?: string | null;
  }>;
};

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Host calendar display helper.
 *
 * Guest availability already consumes these ResNexus unresolved/safety ranges.
 * This helper intentionally does NOT alter guest availability or persist new
 * calendar blocks. It only lets the authenticated host calendar render the
 * same unavailable nights after getCalendarWorkspace has already verified
 * that the selected unit belongs to the signed-in host.
 */
export async function getResNexusSafetyRangesForHostCalendar(input: {
  unitId: string;
  startDate: string;
  endDate: string;
}): Promise<ResNexusSafetyRange[]> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc(
    "resnexus_unit_calendar_state",
    {
      target_unit_id: input.unitId,
      target_check_in: input.startDate,
      target_check_out: input.endDate,
    },
  );

  if (error) {
    console.error("[host calendar resnexus safety ranges]", {
      unitId: input.unitId,
      code: error.code,
      message: error.message,
    });
    return [];
  }

  const state = (data ?? {}) as ResNexusCalendarState;

  if (!state.has_resnexus) return [];

  const seen = new Set<string>();
  const ranges: ResNexusSafetyRange[] = [];

  for (const range of state.unresolved_ranges ?? []) {
    if (!validDate(range.start) || !validDate(range.end)) continue;
    if (range.end <= range.start) continue;

    const key = `${range.start}:${range.end}`;
    if (seen.has(key)) continue;
    seen.add(key);

    ranges.push({
      start: range.start,
      end: range.end,
    });
  }

  return ranges.sort((a, b) =>
    a.start === b.start
      ? a.end.localeCompare(b.end)
      : a.start.localeCompare(b.start),
  );
}
