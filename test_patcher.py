from pathlib import Path
import subprocess
import tempfile

OVERLAY = Path(__file__).resolve().parent

files = {
  'app/about/page.tsx': '''import { DeferredBackgroundVideo } from "@/components/DeferredBackgroundVideo";
        <section className={styles.partnerMapSection}>
          <div className="shell">
            <iframe src="https://www.google.com/maps/d/u/0/embed?mid=1znr--DZK2UInog1toBsweyTKqHtFPnU" />
          </div>
        </section>

        <section className="host-cta">''',
  'app/page.tsx': '''import { DeferredStayMap } from "@/components/DeferredStayMap";
        <section className="home-map-section">
           <DeferredStayMap stays={mapStays} className="home-stay-map" />
        </section>
        <section className="host-cta">
        </section>
      </main>

      <Footer />''',
  'components/SearchBar.tsx': '''  guests = "2",
  guests?: string;
            guests: String(data.get("guests") || "2"),
        <label>
          <span>Check in</span>''',
  'app/stays/page.tsx': '''import { propertyMatchesDestination } from "@/data/catalog";
    guests?: string;
    filter?: string;
  const guestCount = Number.parseInt(guests, 10) || 2;
  const properties = allProperties.filter(
    (property) =>
      propertyMatchesDestination(property, where) &&
      property.sleeps >= guestCount,
  );
                guests={guests}
              />
              <p>{summary.body}</p>''',
  'app/layout.tsx': '''import "./guest-feedback-fixes.css";''',
  'components/StayMap.tsx': '''function stayImage(stay: StayMapItem) {
  return (
    stay.image ||
    `/api/public/stay-cover/${encodeURIComponent(stay.slug)}`
  );
}''',
}
with tempfile.TemporaryDirectory() as temp:
  root = Path(temp)
  for name, content in files.items():
    dest = root / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content)
  command = ['python', str(OVERLAY / 'apply_overlay.py'), str(root)]
  run = subprocess.run(command, capture_output=True, text=True)
  assert run.returncode == 0, f'{run.stdout}\n{run.stderr}'
  assert 'app/page.tsx' in run.stdout
  home = (root / 'app/page.tsx').read_text()
  assert home.count('home-map-section') == 1
  assert home.index('home-map-section') < home.index('<FindAPlacePartnerMap')
  assert home.count('<FindAPlacePartnerMap') == 1
  about = (root / 'app/about/page.tsx').read_text()
  assert about.count('<FindAPlacePartnerMap') == 1
  assert (root / 'components/FindAPlacePartnerMap.tsx').exists()
  assert 'name="radius"' in (root / 'components/SearchBar.tsx').read_text()
  assert 'searchPublishedStaysNearby(allProperties, where, radius)' in (root / 'app/stays/page.tsx').read_text()
  assert 'nearby-search-controls.css' in (root / 'app/layout.tsx').read_text()
  assert 'return `/api/public/stay-cover/' in (root / 'components/StayMap.tsx').read_text()
  run2 = subprocess.run(command, capture_output=True, text=True)
  assert run2.returncode == 0, f'{run2.stdout}\n{run2.stderr}'
  assert 'Already applied' in run2.stdout
  print('PASS: Guarded overlay applies exactly once; existing Mapbox map remains in place; About map reused on Home.')
