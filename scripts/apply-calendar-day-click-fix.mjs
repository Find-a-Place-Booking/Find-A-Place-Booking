import fs from "node:fs";

const path = "app/host/calendar/page.tsx";

function fail(message) {
  throw new Error(message);
}

function replaceOnce(content, before, after, label) {
  const index = content.indexOf(before);
  if (index < 0) fail(`Missing ${label}`);
  if (content.indexOf(before, index + before.length) >= 0) {
    fail(`Multiple ${label} markers found`);
  }

  return (
    content.slice(0, index) +
    after +
    content.slice(index + before.length)
  );
}

if (!fs.existsSync(path)) {
  fail("Run this from the Find A Place Booking repository root.");
}

const original = fs.readFileSync(path, "utf8");
let content = original;

try {
  const integrationImport =
    'import { CalendarIntegrationPanel } from "@/components/CalendarIntegrationPanel";';
  const boardImport =
    'import { HostCalendarBoard } from "@/components/HostCalendarBoard";';

  if (!content.includes(boardImport)) {
    content = replaceOnce(
      content,
      integrationImport,
      `${integrationImport}\n${boardImport}`,
      "CalendarIntegrationPanel import",
    );
  }

  if (!content.includes("<HostCalendarBoard")) {
    const calendarStart = content.indexOf(
      '        <section className={styles.calendarPanel}>',
    );
    const integrationStart = content.indexOf(
      "        <CalendarIntegrationPanel",
      calendarStart,
    );

    if (calendarStart < 0 || integrationStart < 0) {
      fail("Could not find the original static calendar markup.");
    }

    const board = `        <HostCalendarBoard
          unitId={selected.unitId}
          month={workspace.month}
          monthLabel={workspace.monthLabel}
          unitLabel={targetLabel(selected)}
          previousMonthHref={\`/host/calendar?unit=\${encodeURIComponent(selected.unitId)}&month=\${workspace.previousMonth}\`}
          nextMonthHref={\`/host/calendar?unit=\${encodeURIComponent(selected.unitId)}&month=\${workspace.nextMonth}\`}
          days={workspace.days}
          blocks={activeBlocks}
          connections={workspace.connections}
          pricingDays={workspace.pricingDays}
        />

`;

    content =
      content.slice(0, calendarStart) +
      board +
      content.slice(integrationStart);
  }

  if (content.includes("<h2>Block dates</h2>")) {
    const asideStart = content.indexOf(
      '        <aside className={styles.side}>',
    );
    const manualStart = content.indexOf(
      '          <section className={styles.sidePanel}>',
      asideStart,
    );
    const icalStart = content.indexOf(
      '          <section id="ical-connections" className={styles.sidePanel}>',
      manualStart,
    );

    if (asideStart < 0 || manualStart < 0 || icalStart < 0) {
      fail("Could not find the original manual block panel.");
    }

    content =
      content.slice(0, manualStart) +
      content.slice(icalStart);
  }

  if (!content.includes("<HostCalendarBoard")) {
    fail("Clickable calendar was not installed.");
  }

  if (content.includes('<section className={styles.calendarPanel}>')) {
    fail("Old static calendar is still present.");
  }

  if (content.includes("<h2>Block dates</h2>")) {
    fail("Old buried manual block panel is still present.");
  }

  if (!content.includes('id="ical-connections"')) {
    fail("Calendar integration section was accidentally removed.");
  }

  fs.writeFileSync(path, content, "utf8");

  console.log("Calendar page updated.");
  console.log("Verified:");
  console.log("  - clickable HostCalendarBoard installed");
  console.log("  - old static calendar removed");
  console.log("  - old buried Block dates panel removed");
  console.log("  - iCal/integration section preserved");
} catch (error) {
  fs.writeFileSync(path, original, "utf8");
  throw error;
}
