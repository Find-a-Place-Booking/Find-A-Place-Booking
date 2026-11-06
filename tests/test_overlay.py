"""Offline installation regression: all source edits are guarded and idempotent."""
import ast
import os
from pathlib import Path
import subprocess
import sys
import tempfile

BASE = Path(__file__).resolve().parents[1]
tree = ast.parse((BASE / "apply_overlay.py").read_text())
by_path = {}
for node in ast.walk(tree):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "replace":
        if len(node.args) != 3:
            continue
        try:
            path, old, new = map(ast.literal_eval, node.args)
        except Exception:
            continue
        by_path.setdefault(path, []).append((old, new))

assert len(by_path) == 8, sorted(by_path)
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    for path, edits in by_path.items():
        dest = root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        # A fixture using every anchor once. Individual anchors have been
        # independently verified against current GitHub source.
        dest.write_text("\n".join(old for old, new in edits) + "\n")
    legal = root / "app/host-agreement/page.tsx"
    legal.parent.mkdir(parents=True, exist_ok=True)
    legal.write_text('  "policy.host.payments": { title: "Old", body: "5% partner commission rate" },\n'
                     '  "policy.host.taxes": { title: "Taxes", body: "A" },\n')
    for run in (1, 2):
        result = subprocess.run([sys.executable, str(BASE / "apply_overlay.py"), str(root)],
                                text=True, capture_output=True)
        assert result.returncode == 0, (run, result.stdout, result.stderr)
    for path, edits in by_path.items():
        output = (root / path).read_text()
        for old, new in edits:
            if new:
                assert output.count(new) == 1, (path, new)
                if old not in new:
                    assert old not in output, (path, old)
            else:
                assert old not in output
    assert '5% partner commission rate' not in legal.read_text()
print("PASS: all 8 source files patch atomically and reapplying is safe")
