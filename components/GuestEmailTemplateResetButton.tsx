"use client";

import { useState } from "react";

type Props = {
  subject: string;
  body: string;
  defaultDayOffset: number;
  defaultSendTime?: string;
};

/** Restore only the current form's default message and timing. Nothing is saved until Save is clicked. */
export function GuestEmailTemplateResetButton({
  subject,
  body,
  defaultDayOffset,
  defaultSendTime = "10:00",
}: Props) {
  const [restored, setRestored] = useState(false);

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
      <button
        className="button button-small button-quiet"
        type="button"
        onClick={(event) => {
          if (!window.confirm("Restore this email's original template and send timing? Your changes are not saved until you select Save email setup.")) return;
          const form = event.currentTarget.closest("form");
          if (!form) return;

          const fill = (name: string, value: string) => {
            const element = form.elements.namedItem(name);
            if (
              element instanceof HTMLInputElement ||
              element instanceof HTMLTextAreaElement ||
              element instanceof HTMLSelectElement
            ) {
              element.value = value;
              element.dispatchEvent(new Event("input", { bubbles: true }));
              element.dispatchEvent(new Event("change", { bubbles: true }));
            }
          };

          fill("subject_template", subject);
          fill("body_template", body);
          fill("day_offset", String(defaultDayOffset));
          fill("send_time_local", defaultSendTime);

          // Open wording editor so the host can verify changes before saving.
          const customizer = form.querySelector("details");
          const wording = Array.from(form.querySelectorAll("details")).find((detail) =>
            detail.querySelector('[name="body_template"]'),
          );
          if (wording) wording.open = true;
          else if (customizer) customizer.open = true;

          setRestored(true);
        }}
      >
        Restore original template &amp; timing
      </button>
      {restored ? (
        <small role="status" style={{ color: "#315f4b" }}>
          Original template restored in this form only. Review it and select Save email setup to keep it.
        </small>
      ) : (
        <small>Does not change the other email or save anything until you choose Save.</small>
      )}
    </div>
  );
}
