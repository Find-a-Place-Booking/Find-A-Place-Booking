"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type CalendarUnitOption = {
  unitId: string;
  label: string;
};

type Props = {
  className?: string;
  selectedUnitId: string;
  month: string;
  targets: CalendarUnitOption[];
};

export function CalendarUnitSelector({
  className,
  selectedUnitId,
  month,
  targets,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(selectedUnitId);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValue(selectedUnitId);
  }, [selectedUnitId]);

  function switchCalendar(nextUnitId: string) {
    if (!nextUnitId || nextUnitId === selectedUnitId) return;

    setValue(nextUnitId);

    const params = new URLSearchParams();
    params.set("unit", nextUnitId);
    params.set("month", month);

    startTransition(() => {
      router.push(`/host/calendar?${params.toString()}`, {
        scroll: false,
      });
    });
  }

  return (
    <div className={className} aria-busy={isPending}>
      <label>
        <span>Property / unit</span>
        <select
          name="unit"
          value={value}
          disabled={isPending}
          onChange={(event) => switchCalendar(event.target.value)}
        >
          {targets.map((target) => (
            <option value={target.unitId} key={target.unitId}>
              {target.label}
            </option>
          ))}
        </select>
      </label>

      {isPending ? <small className="muted">Loading calendar…</small> : null}
    </div>
  );
}
