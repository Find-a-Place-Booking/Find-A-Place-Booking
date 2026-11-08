from pathlib import Path
from tempfile import TemporaryDirectory
import importlib.util

script = Path(__file__).parents[1] / 'apply_overlay.py'
spec = importlib.util.spec_from_file_location('overlay', script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

with TemporaryDirectory() as d:
    root = Path(d)
    for path, edits in mod.replacement_plans().items():
        file = root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text('\n\n'.join(before for before, _ in edits), encoding='utf-8')
    for rel in ['lib/public/discovery-categories.ts', 'lib/public/buffalo-river-discovery.ts', 'components/HostResourcesMenu.tsx',
                'components/HostResourcesMenu.module.css',
                'app/property-managers/page.tsx', 'app/property-managers/property-managers.module.css']:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text('test', encoding='utf-8')
    assert mod.apply(root, check_only=True) == 0
    assert mod.apply(root, check_only=False) == 0
    first = {p: (root / p).read_text() for p in mod.replacement_plans()}
    assert mod.apply(root, check_only=False) == 0
    second = {p: (root / p).read_text() for p in mod.replacement_plans()}
    assert first == second, 'overlay is not idempotent'
    for path, edits in mod.replacement_plans().items():
        for before, after in edits:
            assert after in second[path], f'missing patch in {path}'
    # Changed anchors abort without partial writes.
    bad = root / 'components/Header.tsx'
    bad.write_text('unrelated source code')
    before_snapshot = {p: (root / p).read_text() for p in mod.replacement_plans()}
    assert mod.apply(root, check_only=False) == 1
    after_snapshot = {p: (root / p).read_text() for p in mod.replacement_plans()}
    assert before_snapshot == after_snapshot

print('overlay preflight, application, idempotence and all-or-nothing checks passed')
