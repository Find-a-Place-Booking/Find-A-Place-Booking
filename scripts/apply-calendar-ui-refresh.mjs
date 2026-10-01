import fs from "node:fs";

const pagePath = "app/host/calendar/page.tsx";

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(content, before, after, label) {
  const first = content.indexOf(before);
  if (first < 0) fail(`Patch marker not found: ${label}`);
  if (content.indexOf(before, first + before.length) >= 0) {
    fail(`Patch marker is not unique: ${label}`);
  }
  return content.slice(0, first) + after + content.slice(first + before.length);
}

function main() {
  if (!fs.existsSync(pagePath)) {
    fail("Run this from the Find A Place Booking repository root.");
  }

  const original = read(pagePath);
  let c = original;

  try {
    c = replaceOnce(
      c,
      'import { CalendarIntegrationPanel } from "@/components/CalendarIntegrationPanel";',
      'import { CalendarIntegrationPanel } from "@/components/CalendarIntegrationPanel";\nimport { HostCalendarBoard } from "@/components/HostCalendarBoard";',
      "HostCalendarBoard import",
    );

    const helpersStart = c.indexOf(
      'const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];',
    );
    const displayDateStart = c.indexOf(
      "function displayDate(value: string) {",
      helpersStart,
    );

    if (helpersStart < 0 || displayDateStart < 0) {
      fail("Old calendar helper block could not be located.");
    }

    c =
      c.slice(0, helpersStart) +
      c.slice(displayDateStart);

    c = c.replace("  calendarMoney,\n", "");
    c = c.replace("  type AvailabilityBlockRecord,\n", "");
    c = c.replace("  cancelOwnerBlock,\n", "");
    c = c.replace("  createOwnerBlock,\n", "");

    const mapStart = c.indexOf(
      "  const pricingByDate = new Map(",
    );
    const currentMonthStart = c.indexOf(
      "  const currentMonthDays",
      mapStart,
    );

    if (mapStart < 0 || currentMonthStart < 0) {
      fail("Old calendar date-map block could not be located.");
    }

    c =
      c.slice(0, mapStart) +
      c.slice(currentMonthStart);

    c = c.replace(
      '\n  const ownerBlocks = activeBlocks.filter((block) => block.block_type === "OWNER_BLOCK");',
      "",
    );

    const calendarStart =
      c.indexOf('        <section className={styles.calendarPanel}>');
    const integrationStart =
      c.indexOf("        <CalendarIntegrationPanel", calendarStart);

    if (calendarStart < 0 || integrationStart < 0) {
      fail("Current calendar markup could not be located.");
    }

    const board = `        <HostCalendarBoard
          unitId={selected.unitId}
          month={workspace.month}
          monthLabel={workspace.monthLabel}
          unitLabel={targetLabel(selected)}
          previousMonthHref={\`/host/calendar?unit=\${encodeURIComponent(
            selected.unitId,
          )}&month=\${workspace.previousMonth}\`}
          nextMonthHref={\`/host/calendar?unit=\${encodeURIComponent(
            selected.unitId,
          )}&month=\${workspace.nextMonth}\`}
          days={workspace.days}
          blocks={activeBlocks}
          connections={workspace.connections}
          pricingDays={workspace.pricingDays}
        />

`;

    c =
      c.slice(0, calendarStart) +
      board +
      c.slice(integrationStart);

    const asideIndex =
      c.indexOf('        <aside className={styles.side}>');
    const manualPanelStart =
      c.indexOf('          <section className={styles.sidePanel}>', asideIndex);
    const icalPanelStart =
      c.indexOf(
        '          <section id="ical-connections" className={styles.sidePanel}>',
        manualPanelStart,
      );

    if (
      asideIndex < 0 ||
      manualPanelStart < 0 ||
      icalPanelStart < 0
    ) {
      fail("Buried manual block panel could not be located.");
    }

    c =
      c.slice(0, manualPanelStart) +
      c.slice(icalPanelStart);

    write(pagePath, c);
  } catch (error) {
    write(pagePath, original);
    throw error;
  }

  console.log("Calendar UI refresh applied.");
  console.log("No routes, RPCs, sync logic, or booking logic were changed.");
  console.log("Run npm run typecheck && npm run build before deployment.");
}

main();
