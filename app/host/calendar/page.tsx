import { DashboardShell } from "@/components/DashboardShell";

function monthGrid() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  return { label: first.toLocaleDateString("en-US", { month: "long", year: "numeric" }), blanks: first.getDay(), days: Array.from({length: count}, (_, index) => index + 1) };
}

export default function CalendarPage(){
  const month = monthGrid();
  return <DashboardShell active="Calendar" title="Calendar"><div className="dash-toolbar"><p>One calendar for Find A Place bookings, owner blocks and connected channel availability.</p><div><button className="button button-small button-quiet" disabled>Today</button><button className="button button-small" disabled>+ Block dates</button></div></div><section className="panel calendar-board"><div className="cal-top"><strong>{month.label}</strong><div><button disabled>‹</button><button disabled>›</button></div></div><div className="cal-week"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div className="cal-grid">{Array.from({length: month.blanks}, (_, index)=><div key={`blank-${index}`} />)}{month.days.map((day)=><div key={day}><b>{day}</b></div>)}</div><div className="panel-empty calendar-empty"><strong>No property calendar connected.</strong><span>Availability, owner blocks and channel reservations will appear after a property and calendar connection are saved.</span></div></section></DashboardShell>;
}
