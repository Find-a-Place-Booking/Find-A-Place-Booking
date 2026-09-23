"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track } from "@vercel/analytics";

type EventData = Record<string, string | number | boolean>;

type Props = ComponentProps<typeof Link> & {
  eventName: string;
  eventData?: EventData;
};

export function TrackedLink({
  eventName,
  eventData,
  onClick,
  ...props
}: Props) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        track(eventName, eventData);
        onClick?.(event);
      }}
    />
  );
}
