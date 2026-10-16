#!/usr/bin/env python3
"""Package the public demo without a Moonraker connection or provider settings."""
import argparse
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def build(output):
    output.mkdir(parents=True, exist_ok=True)
    page = (ROOT / "web/index.html").read_text()
    mode = 'const demo = new URLSearchParams(location.search).has("demo");'
    if page.count(mode) != 1:
        raise ValueError("Demo mode declaration changed; review the preview builder")
    # Keep the public artifact in demo mode even without a query string.
    (output / "index.html").write_text(page.replace(mode, "const demo = true;"))
    for name in ("guide.js", "spectrum.js", "trident.glb", "trident.provenance.json"):
        shutil.copyfile(ROOT / "web" / name, output / name)
    shutil.copytree(ROOT / "docs/licenses", output / "licenses", dirs_exist_ok=True)
    (output / ".nojekyll").touch()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    build(parser.parse_args().output)
