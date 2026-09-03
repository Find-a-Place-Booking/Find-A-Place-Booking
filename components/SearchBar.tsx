export function SearchBar({
  compact = false,
  where = "",
  checkin = "",
  checkout = "",
  guests = "2"
}: {
  compact?: boolean;
  where?: string;
  checkin?: string;
  checkout?: string;
  guests?: string;
}) {
  return (
    <form action="/stays" className={`search-panel ${compact ? "search-compact" : ""}`}>
      <label><span>Where</span><input name="where" defaultValue={where} placeholder="Hot Springs, Branson, Lake Ouachita…" aria-label="Destination" autoComplete="off" /></label>
      <label><span>Check in</span><input name="checkin" type="date" defaultValue={checkin} /></label>
      <label><span>Check out</span><input name="checkout" type="date" defaultValue={checkout} /></label>
      <label><span>Guests</span><select name="guests" defaultValue={guests}><option value="2">2</option><option value="4">4</option><option value="6">6</option><option value="8">8</option><option value="10">10+</option></select></label>
      <button className="button search-button" type="submit">Find available stays <span>→</span></button>
    </form>
  );
}
